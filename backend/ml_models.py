"""
ml_models.py — Data loading, models, training & evaluation for CEFR classification
==================================================================================
รัน:  py -3.11 backend/ml_models.py            (train ทุกอย่าง -> backend/artifacts/)
      py -3.11 backend/ml_models.py --quick    (ข้อมูลน้อย/epoch น้อย ไว้เช็คว่า pipeline รันผ่าน)

Sections
  [1] DATA LOADING          รวม dataset ประโยค 3 ชุด + บทความ + wordlist
  [2] FEATURE CACHE         parse ด้วย spaCy ครั้งเดียวแล้ว cache
  [3] METRICS               accuracy, macro-F1, adjacent acc, QWK, MAE, confusion
  [4] NEURAL MODEL          CEFRNet = BiLSTM (word) / Byte-LSTM / Hybrid (BiLSTM + features) ในคลาสเดียว
  [5] NEURAL TRAINING       train loop + early stopping + learning curve
  [6] WORD LEVEL            โมเดลระดับคำ (ใช้กับคำที่ไม่อยู่ใน wordlist = OOV)
  [7] RANDOM FOREST         RF ประโยค / บทความ / breakdown (Vocabulary, Verb form, Clause)
  [8] DOCUMENT LEVEL        hierarchical: sentence encoder -> pooling -> classifier
  [9] ABLATION              lemma vs raw vs NER mask, lemma lookup vs surface, ตัดกลุ่ม feature
  [10] PREDICTOR            โหลดโมเดลทั้งหมดสำหรับ app.py
  [11] MAIN
"""
import os
import re
import io
import sys
import json
import math
import time
import copy
import argparse
from collections import Counter

import numpy as np
import pandas as pd
import joblib
import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, RandomizedSearchCV, PredefinedSplit
from sklearn.metrics import (accuracy_score, f1_score, cohen_kappa_score, confusion_matrix,
                             precision_recall_fscore_support)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nlp_core as nc  # noqa: E402

ART = nc.ART_DIR
SEED = 42
MODEL_NAMES = {
    "rf": "Random Forest (Linguistic Features)",
    "rf_tfidf": "Random Forest (TF-IDF Only)",
    "bilstm": "Word BiLSTM (Raw Only)",
    "hybrid": "Word BiLSTM + Features (Hybrid)",
    "bytelstm": "Byte-LSTM (Bytes Only)",
    "bytehybrid": "Byte-LSTM + Features",
}
torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


# =============================================================================
# [1] DATA LOADING
# =============================================================================
def detok(s):
    """CEFR-SP เป็นข้อความที่ tokenize แล้ว ('Do n't wear khakis .') -> คืนรูปปกติ ('Don't wear khakis.')
    เพื่อให้เหมือนข้อความที่ผู้ใช้พิมพ์จริง"""
    s = re.sub(r" (n't|'s|'re|'ve|'ll|'d|'m)\b", r"\1", s)
    s = s.replace("`` ", '"').replace(" ''", '"')
    s = re.sub(r" ([.,!?;:%)\]}])", r"\1", s)
    s = re.sub(r"([(\[{$]) ", r"\1", s)
    return s.strip()


def load_sentence_data():
    """รวม CEFR-SP (SCoRE, WikiAuto) + ReadMe เป็น DataFrame: text, label(1..6), source, split"""
    rows = []
    for name in ("SCoRE", "Wikiauto"):
        for split in ("train", "dev", "test"):
            path = os.path.join(nc.DATA_DIR, f"CEFR-SP_{name}_{split}.txt")
            with open(path, encoding="utf-8") as f:
                for line in f:
                    p = line.rstrip("\n").split("\t")
                    if len(p) < 3:
                        continue
                    a, b = int(p[1]), int(p[2])
                    # 2 ผู้ annotate -> ค่าเฉลี่ยปัดขึ้น
                    rows.append({"text": detok(p[0]), "label": math.ceil((a + b) / 2), "source": name, "split": split})
    for split, fn in (("train", "train"), ("dev", "val"), ("test", "test")):
        d = pd.read_excel(os.path.join(nc.DATA_DIR, f"readme_en_{fn}.xlsx"))
        for s, r in zip(d["Sentence"], d["Rating"]):
            if isinstance(s, str) and s.strip() and not pd.isna(r) and 1 <= int(r) <= 6:
                rows.append({"text": " ".join(s.split()), "label": int(r), "source": "ReadMe", "split": split})
    df = pd.DataFrame(rows)
    return df[df["text"].str.len() > 2].reset_index(drop=True)


def load_doc_data():
    """cefr_leveled_texts.csv -> แบ่ง stratified 70/15/15"""
    d = pd.read_csv(os.path.join(nc.DATA_DIR, "cefr_leveled_texts.csv"))
    d = d[d["label"].isin(nc.LEVELS)].reset_index(drop=True)
    d["label"] = d["label"].map(lambda l: nc.LEVELS.index(l) + 1)
    idx = np.arange(len(d))
    tr, rest = train_test_split(idx, test_size=0.30, stratify=d["label"], random_state=SEED)
    dv, te = train_test_split(rest, test_size=0.50, stratify=d["label"].iloc[rest], random_state=SEED)
    d["split"] = "train"
    d.loc[dv, "split"] = "dev"
    d.loc[te, "split"] = "test"
    return d


def dataset_stats(sdf, ddf):
    def table(df):
        return {s: {nc.LEVELS[k - 1]: int(((df["split"] == s) & (df["label"] == k)).sum()) for k in range(1, 7)}
                for s in ("train", "dev", "test")}
    return {"sentence": table(sdf), "document": table(ddf),
            "sentence_sources": sdf.groupby("source").size().to_dict(),
            "doc_words_mean": float(ddf["text"].str.split().str.len().mean())}


# =============================================================================
# [2] FEATURE CACHE
# =============================================================================
def build_cache(quick=False, rebuild=False):
    path = os.path.join(ART, "cache_quick.pkl" if quick else "cache.pkl")
    if os.path.exists(path) and not rebuild:
        log("load cache", path)
        return joblib.load(path)
    sdf, ddf = load_sentence_data(), load_doc_data()
    if quick:
        sdf = pd.concat([g.sample(min(len(g), 400), random_state=SEED) for _, g in sdf.groupby("split")]).reset_index(drop=True)
        ddf = pd.concat([g.sample(min(len(g), 60), random_state=SEED) for _, g in ddf.groupby("split")]).reset_index(drop=True)
    nlp = nc.get_nlp()

    log(f"parsing {len(sdf)} sentences ...")
    sents = []
    for i, doc in enumerate(nlp.pipe(sdf["text"], batch_size=256)):
        span = doc[:]
        u = nc.sentence_unit(span)
        sents.append({"text": u["text"], "raw": u["raw"], "lemma": u["lemma"], "ner": u["ner"], "feats": u["feats"],
                      # ablation: vocab feature ที่ lookup ด้วยรูปคำเดิม (ไม่ lemma)
                      "feats_surface": nc.sentence_features(span, verb_forms=u["verb_forms"],
                                                            clause_info=u["clauses"], use_lemma=False)})
        if (i + 1) % 2000 == 0:
            log(f"  {i + 1}/{len(sdf)}")

    log(f"parsing {len(ddf)} documents ...")
    docs, lemma_pos = [], Counter()
    for i, doc in enumerate(nlp.pipe(ddf["text"], batch_size=16)):
        du = nc.doc_unit(doc)
        docs.append({"sents": [{"text": u["text"], "raw": u["raw"], "ner": u["ner"], "lemma": u["lemma"],
                                "feats": u["feats"]} for u in du["units"]],
                     "doc_feats": du["doc_feats"]})
        for t in doc:  # เก็บ POS ที่พบบ่อยของแต่ละ lemma -> ใช้สร้างตัวลวงในควิซ
            if t.is_alpha and t.pos_ in nc.CONTENT_POS and not nc.is_name_token(t):
                lemma_pos[(t.lemma_.lower(), t.pos_)] += 1
        if (i + 1) % 200 == 0:
            log(f"  {i + 1}/{len(ddf)}")

    best_pos = {}
    for (lem, pos), c in lemma_pos.most_common():
        if c >= 2 and lem not in best_pos:
            best_pos[lem] = pos
    with open(os.path.join(ART, "lemma_pos.json"), "w", encoding="utf-8") as f:
        json.dump(best_pos, f)

    cache = {"sdf": sdf, "ddf": ddf, "sents": sents, "docs": docs}
    joblib.dump(cache, path)
    return cache


# =============================================================================
# [3] METRICS
# =============================================================================
def evaluate(y, pred):
    """metrics สำหรับ label ที่มีลำดับ (ordinal) — y, pred เป็น class 0..5"""
    y, pred = np.asarray(y), np.asarray(pred)
    present = sorted(set(y.tolist()))
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=list(range(6)), zero_division=0)
    return {
        "accuracy": float(accuracy_score(y, pred)),
        "macro_f1": float(f1_score(y, pred, labels=present, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y, pred, average="weighted", zero_division=0)),
        "adjacent_acc": float(np.mean(np.abs(y - pred) <= 1)),
        "qwk": float(cohen_kappa_score(y, pred, weights="quadratic")),
        "mae": float(np.mean(np.abs(y - pred))),
        "confusion": confusion_matrix(y, pred, labels=list(range(6))).tolist(),
        "per_class": [{"level": nc.LEVELS[k], "precision": float(p[k]), "recall": float(r[k]),
                       "f1": float(f[k]), "support": int(s[k])} for k in range(6)],
        "n": int(len(y)),
    }


def sel_score(m):
    """คะแนนที่ใช้เลือกโมเดล/hyperparameter บน dev set"""
    return 0.5 * m["macro_f1"] + 0.5 * m["qwk"]


def file_mb(path):
    return round(os.path.getsize(path) / 1e6, 2) if os.path.exists(path) else None


# =============================================================================
# [4] NEURAL MODEL — CEFRNet (BiLSTM / Byte-LSTM / Hybrid ใช้คลาสเดียวกัน)
# =============================================================================
class CEFRNet(nn.Module):
    """
    ids ──Embedding──BiLSTM(2 ชั้น)──┬─ attention pooling ─┐
                                      └─ max pooling ──────┼─ concat ─ (Hybrid: + MLP(features)) ─ Linear -> 6 คลาส
    - Word BiLSTM : ids = คำ (embedding init จาก spaCy vectors 300d)
    - Byte-LSTM   : ids = UTF-8 bytes (vocab 258) ไม่ต้อง tokenize ไม่มี OOV
    - Hybrid      : Word BiLSTM + linguistic features (tense, clause, vocab level ...)
    """

    def __init__(self, vocab_size, emb_dim=300, hidden=128, n_feats=0, n_classes=6, layers=2, dropout=0.3):
        super().__init__()
        self.emb = nn.Embedding(vocab_size, emb_dim, padding_idx=0)
        self.emb_drop = nn.Dropout(0.2)
        self.lstm = nn.LSTM(emb_dim, hidden, num_layers=layers, bidirectional=True, batch_first=True,
                            dropout=dropout if layers > 1 else 0.0)
        self.att = nn.Linear(2 * hidden, 1)
        self.n_feats = n_feats
        if n_feats:
            self.feat = nn.Sequential(nn.Linear(n_feats, 64), nn.ReLU(), nn.Dropout(dropout))
        self.out_dim = 4 * hidden + (64 if n_feats else 0)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(self.out_dim, n_classes))

    def encode(self, ids, lengths, feats=None):
        x = self.emb_drop(self.emb(ids))
        packed = pack_padded_sequence(x, lengths.cpu(), batch_first=True, enforce_sorted=False)
        h, _ = self.lstm(packed)
        h, _ = pad_packed_sequence(h, batch_first=True, total_length=ids.size(1))
        mask = torch.arange(ids.size(1), device=ids.device)[None, :] < lengths.to(ids.device)[:, None]
        a = self.att(h).squeeze(-1).masked_fill(~mask, -1e9).softmax(-1)
        att = (h * a.unsqueeze(-1)).sum(1)
        mx = h.masked_fill(~mask.unsqueeze(-1), -1e9).max(1).values
        v = torch.cat([att, mx], -1)
        if self.n_feats:
            v = torch.cat([v, self.feat(feats)], -1)
        return v

    def forward(self, ids, lengths, feats=None):
        return self.head(self.encode(ids, lengths, feats))


class Encoder:
    """แปลงข้อมูล -> ids สำหรับ CEFRNet (เก็บ vocab / scaler ไว้ใช้ตอน inference)"""

    def __init__(self, kind, field="raw", vocab=None, scaler=None, max_len=None):
        self.kind, self.field, self.vocab, self.scaler = kind, field, vocab, scaler
        self.max_len = max_len or (400 if kind == "byte" else 100)

    def ids(self, item):
        if self.kind == "byte":
            seq = [b + 2 for b in item["text"].encode("utf-8")][: self.max_len]
        else:
            seq = [self.vocab.get(w, 1) for w in item[self.field]][: self.max_len]
        return seq or [1]

    def feats(self, item):
        if self.scaler is None:
            return None
        return self.scaler.transform(np.array([item["feats"]]))[0]

    def state(self):
        return {"kind": self.kind, "field": self.field, "vocab": self.vocab, "max_len": self.max_len,
                "scaler_mean": None if self.scaler is None else self.scaler.mean_.tolist(),
                "scaler_scale": None if self.scaler is None else self.scaler.scale_.tolist()}

    @staticmethod
    def from_state(st):
        sc = None
        if st["scaler_mean"] is not None:
            sc = StandardScaler()
            sc.mean_, sc.scale_ = np.array(st["scaler_mean"]), np.array(st["scaler_scale"])
            sc.var_ = sc.scale_ ** 2
            sc.n_features_in_ = len(sc.mean_)
        return Encoder(st["kind"], st["field"], st["vocab"], sc, st["max_len"])


def build_vocab(items, field, min_freq=2):
    """vocab จาก train set: คำที่เจอ >= min_freq หรือมี word vector ใน spaCy"""
    nlp = nc.get_nlp()
    cnt = Counter(w for it in items for w in it[field])
    vocab = {"<pad>": 0, "<unk>": 1}
    for w, c in cnt.most_common():
        if c >= min_freq or nlp.vocab.has_vector(w):
            vocab[w] = len(vocab)
    return vocab


def embedding_matrix(vocab, dim=300):
    nlp = nc.get_nlp()
    rng = np.random.default_rng(SEED)
    M = rng.normal(0, 0.1, (len(vocab), dim)).astype(np.float32)
    M[0] = 0
    hit = 0
    for w, i in vocab.items():
        if nlp.vocab.has_vector(w):
            M[i] = nlp.vocab.get_vector(w)[:dim] / 5.0  # scale ให้ใกล้ init
            hit += 1
    log(f"  embedding coverage {hit}/{len(vocab)}")
    return torch.tensor(M)


# =============================================================================
# [5] NEURAL TRAINING
# =============================================================================
def make_batch(enc, items, labels=None, device=None):
    seqs = [enc.ids(it) for it in items]
    L = max(len(s) for s in seqs)
    ids = torch.zeros(len(seqs), L, dtype=torch.long)
    for i, s in enumerate(seqs):
        ids[i, :len(s)] = torch.tensor(s)
    lengths = torch.tensor([len(s) for s in seqs])
    feats = None
    if enc.scaler is not None:
        feats = torch.tensor(enc.scaler.transform(np.array([it["feats"] for it in items])), dtype=torch.float32)
    y = None if labels is None else torch.tensor(labels, dtype=torch.long)
    if device is not None and device.type != "cpu":
        ids = ids.to(device)
        if feats is not None:
            feats = feats.to(device)
        if y is not None:
            y = y.to(device)
    return ids, lengths, feats, y


@torch.no_grad()
def predict_proba(net, enc, items, batch=256):
    net.eval()
    dev = next(net.parameters()).device
    out = []
    order = np.argsort([len(enc.ids(it)) for it in items])  # เรียงตามความยาวให้ pad น้อย
    for b in range(0, len(items), batch):
        idx = order[b:b + batch]
        ids, lengths, feats, _ = make_batch(enc, [items[i] for i in idx], device=dev)
        out.append((idx, net(ids, lengths, feats).softmax(-1).cpu().numpy()))
    P = np.zeros((len(items), 6), dtype=np.float32)
    for idx, p in out:
        P[idx] = p
    return P


@torch.no_grad()
def encode_items(net, enc, items, batch=256):
    """sentence vector (ก่อน layer สุดท้าย) + probability — ใช้กับ document level"""
    net.eval()
    dev = next(net.parameters()).device
    V = np.zeros((len(items), net.out_dim), dtype=np.float32)
    P = np.zeros((len(items), 6), dtype=np.float32)
    for b in range(0, len(items), batch):
        chunk = items[b:b + batch]
        ids, lengths, feats, _ = make_batch(enc, chunk, device=dev)
        v = net.encode(ids, lengths, feats)
        V[b:b + len(chunk)] = v.cpu().numpy()
        P[b:b + len(chunk)] = net.head(v).softmax(-1).cpu().numpy()
    return V, P


def class_weights(y):
    c = np.bincount(y, minlength=6).astype(float) + 1
    w = (c.sum() / c) ** 0.5
    return torch.tensor(w / w.mean(), dtype=torch.float32)


def train_net(net, enc, tr_items, y_tr, dv_items, y_dv, epochs=15, lr=2e-3, batch=64, patience=4, name=""):
    net.to(DEVICE)
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss(weight=class_weights(np.array(y_tr)).to(DEVICE))
    rng = np.random.default_rng(SEED)
    best, best_state, bad, history = -1e9, None, 0, []
    t0 = time.time()
    for ep in range(1, epochs + 1):
        net.train()
        perm = rng.permutation(len(tr_items))
        total = 0.0
        for b in range(0, len(perm), batch):
            idx = perm[b:b + batch]
            ids, lengths, feats, y = make_batch(enc, [tr_items[i] for i in idx], [y_tr[i] for i in idx], device=DEVICE)
            loss = loss_fn(net(ids, lengths, feats), y)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
            total += loss.item() * len(idx)
        P = predict_proba(net, enc, dv_items)
        dev_loss = float(nn.functional.nll_loss(torch.log(torch.tensor(P) + 1e-9), torch.tensor(y_dv)))
        m = evaluate(y_dv, P.argmax(1))
        history.append({"epoch": ep, "train_loss": total / len(perm), "dev_loss": dev_loss,
                        "dev_acc": m["accuracy"], "dev_f1": m["macro_f1"], "dev_qwk": m["qwk"]})
        log(f"  [{name}] ep{ep:02d} loss={total / len(perm):.3f} dev_loss={dev_loss:.3f} "
            f"acc={m['accuracy']:.3f} f1={m['macro_f1']:.3f} qwk={m['qwk']:.3f}")
        if sel_score(m) > best:
            best, best_state, bad = sel_score(m), {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}, 0
        else:
            bad += 1
            if bad >= patience:
                break
    net.load_state_dict(best_state)
    return history, time.time() - t0


def net_config(kind, vocab_size, n_feats):
    if kind == "byte":
        return {"vocab_size": 258, "emb_dim": 64, "hidden": 128, "n_feats": n_feats}
    return {"vocab_size": vocab_size, "emb_dim": 300, "hidden": 128, "n_feats": n_feats}


def save_net(path, net, enc, cfg):
    state = {k: v.detach().cpu() for k, v in net.state_dict().items()}
    torch.save({"state": state, "config": cfg, "encoder": enc.state()}, path)


def load_net(path):
    ck = torch.load(path, map_location="cpu", weights_only=False)
    net = CEFRNet(**ck["config"])
    net.load_state_dict(ck["state"])
    net.eval()
    return net, Encoder.from_state(ck["encoder"])


def n_params(net):
    return int(sum(p.numel() for p in net.parameters()))


def train_rf_tfidf(texts_tr, y_tr, texts_dv, y_dv, texts_te, y_te, max_feats=5000, n_estimators=200):
    t0 = time.time()
    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=max_feats, sublinear_tf=True)),
        ("rf", RandomForestClassifier(n_estimators=n_estimators, max_depth=25, min_samples_leaf=2,
                                      class_weight="balanced_subsample", n_jobs=-1, random_state=SEED)),
    ])
    pipe.fit(texts_tr, y_tr)
    tt = time.time() - t0
    t1 = time.time()
    pred_te = pipe.predict(texts_te)
    inf = (time.time() - t1) / max(1, len(texts_te)) * 1000
    rf_est = pipe.named_steps["rf"]
    return pipe, {
        "dev": evaluate(y_dv, pipe.predict(texts_dv)),
        "test": evaluate(y_te, pred_te),
        "train_time": tt, "infer_ms": inf,
        "params": int(sum(e.tree_.node_count for e in rf_est.estimators_)),
        "n_tfidf_features": int(len(pipe.named_steps["tfidf"].vocabulary_)),
    }


# =============================================================================
# [6] WORD LEVEL — ทำนายระดับคำที่ไม่อยู่ใน wordlist (OOV)
# =============================================================================
def train_word_models(quick=False):
    lex = nc.get_lexicon()
    words = sorted(w for w in lex if re.fullmatch(r"[a-z]+(-[a-z]+)?", w))
    y = np.array([lex[w] - 1 for w in words])
    idx = np.arange(len(words))
    tr, rest = train_test_split(idx, test_size=0.2, stratify=y, random_state=SEED)
    dv, te = train_test_split(rest, test_size=0.5, stratify=y[rest], random_state=SEED)
    X = np.array([nc.word_feature_vector(w) for w in words])
    res = {}

    log("WORD: Random Forest")
    t0 = time.time()
    rf = RandomForestClassifier(n_estimators=100 if quick else 400, min_samples_leaf=2, class_weight="balanced",
                                n_jobs=-1, random_state=SEED).fit(X[tr], y[tr])
    tt = time.time() - t0
    t1 = time.time()
    pred_te = rf.predict(X[te])
    path = os.path.join(ART, "word_rf.joblib")
    joblib.dump(rf, path)
    res["rf"] = {"dev": evaluate(y[dv], rf.predict(X[dv])), "test": evaluate(y[te], pred_te), "train_time": tt,
                 "infer_ms": (time.time() - t1) / len(te) * 1000, "size_mb": file_mb(path),
                 "params": int(sum(e.tree_.node_count for e in rf.estimators_)),
                 "feature_importance": sorted([{"name": n, "importance": float(v)} for n, v in
                                               zip(nc.WORD_FEATURE_NAMES, rf.feature_importances_)],
                                              key=lambda d: -d["importance"])[:15]}
    nc.set_word_model(rf)

    items = [{"text": w, "feats": list(X[i])} for i, w in enumerate(words)]
    for name, use_feats in (("bytelstm", False), ("hybrid", True)):
        log(f"WORD: {name}")
        sc = StandardScaler().fit(X[tr]) if use_feats else None
        enc = Encoder("byte", scaler=sc, max_len=32)
        cfg = {"vocab_size": 258, "emb_dim": 32, "hidden": 64, "n_feats": X.shape[1] if use_feats else 0}
        torch.manual_seed(SEED)
        net = CEFRNet(**cfg)
        hist, tt = train_net(net, enc, [items[i] for i in tr], list(y[tr]), [items[i] for i in dv], list(y[dv]),
                             epochs=2 if quick else 25, lr=3e-3, batch=128, patience=5, name=f"word-{name}")
        t1 = time.time()
        P = predict_proba(net, enc, [items[i] for i in te])
        path = os.path.join(ART, f"word_{name}.pt")
        save_net(path, net, enc, cfg)
        res[name] = {"dev": evaluate(y[dv], predict_proba(net, enc, [items[i] for i in dv]).argmax(1)),
                     "test": evaluate(y[te], P.argmax(1)), "train_time": tt,
                     "infer_ms": (time.time() - t1) / len(te) * 1000, "size_mb": file_mb(path),
                     "params": n_params(net), "history": hist}
    res["_info"] = {"n_words": len(words), "note": "ใช้กับคำที่ไม่อยู่ใน wordlist เท่านั้น (คำในลิสต์ใช้ lookup ตรง)"}
    return res


# =============================================================================
# [7] RANDOM FOREST
# =============================================================================
RF_PARAMS = {"n_estimators": [300, 500], "max_depth": [None, 20, 30], "min_samples_leaf": [1, 2, 4],
             "max_features": ["sqrt", 0.3, 0.5]}


def tune_rf(X_tr, y_tr, X_dv, y_dv, n_iter=10):
    """RandomizedSearch: fit บน train, วัดผลบน dev (PredefinedSplit) แล้ว refit บน train อย่างเดียว"""
    X = np.vstack([X_tr, X_dv])
    y = np.concatenate([y_tr, y_dv])
    fold = np.r_[-np.ones(len(y_tr)), np.zeros(len(y_dv))]
    search = RandomizedSearchCV(
        RandomForestClassifier(class_weight="balanced_subsample", n_jobs=-1, random_state=SEED),
        RF_PARAMS, n_iter=n_iter, scoring="f1_macro", cv=PredefinedSplit(fold), refit=False,
        random_state=SEED, n_jobs=1)
    search.fit(X, y)
    params = search.best_params_
    rf = RandomForestClassifier(class_weight="balanced_subsample", n_jobs=-1, random_state=SEED, **params)
    return rf.fit(X_tr, y_tr), params


def rf_doc_matrix(rf_sent, docs):
    """doc features + การกระจายระดับประโยคที่ RF ประโยคทำนาย"""
    rows = []
    for d in docs:
        P = rf_sent.predict_proba(np.array([s["feats"] for s in d["sents"]]))
        hist = np.bincount(P.argmax(1), minlength=6) / len(P)
        rows.append(list(d["doc_feats"]) + list(P.mean(0)) + list(hist))
    return np.array(rows)


def importance_list(names, values, top=25):
    return sorted([{"name": n, "importance": float(v)} for n, v in zip(names, values)],
                  key=lambda d: -d["importance"])[:top]


def group_importance(names, values):
    out = {}
    for g, feats in nc.FEATURE_GROUPS.items():
        s = set(feats)
        out[g] = float(sum(v for n, v in zip(names, values) if n in s))
    out["other (POS, entity, readability)"] = float(1 - sum(out.values()))
    return out


# =============================================================================
# [8] DOCUMENT LEVEL (hierarchical สำหรับโมเดล neural)
# =============================================================================
def pooled_doc_vectors(net, enc, docs, doc_scaler=None):
    """encode ทุกประโยคในบทความ -> mean+max pooling + ค่าเฉลี่ย prob + histogram ระดับประโยค"""
    flat = [s for d in docs for s in d["sents"]]
    V, P = encode_items(net, enc, flat)
    rows, k = [], 0
    for d in docs:
        n = len(d["sents"])
        v, p = V[k:k + n], P[k:k + n]
        k += n
        row = list(v.mean(0)) + list(v.max(0)) + list(p.mean(0)) + list(np.bincount(p.argmax(1), minlength=6) / n)
        if doc_scaler is not None:
            row += list(doc_scaler.transform(np.array([d["doc_feats"]]))[0])
        rows.append(row)
    return np.array(rows)


def fit_doc_head(X_tr, y_tr, X_dv, y_dv):
    """StandardScaler + LogisticRegression (เลือก C จาก dev)"""
    sc = StandardScaler().fit(X_tr)
    best = None
    for C in (0.01, 0.1, 1.0):
        clf = LogisticRegression(C=C, max_iter=3000).fit(sc.transform(X_tr), y_tr)
        s = sel_score(evaluate(y_dv, clf.predict(sc.transform(X_dv))))
        if best is None or s > best[0]:
            best = (s, clf)
    return {"scaler": sc, "clf": best[1]}


def head_proba(head, X):
    return head["clf"].predict_proba(head["scaler"].transform(X))


# =============================================================================
# [10] PREDICTOR — ใช้ใน app.py
# =============================================================================
def save_rf_bundle(bundle):
    """แยกบันทึก RF เป็นหลายไฟล์ย่อย (< 45 MB/ไฟล์) เพื่อให้ push ขึ้น GitHub ได้โดยไม่ต้องใช้ Git LFS"""
    legacy = os.path.join(ART, "rf_bundle.joblib")
    if os.path.exists(legacy):
        os.remove(legacy)
    parts = {
        "rf_sent.joblib": {"sent": bundle["sent"]},
        "rf_doc.joblib": {
            "doc": bundle["doc"],
            "tfidf_sent": bundle["tfidf_sent"],
            "tfidf_doc": bundle["tfidf_doc"],
            "group_doc": bundle["group_doc"],
            "group_cols_sent": bundle["group_cols_sent"],
            "group_cols_doc": bundle["group_cols_doc"],
        },
    }
    for g, est in bundle["group_sent"].items():
        parts[f"rf_group_sent_{g}.joblib"] = est
    sizes = {}
    for fname, obj in parts.items():
        p = os.path.join(ART, fname)
        joblib.dump(obj, p, compress=3)
        sizes[fname] = file_mb(p) or 0.0
    return sizes


def load_rf_bundle():
    """โหลด RF จากไฟล์แยก (หรือ rf_bundle.joblib เดิมถ้ามี)"""
    legacy = os.path.join(ART, "rf_bundle.joblib")
    if os.path.exists(legacy):
        return joblib.load(legacy)
    bundle = {}
    for fname in ("rf_sent.joblib", "rf_doc.joblib"):
        p = os.path.join(ART, fname)
        if os.path.exists(p):
            bundle.update(joblib.load(p))
    bundle["group_sent"] = {}
    for g in nc.FEATURE_GROUPS:
        p = os.path.join(ART, f"rf_group_sent_{g}.joblib")
        if os.path.exists(p):
            bundle["group_sent"][g] = joblib.load(p)
    return bundle


class CEFRPredictor:
    """โหลดโมเดลทั้งหมดจาก artifacts/ แล้วทำนายระดับประโยค / บทความ / breakdown"""

    def __init__(self):
        with open(os.path.join(ART, "metrics.json"), encoding="utf-8") as f:
            self.metrics = json.load(f)
        self.best = self.metrics["best"]
        self.rf = load_rf_bundle()
        self.nets, self.heads = {}, {}
        for name in ("bilstm", "bytelstm", "hybrid", "bytehybrid"):
            pt_path = os.path.join(ART, f"{name}.pt")
            doc_path = os.path.join(ART, f"{name}_doc.joblib")
            if os.path.exists(pt_path) and os.path.exists(doc_path):
                self.nets[name] = load_net(pt_path)
                self.heads[name] = joblib.load(doc_path)

    def available_models(self):
        out = ["rf"]
        if "tfidf_sent" in self.rf and "tfidf_doc" in self.rf:
            out.append("rf_tfidf")
        for name in ("bilstm", "hybrid", "bytelstm", "bytehybrid"):
            if name in self.nets:
                out.append(name)
        return out

    def sentence_proba(self, model, units):
        if model == "rf":
            return self.rf["sent"].predict_proba(np.array([u["feats"] for u in units]))
        if model == "rf_tfidf":
            return self.rf["tfidf_sent"].predict_proba([u["text"] for u in units])
        net, enc = self.nets[model]
        return predict_proba(net, enc, units)

    def doc_proba(self, model, units, doc_feats):
        d = {"sents": units, "doc_feats": doc_feats}
        if model == "rf":
            return self.rf["doc"].predict_proba(rf_doc_matrix(self.rf["sent"], [d]))[0]
        if model == "rf_tfidf":
            return self.rf["tfidf_doc"].predict_proba([" ".join(u["text"] for u in units)])[0]
        net, enc = self.nets[model]
        head = self.heads[model]
        X = pooled_doc_vectors(net, enc, [d], head.get("doc_scaler"))
        return head_proba(head, X)[0]

    def general_proba(self, model, units, doc_feats):
        """ข้อความสั้น (< 3 ประโยค) ใช้ค่าเฉลี่ยระดับประโยค เพราะโมเดลบทความ train กับบทความยาว"""
        if len(units) < 3:
            return self.sentence_proba(model, units).mean(0)
        return self.doc_proba(model, units, doc_feats)

    def breakdown(self, units, doc_feats):
        """Vocabulary / Verb form / Clause: RF ที่ train แยกตามกลุ่ม feature"""
        out = {}
        for g in nc.FEATURE_GROUPS:
            if len(units) < 3:
                cols = self.rf["group_cols_sent"][g]
                P = self.rf["group_sent"][g].predict_proba(np.array([u["feats"] for u in units])[:, cols]).mean(0)
            else:
                cols = self.rf["group_cols_doc"][g]
                P = self.rf["group_doc"][g].predict_proba(np.array([doc_feats])[:, cols])[0]
            out[g] = nc.score_label(nc.expected_score(P))
        return out

    def sentence_breakdown(self, unit):
        out = {}
        for g in nc.FEATURE_GROUPS:
            cols = self.rf["group_cols_sent"][g]
            P = self.rf["group_sent"][g].predict_proba(np.array([unit["feats"]])[:, cols])[0]
            out[g] = nc.score_label(nc.expected_score(P))
        return out


# =============================================================================
# [11] MAIN — train ทุกอย่าง
# =============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="ข้อมูลน้อย + epoch น้อย (เช็ค pipeline)")
    ap.add_argument("--rebuild-cache", action="store_true")
    args = ap.parse_args()
    quick = args.quick
    EPOCHS = 2 if quick else 15
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    T0 = time.time()
    log(f"device = {DEVICE}" + (f" ({torch.cuda.get_device_name(0)})" if DEVICE.type == "cuda" else ""))
    M = {"levels": nc.LEVELS, "model_names": MODEL_NAMES, "quick": quick,
         "created": time.strftime("%Y-%m-%d %H:%M:%S")}

    # ---------- word level (ต้องมาก่อน เพราะ feature ใช้ word model กับคำ OOV) ----------
    M["word"] = train_word_models(quick)

    # ---------- cache ----------
    cache = build_cache(quick, args.rebuild_cache)
    sdf, ddf, S, D = cache["sdf"], cache["ddf"], cache["sents"], cache["docs"]
    M["dataset"] = dataset_stats(sdf, ddf)
    sp = {k: np.where(sdf["split"].values == k)[0] for k in ("train", "dev", "test")}
    y = sdf["label"].values - 1
    Xs = np.array([s["feats"] for s in S])
    items = {k: [S[i] for i in sp[k]] for k in sp}
    ys = {k: list(y[sp[k]]) for k in sp}
    dsp = {k: np.where(ddf["split"].values == k)[0] for k in ("train", "dev", "test")}
    yd = ddf["label"].values - 1
    docs = {k: [D[i] for i in dsp[k]] for k in dsp}
    yds = {k: yd[dsp[k]] for k in dsp}
    sent_res, doc_res, abl = {}, {}, {}

    # ---------- [7] Random Forest ----------
    log("SENTENCE: Random Forest (tuning)")
    t0 = time.time()
    rf, params = tune_rf(Xs[sp["train"]], y[sp["train"]], Xs[sp["dev"]], y[sp["dev"]], n_iter=2 if quick else 12)
    tt = time.time() - t0
    t1 = time.time()
    pred_te = rf.predict(Xs[sp["test"]])
    inf = (time.time() - t1) / len(sp["test"]) * 1000
    sent_res["rf"] = {"dev": evaluate(y[sp["dev"]], rf.predict(Xs[sp["dev"]])), "test": evaluate(y[sp["test"]], pred_te),
                      "train_time": tt, "infer_ms": inf, "params": int(sum(e.tree_.node_count for e in rf.estimators_)),
                      "hyperparams": {k: (v if v is not None else "None") for k, v in params.items()},
                      "feature_importance": importance_list(nc.SENT_FEATURE_NAMES, rf.feature_importances_),
                      "group_importance": group_importance(nc.SENT_FEATURE_NAMES, rf.feature_importances_)}
    log("  RF test", {k: round(v, 3) for k, v in sent_res["rf"]["test"].items() if isinstance(v, float)})

    log("DOCUMENT: Random Forest")
    Xd = {k: rf_doc_matrix(rf, docs[k]) for k in docs}
    t0 = time.time()
    rf_doc, dparams = tune_rf(Xd["train"], yds["train"], Xd["dev"], yds["dev"], n_iter=2 if quick else 10)
    tt_doc_rf = time.time() - t0
    t1 = time.time()
    pred_doc_te = rf_doc.predict(Xd["test"])
    inf_doc_rf = (time.time() - t1) / len(Xd["test"]) * 1000
    doc_names = nc.DOC_FEATURE_NAMES + [f"sent_prob_{l}" for l in nc.LEVELS] + [f"sent_hist_{l}" for l in nc.LEVELS]
    doc_res["rf"] = {"dev": evaluate(yds["dev"], rf_doc.predict(Xd["dev"])),
                     "test": evaluate(yds["test"], pred_doc_te), "train_time": tt_doc_rf,
                     "infer_ms": inf_doc_rf,
                     "params": int(sum(e.tree_.node_count for e in rf_doc.estimators_)),
                     "feature_importance": importance_list(doc_names, rf_doc.feature_importances_)}

    # ---------- [7b] RF (TF-IDF Only — ไม่มี Linguistic Features) ----------
    log("SENTENCE & DOC: Random Forest (TF-IDF only)")
    stexts = {k: sdf["text"].values[sp[k]] for k in sp}
    dtexts = {k: ddf["text"].values[dsp[k]] for k in dsp}
    rf_tfidf_sent, sent_res["rf_tfidf"] = train_rf_tfidf(
        stexts["train"], y[sp["train"]], stexts["dev"], y[sp["dev"]], stexts["test"], y[sp["test"]],
        max_feats=5000, n_estimators=150 if quick else 300,
    )
    rf_tfidf_doc, doc_res["rf_tfidf"] = train_rf_tfidf(
        dtexts["train"], yds["train"], dtexts["dev"], yds["dev"], dtexts["test"], yds["test"],
        max_feats=8000, n_estimators=150 if quick else 300,
    )

    # breakdown RFs (Vocabulary / Verb form / Clause)
    log("BREAKDOWN: group RFs")
    group_sent, group_doc, gcs, gcd = {}, {}, {}, {}
    Xdf = {k: np.array([d["doc_feats"] for d in docs[k]]) for k in docs}
    M["breakdown"] = {}
    for g in nc.FEATURE_GROUPS:
        gcs[g] = [nc.SENT_FEATURE_NAMES.index(n) for n in nc.FEATURE_GROUPS[g]]
        gcd[g] = [nc.DOC_FEATURE_NAMES.index(n) for n in nc.DOC_FEATURE_GROUPS[g]]
        group_sent[g] = RandomForestClassifier(n_estimators=200, min_samples_leaf=2, class_weight="balanced_subsample",
                                               n_jobs=-1, random_state=SEED).fit(Xs[sp["train"]][:, gcs[g]], y[sp["train"]])
        group_doc[g] = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced_subsample",
                                              n_jobs=-1, random_state=SEED).fit(Xdf["train"][:, gcd[g]], yds["train"])
        M["breakdown"][g] = {"sentence_test": evaluate(y[sp["test"]], group_sent[g].predict(Xs[sp["test"]][:, gcs[g]])),
                             "document_test": evaluate(yds["test"], group_doc[g].predict(Xdf["test"][:, gcd[g]]))}
    rf_sizes = save_rf_bundle({
        "sent": rf, "doc": rf_doc, "tfidf_sent": rf_tfidf_sent, "tfidf_doc": rf_tfidf_doc,
        "group_sent": group_sent, "group_doc": group_doc,
        "group_cols_sent": gcs, "group_cols_doc": gcd,
    })
    sent_res["rf"]["size_mb"] = rf_sizes["rf_sent.joblib"]
    doc_res["rf"]["size_mb"] = doc_res["rf_tfidf"]["size_mb"] = sent_res["rf_tfidf"]["size_mb"] = rf_sizes["rf_doc.joblib"]

    # ---------- [4][5] Neural models ----------
    feat_scaler = StandardScaler().fit(Xs[sp["train"]])
    trained = {}

    def run_neural(key, kind, field, use_feats, lr):
        log(f"SENTENCE: {key}")
        vocab = build_vocab(items["train"], field) if kind == "word" else None
        enc = Encoder(kind, field, vocab, feat_scaler if use_feats else None)
        cfg = net_config(kind, len(vocab) if vocab else 258, Xs.shape[1] if use_feats else 0)
        torch.manual_seed(SEED)
        net = CEFRNet(**cfg)
        if kind == "word":
            net.emb.weight.data.copy_(embedding_matrix(vocab))
        hist, tt = train_net(net, enc, items["train"], ys["train"], items["dev"], ys["dev"],
                             epochs=EPOCHS, lr=lr, name=key)
        t1 = time.time()
        Pte = predict_proba(net, enc, items["test"])
        inf = (time.time() - t1) / len(items["test"]) * 1000
        r = {"dev": evaluate(ys["dev"], predict_proba(net, enc, items["dev"]).argmax(1)),
             "test": evaluate(ys["test"], Pte.argmax(1)), "train_time": tt, "infer_ms": inf,
             "params": n_params(net), "history": hist, "input": field if kind == "word" else "utf-8 bytes"}
        log(f"  {key} test acc={r['test']['accuracy']:.3f} f1={r['test']['macro_f1']:.3f} qwk={r['test']['qwk']:.3f}")
        trained[key] = (net, enc, cfg)
        return r

    abl_lstm = {}
    for field in ("raw", "lemma", "ner"):
        abl_lstm[field] = run_neural(f"bilstm_{field}", "word", field, False, 2e-3)
    sent_res["bilstm"] = abl_lstm["raw"]
    sent_res["bytelstm"] = run_neural("bytelstm", "byte", "raw", False, 3e-3)
    # Hybrid ใช้ input แบบที่ดีกว่าบน dev ระหว่าง raw กับ raw+NER mask
    hy_field = "ner" if sel_score(abl_lstm["ner"]["dev"]) > sel_score(abl_lstm["raw"]["dev"]) else "raw"
    sent_res["hybrid"] = run_neural("hybrid", "word", hy_field, True, 2e-3)
    sent_res["bytehybrid"] = run_neural("bytehybrid", "byte", "raw", True, 3e-3)
    abl["lstm_input"] = {f: {"dev": abl_lstm[f]["dev"], "test": abl_lstm[f]["test"]} for f in abl_lstm}
    abl["hybrid_input"] = hy_field

    # ---------- [8] Document level (neural) ----------
    doc_scaler = StandardScaler().fit(Xdf["train"])
    for key, tkey in (("bilstm", "bilstm_raw"), ("bytelstm", "bytelstm"), ("hybrid", "hybrid"), ("bytehybrid", "bytehybrid")):
        log(f"DOCUMENT: {key}")
        net, enc, cfg = trained[tkey]
        dsc = doc_scaler if key in ("hybrid", "bytehybrid") else None
        t0 = time.time()
        Xv = {k: pooled_doc_vectors(net, enc, docs[k], dsc) for k in docs}
        head = fit_doc_head(Xv["train"], yds["train"], Xv["dev"], yds["dev"])
        head["doc_scaler"] = dsc
        tt_doc = time.time() - t0
        path = os.path.join(ART, f"{key}.pt")
        save_net(path, net, enc, cfg)
        joblib.dump(head, os.path.join(ART, f"{key}_doc.joblib"))
        t1 = time.time()
        P_te_doc = head_proba(head, Xv["test"])
        inf_doc = (time.time() - t1) / max(1, len(Xv["test"])) * 1000
        doc_res[key] = {"dev": evaluate(yds["dev"], head_proba(head, Xv["dev"]).argmax(1)),
                        "test": evaluate(yds["test"], P_te_doc.argmax(1)),
                        "train_time": tt_doc, "infer_ms": inf_doc, "params": n_params(net)}
        sent_res[key]["size_mb"] = doc_res[key]["size_mb"] = file_mb(path)
        log(f"  doc {key} test acc={doc_res[key]['test']['accuracy']:.3f} f1={doc_res[key]['test']['macro_f1']:.3f}")

    # ---------- [9] Ablation (Random Forest) ----------
    log("ABLATION: RF")
    rp = {k: v for k, v in params.items()}
    rp["n_estimators"] = 300

    def rf_eval(Xtr, Xte):
        m = RandomForestClassifier(class_weight="balanced_subsample", n_jobs=-1, random_state=SEED, **rp).fit(Xtr, y[sp["train"]])
        return evaluate(y[sp["test"]], m.predict(Xte))

    Xsurf = np.array([s["feats_surface"] for s in S])
    abl["rf_lookup"] = {"lemma": rf_eval(Xs[sp["train"]], Xs[sp["test"]]),
                        "surface": rf_eval(Xsurf[sp["train"]], Xsurf[sp["test"]])}
    abl["rf_groups"] = {"all": abl["rf_lookup"]["lemma"]}
    for g, feats in nc.FEATURE_GROUPS.items():
        cols_g = [nc.SENT_FEATURE_NAMES.index(n) for n in feats]
        drop = [i for i in range(Xs.shape[1]) if i not in cols_g]
        abl["rf_groups"][f"without_{g}"] = rf_eval(Xs[sp["train"]][:, drop], Xs[sp["test"]][:, drop])
        abl["rf_groups"][f"only_{g}"] = rf_eval(Xs[sp["train"]][:, cols_g], Xs[sp["test"]][:, cols_g])
    # OOV rate ด้วย lemma vs surface (ใน test set)
    abl["oov_rate"] = {"lemma": float(np.mean(Xs[sp["test"]][:, nc.SENT_FEATURE_NAMES.index("prop_oov")])),
                       "surface": float(np.mean(Xsurf[sp["test"]][:, nc.SENT_FEATURE_NAMES.index("prop_oov")]))}

    # ---------- best model (เลือกจาก dev) ----------
    M["sentence"], M["document"], M["ablation"] = sent_res, doc_res, abl
    M["feature_comparison"] = {
        "sentence": [
            {"family": "Random Forest", "without": "rf_tfidf", "with": "rf",
             "without_desc": "TF-IDF 1-2 grams (ไม่มีความรู้ภาษาศาสตร์)",
             "with_desc": "65 Linguistic Features (Vocab, Tense, Clause, POS)"},
            {"family": "Word BiLSTM", "without": "bilstm", "with": "hybrid",
             "without_desc": "Raw Word Sequence + 300d GloVe",
             "with_desc": f"Word BiLSTM ({hy_field}) + 65 Linguistic Features"},
            {"family": "Byte-LSTM", "without": "bytelstm", "with": "bytehybrid",
             "without_desc": "Raw UTF-8 Byte Sequence",
             "with_desc": "Byte-LSTM + 65 Linguistic Features"},
        ],
        "document": [
            {"family": "Random Forest", "without": "rf_tfidf", "with": "rf",
             "without_desc": "TF-IDF 1-2 grams ทั้งบทความ",
             "with_desc": "212 Doc Linguistic & Sentence Signals"},
            {"family": "Word BiLSTM", "without": "bilstm", "with": "hybrid",
             "without_desc": "Pooled Word BiLSTM vectors",
             "with_desc": "Pooled BiLSTM + 200 Doc Linguistic Features"},
            {"family": "Byte-LSTM", "without": "bytelstm", "with": "bytehybrid",
             "without_desc": "Pooled Byte-LSTM vectors",
             "with_desc": "Pooled Byte-LSTM + 200 Doc Linguistic Features"},
        ],
        "word": [
            {"family": "Byte-LSTM", "without": "bytelstm", "with": "hybrid",
             "without_desc": "Raw UTF-8 bytes ของคำ",
             "with_desc": "Byte-LSTM + 41 Word Features"},
        ],
    }
    M["best"] = {"sentence": max(sent_res, key=lambda k: sel_score(sent_res[k]["dev"])),
                 "document": max(doc_res, key=lambda k: sel_score(doc_res[k]["dev"]))}
    M["selection_metric"] = "0.5 * macro_F1 + 0.5 * QWK บน dev set"

    # ---------- level profiles (radar chart) ----------
    radar = [("mean_mean_level", "Vocabulary level"), ("mean_mean_zipf", "Word rarity (inv. freq)"),
             ("mean_n_words", "Sentence length"), ("mean_n_clauses", "Clauses / sentence"),
             ("mean_tree_depth", "Tree depth"), ("mean_max_vf_level", "Verb-form level"),
             ("mean_mean_word_len", "Word length"), ("doc_prop_ge_B2", "Share of B2+ words")]
    Xall = np.array([d["doc_feats"] for d in docs["train"]])
    prof = {}
    for k in range(6):
        rows = Xall[yds["train"] == k]
        prof[nc.LEVELS[k]] = [float(rows[:, nc.DOC_FEATURE_NAMES.index(f)].mean()) if len(rows) else 0.0
                              for f, _ in radar]
    M["level_profiles"] = {"features": [{"key": f, "label": l} for f, l in radar], "levels": prof}
    M["total_time_sec"] = time.time() - T0

    with open(os.path.join(ART, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(M, f, ensure_ascii=False, indent=1)
    log(f"DONE in {M['total_time_sec'] / 60:.1f} min. best = {M['best']}")


if __name__ == "__main__":
    main()

