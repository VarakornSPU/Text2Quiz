"""
app.py — FastAPI Backend for Text2Quiz CEFR Analysis & Quiz System
==================================================================
Endpoints:
  POST /api/analyze          วิเคราะห์ระดับ CEFR ละเอียด (บทความ + ประโยค + คำ)
  POST /api/compare          เปรียบเทียบผลลัพธ์ทั้ง 4 โมเดลแบบ Live
  GET  /api/metrics          ดึงข้อมูลผลการทดสอบทุกโมเดล + Confusion Matrix + Ablation
  GET  /api/level-profiles   ดึงข้อมูล CEFR Level Profiles สำหรับทำ Radar Chart
  POST /api/quiz/generate    สร้างชุดควิซจากบทความ
  POST /api/quiz/grade       ตรวจควิซและส่งเฉลยพร้อมคำอธิบายภาษาไทย
"""
import os
import sys
import re
import json
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import langdetect
from wordfreq import zipf_frequency

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nlp_core as nc
import quiz
import ml_models as mm

app = FastAPI(title="Text2Quiz CEFR API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_PREDICTOR = None


def get_predictor():
    global _PREDICTOR
    if _PREDICTOR is None:
        metrics_path = os.path.join(nc.ART_DIR, "metrics.json")
        if os.path.exists(metrics_path):
            try:
                _PREDICTOR = mm.CEFRPredictor()
            except Exception as e:
                print(f"Warning: Could not load predictor ({e}). Will train or run fallback.")
    return _PREDICTOR


def is_latin(c: str) -> bool:
    """เช็กตัวอักษรละติน (รวม Basic Latin, Latin-1 Supplement, Latin Extended A/B สำหรับคำยืม เช่น é, à, ü, ñ, ç)"""
    return (
        ("A" <= c <= "Z")
        or ("a" <= c <= "z")
        or ("\u00C0" <= c <= "\u024F")
        or ("\u1E00" <= c <= "\u1EFF")
    )


def validate_english_input(text: str, min_words: int = 3):
    """ตรวจสอบความถูกต้องของข้อความก่อนส่งให้โมเดล ML:
    1. ต้องไม่ว่างเปล่า
    2. ต้องเป็นตัวอักษรภาษาอังกฤษ/ละตินเป็นหลัก (รวมอักษรละตินที่มีเครื่องหมาย เช่น é, à, ü, ñ, ç)
    3. กรองภาษาไทยออกหากมีสัดส่วนเกิน 15% หรือเกิน 6 ตัวอักษร
    4. ต้องมีจำนวนคำภาษาอังกฤษจริง (is_alpha) อย่างน้อย min_words คำ
    5. มีเกณฑ์คำศัพท์ภาษาอังกฤษที่รู้จักเพื่อป้องกันการพิมพ์แป้นพิมพ์มั่ว (>= 18%)
    6. หากเป็นบทความยาว (>= 8 คำ) และ langdetect ตรวจพบภาษาอื่นเป็นภาษาหลักเด่นชัด (> 75% และ en < 25%) จึงจะแจ้งเตือน
       (รองรับบทความภาษาอังกฤษที่มีคำยืม, โควทต่างชาติ หรือชื่อเฉพาะได้อย่างราบรื่น)
    """
    text = (text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="ข้อความว่างเปล่า กรุณาป้อนข้อความภาษาอังกฤษ (Text cannot be empty)",
        )

    # 1. ตรวจสอบอักขระตัวอักษรทั้งหมด
    alphas = [c for c in text if c.isalpha()]
    if not alphas:
        raise HTTPException(
            status_code=400,
            detail="ไม่พบคำศัพท์ภาษาอังกฤษ กรุณาป้อนข้อความภาษาอังกฤษ (No alphabetic words found)",
        )

    # ตรวจจับภาษาไทยหากมีเกินเกณฑ์ที่ยอมรับได้
    thai_chars = [c for c in text if "\u0E00" <= c <= "\u0E7F"]
    if len(thai_chars) > 0 and (
        len(thai_chars) / len(alphas) > 0.15 or len(thai_chars) >= 6
    ):
        raise HTTPException(
            status_code=400,
            detail="ตรวจพบข้อความภาษาไทย: ระบบรองรับเฉพาะข้อความภาษาอังกฤษเท่านั้น (English text only)",
        )

    # อนุญาตอักษรละติน (รวม Latin-Extended สำหรับคำยืมเช่น café, résumé, naïve, cliché)
    latin_alphas = [c for c in alphas if is_latin(c)]
    if len(latin_alphas) / len(alphas) < 0.70:
        raise HTTPException(
            status_code=400,
            detail="ตรวจพบภาษาอื่นที่ไม่ใช่อักษรละติน/อังกฤษ: ระบบรองรับเฉพาะข้อความภาษาอังกฤษเท่านั้น (Non-English script detected)",
        )

    # 2. Parse ด้วย spaCy และนับคำภาษาอังกฤษจริง
    doc = nc.parse(text)
    words = [t for t in doc if t.is_alpha and any(is_latin(c) for c in t.text)]
    if len(words) < min_words:
        raise HTTPException(
            status_code=400,
            detail=f"กรุณาป้อนข้อความภาษาอังกฤษอย่างน้อย {min_words} คำ (พบคำภาษาอังกฤษเพียง {len(words)} คำ)",
        )

    # 3. ตรวจจับการพิมพ์ตัวอักษรซ้ำผิดปกติ (เช่น ddddddddddddddd)
    if any(re.search(r"(.)\1{3,}", w.text.lower()) for w in words):
        raise HTTPException(
            status_code=400,
            detail="ตรวจพบการพิมพ์ตัวอักษรซ้ำผิดปกติ กรุณาป้อนข้อความภาษาอังกฤษที่มีความหมาย (Repeated character sequence detected)",
        )

    # 4. ตรวจสอบคำศัพท์ที่รู้จัก (Adaptive Lexicon & Word Frequency)
    lex = nc.get_lexicon()
    recognized = sum(
        1
        for w in words
        if w.lower_ in lex
        or w.lemma_.lower() in lex
        or zipf_frequency(w.lower_, "en") > 1.2
    )
    if len(words) < 10:
        if recognized < 1 or (recognized / len(words)) < 0.30:
            raise HTTPException(
                status_code=400,
                detail="ไม่พบคำศัพท์ภาษาอังกฤษที่รู้จักในข้อความ กรุณาป้อนประโยคภาษาอังกฤษที่มีความหมาย (No recognized English words found)",
            )
    else:
        if (recognized / len(words)) < 0.18:
            raise HTTPException(
                status_code=400,
                detail="ไม่พบคำศัพท์ภาษาอังกฤษที่รู้จักเพียงพอ กรุณาตรวจสอบข้อความที่ป้อน (Text does not appear to contain recognized English words)",
            )

    # 7. ตรวจสอบภาษาอื่นที่ใช้อักษรละติน (ตรวจเฉพาะเมื่อภาษาอังกฤษไม่ใช่ภาษาหลักเด่นชัด)
    if len(words) >= 8:
        try:
            langs = langdetect.detect_langs(text)
            en_prob = next((l.prob for l in langs if l.lang == "en"), 0.0)
            top_lang = langs[0] if langs else None
            # ปฏิเสธเฉพาะเมื่อภาษาอื่นครองสัดส่วนเด่นชัด (> 75%) และภาษาอังกฤษเหลือน้อยมาก (< 25%)
            if (
                top_lang
                and top_lang.lang != "en"
                and top_lang.prob >= 0.75
                and en_prob < 0.25
            ):
                lang_names = {
                    "fr": "ภาษาฝรั่งเศส",
                    "es": "ภาษาสเปน",
                    "de": "ภาษาเยอรมัน",
                    "it": "ภาษาอิตาลี",
                    "pt": "ภาษาโปรตุเกส",
                    "nl": "ภาษาดัตช์",
                    "ru": "ภาษารัสเซีย",
                }
                name = lang_names.get(top_lang.lang, f"ภาษา {top_lang.lang}")
                raise HTTPException(
                    status_code=400,
                    detail=f"ตรวจพบ{name}เป็นภาษาหลัก ({int(top_lang.prob * 100)}%): ระบบรองรับเฉพาะบทความภาษาอังกฤษเท่านั้น (English text only)",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    return doc, words


# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str
    model: Optional[str] = "auto"  # 'auto', 'rf', 'bilstm', 'bytelstm', 'hybrid', 'bytehybrid'
    doc_model: Optional[str] = None
    sentence_model: Optional[str] = None
    word_model: Optional[str] = None


class CompareRequest(BaseModel):
    text: str


class QuizGenerateRequest(BaseModel):
    text: str
    num_questions: Optional[int] = 10
    types: Optional[List[str]] = None
    level: Optional[str] = None


class QuizGradeRequest(BaseModel):
    quiz_id: str
    answers: Dict[str, int]


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health():
    pred = get_predictor()
    return {
        "status": "healthy",
        "models_ready": pred is not None,
        "best_model": pred.best if pred else None,
        "available_models": pred.available_models() if pred else [],
    }


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    doc, words = validate_english_input(req.text, min_words=3)
    du = nc.doc_unit(doc)
    units = du["units"]
    doc_feats = du["doc_feats"]

    if not units:
        raise HTTPException(status_code=400, detail="No readable text found")

    pred = get_predictor()

    # เลือกโมเดลแยกแต่ละระดับ (Article, Sentence, Word)
    # Default pipeline ตามที่กำหนด:
    # 1. ระดับบทความ (Document level): Random Forest (+Features) -> 'rf'
    # 2. ระดับประโยค (Sentence level): Byte-LSTM + Features -> 'bytehybrid'
    # 3. ระดับคำศัพท์ (Word level): Byte-LSTM + Features -> 'bytehybrid'
    requested_model = (req.model or "auto").lower()

    if req.doc_model:
        doc_model = req.doc_model.lower()
    elif requested_model != "auto" and requested_model in mm.MODEL_NAMES:
        doc_model = requested_model
    else:
        doc_model = "rf"

    if req.sentence_model:
        sentence_model = req.sentence_model.lower()
    elif requested_model != "auto" and requested_model in mm.MODEL_NAMES:
        sentence_model = requested_model
    else:
        sentence_model = "bytehybrid"

    if req.word_model:
        word_model = req.word_model.lower()
    elif requested_model in ["rf", "rf_tfidf"]:
        word_model = "rf"
    elif requested_model in ["bytelstm"]:
        word_model = "bytelstm"
    else:
        word_model = "bytehybrid"

    if pred:
        avail = pred.available_models()
        if doc_model not in avail:
            raise HTTPException(
                status_code=400,
                detail=f"Document model '{doc_model}' is not available. Available: {', '.join(avail)}",
            )
        if sentence_model not in avail:
            raise HTTPException(
                status_code=400,
                detail=f"Sentence model '{sentence_model}' is not available. Available: {', '.join(avail)}",
            )

    valid_words = ["bytehybrid", "hybrid", "rf", "bytelstm"]
    if word_model not in valid_words:
        raise HTTPException(
            status_code=400,
            detail=f"Word model '{word_model}' is not valid. Choose from: {', '.join(valid_words)}",
        )

    # คำนวณระดับบทความ / ประโยค
    sentences_data = []
    sent_levels_num = []

    if pred:
        probs = pred.sentence_proba(sentence_model, units)
        for i, (u, p) in enumerate(zip(units, probs)):
            score = nc.expected_score(p)
            lbl = nc.score_label(score)
            sent_levels_num.append(lbl["score"])
            # breakdown รายประโยค
            s_bk = pred.sentence_breakdown(u)
            sentences_data.append(
                {
                    "index": i,
                    "text": u["text"],
                    "score": lbl["score"],
                    "level": lbl["level"],
                    "label": lbl["label"],
                    "probabilities": [float(x) for x in p],
                    "verb_forms": u["verb_forms"],
                    "clauses": u["clauses"]["clauses"],
                    "n_clauses": u["clauses"]["n_clauses"],
                    "depth": u["clauses"]["depth"],
                    "breakdown": s_bk,
                    "model_used": sentence_model,
                }
            )

        # General Level ของบทความ (คำนวณด้วย doc_model)
        gen_p = pred.general_proba(doc_model, units, doc_feats)
        gen_score = nc.expected_score(gen_p)
        general_level = nc.score_label(gen_score)
        general_level["probabilities"] = [float(x) for x in gen_p]
        general_level["model_used"] = doc_model

        # Breakdown (Vocabulary, Verb form, Clause)
        breakdown = pred.breakdown(units, doc_feats)
    else:
        # Fallback แบบ Heuristic ก่อนเทรนโมเดลเสร็จ
        all_lvls = [
            l for u in units for (l, s) in u["levels"] if l is not None
        ] or [2]
        avg_lvl = float(sum(all_lvls) / len(all_lvls))
        general_level = nc.score_label(avg_lvl)
        breakdown = {
            "vocabulary": nc.score_label(avg_lvl),
            "verb_form": nc.score_label(max(1, avg_lvl - 0.2)),
            "clause": nc.score_label(min(6, avg_lvl + 0.3)),
        }
        for i, u in enumerate(units):
            u_lvls = [l for (l, s) in u["levels"] if l is not None] or [2]
            s_avg = float(sum(u_lvls) / len(u_lvls))
            lbl = nc.score_label(s_avg)
            sentences_data.append(
                {
                    "index": i,
                    "text": u["text"],
                    "score": lbl["score"],
                    "level": lbl["level"],
                    "label": lbl["label"],
                    "probabilities": [0.16] * 6,
                    "verb_forms": u["verb_forms"],
                    "clauses": u["clauses"]["clauses"],
                    "n_clauses": u["clauses"]["n_clauses"],
                    "depth": u["clauses"]["depth"],
                    "breakdown": breakdown,
                    "model_used": sentence_model,
                }
            )

    # Token-level serialization
    sent_ids = {}
    levels_by_tok = {}
    for s_idx, s in enumerate(doc.sents):
        toks = [t for t in s if not t.is_space]
        t_lvls = nc.token_levels(toks, word_model=word_model)
        for t, (lvl, src) in zip(toks, t_lvls):
            sent_ids[t.i] = s_idx
            levels_by_tok[t.i] = (lvl, src)

    word_model_display = (
        "Byte-LSTM + Features"
        if word_model in ["bytehybrid", "hybrid"]
        else ("Random Forest (+Features)" if word_model == "rf" else "Byte-LSTM (Bytes Only)")
    )
    serialized_tokens = nc.serialize_tokens(doc, sent_ids, levels_by_tok, word_model_name=word_model_display)

    # รวม verb_forms และ entities ทั่วทั้งบทความ
    all_verb_forms = [vf for u in units for vf in u["verb_forms"]]
    all_entities = [
        {
            "text": ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end": ent.end_char,
        }
        for ent in doc.ents
    ]

    return {
        "general": general_level,
        "breakdown": breakdown,
        "sentences": sentences_data,
        "tokens": serialized_tokens,
        "verb_forms": all_verb_forms,
        "entities": all_entities,
        "model_used": doc_model,
        "model_name": mm.MODEL_NAMES.get(doc_model, doc_model),
        "requested_model": requested_model,
        "models_used": {
            "document": {
                "id": doc_model,
                "name": mm.MODEL_NAMES.get(doc_model, doc_model),
                "label": "Random Forest (+Features)" if doc_model == "rf" else mm.MODEL_NAMES.get(doc_model, doc_model),
            },
            "sentence": {
                "id": sentence_model,
                "name": mm.MODEL_NAMES.get(sentence_model, sentence_model),
                "label": "Byte-LSTM + Features" if sentence_model == "bytehybrid" else mm.MODEL_NAMES.get(sentence_model, sentence_model),
            },
            "word": {
                "id": word_model,
                "name": word_model_display,
                "label": word_model_display,
            },
        },
        "stats": {
            "word_count": len([t for t in doc if t.is_alpha]),
            "sentence_count": len(units),
            "entity_count": len(all_entities),
            "verb_form_count": len(all_verb_forms),
        },
    }


@app.post("/api/compare")
def compare_models(req: CompareRequest):
    pred = get_predictor()
    if not pred:
        raise HTTPException(
            status_code=503, detail="Models are not trained yet. Run ml_models.py first."
        )

    doc, words = validate_english_input(req.text, min_words=1)
    du = nc.doc_unit(doc)
    units = du["units"]
    doc_feats = du["doc_feats"]

    comparison = {}
    for model_key in pred.available_models():
        model_name = mm.MODEL_NAMES.get(model_key, model_key)
        sent_probs = pred.sentence_proba(model_key, units)
        sent_scores = [nc.expected_score(p) for p in sent_probs]
        doc_p = pred.general_proba(model_key, units, doc_feats)
        doc_score = nc.expected_score(doc_p)

        comparison[model_key] = {
            "name": model_name,
            "document": nc.score_label(doc_score),
            "probabilities": [float(x) for x in doc_p],
            "sentences": [
                {
                    "index": i,
                    "text": u["text"],
                    "score": round(sc, 2),
                    "label": nc.score_label(sc)["label"],
                    "level": nc.score_label(sc)["level"],
                }
                for i, (u, sc) in enumerate(zip(units, sent_scores))
            ],
        }

    return {"text": text, "comparison": comparison}


def _feature_group_map(scope):
    if scope == "sentence":
        gmap = {}
        for g, feats in nc.FEATURE_GROUPS.items():
            for feat in feats:
                gmap[feat] = g
        return gmap
    if scope == "document":
        gmap = {}
        for g, feats in nc.DOC_FEATURE_GROUPS.items():
            for feat in feats:
                gmap[feat] = g
        for lvl in nc.LEVELS:
            gmap[f"sent_prob_{lvl}"] = "sentence_model"
            gmap[f"sent_hist_{lvl}"] = "sentence_model"
        return gmap
    gmap = {}
    for name in nc.WORD_FEATURE_NAMES:
        if name.startswith("suf_"):
            gmap[name] = "suffixes"
        elif name.startswith("pre_"):
            gmap[name] = "prefixes"
        else:
            gmap[name] = "frequency_and_shape"
    return gmap


def _rank_features(names, importances, scope):
    gmap = _feature_group_map(scope)
    default_group = "other" if scope in ("sentence", "document") else "frequency_and_shape"
    paired = sorted(
        [
            {
                "name": n,
                "importance": float(v),
                "group": gmap.get(n, default_group),
            }
            for n, v in zip(names, importances)
        ],
        key=lambda d: -d["importance"],
    )
    for idx, item in enumerate(paired, 1):
        item["rank"] = idx
    return paired


def _group_totals(ranked):
    totals = {}
    for item in ranked:
        g = item["group"]
        totals[g] = totals.get(g, 0.0) + item["importance"]
    return totals


def _enrich_metrics(data):
    """แนบรายการฟีเจอร์ทั้งหมดและลำดับความสำคัญเต็ม (ไม่ใช่แค่ top 25) จากโมเดล RF"""
    data["feature_specs"] = {
        "sentence": {
            "total_linguistic_features": len(nc.SENT_FEATURE_NAMES),
            "groups": {
                "vocabulary": nc.VOCAB_FEATS,
                "verb_form": nc.VERB_FEATS,
                "clause": nc.CLAUSE_FEATS,
                "other": nc.OTHER_FEATS,
            },
        },
        "document": {
            "total_linguistic_features": len(nc.DOC_FEATURE_NAMES) + 12,
            "base_doc_features": len(nc.DOC_FEATURE_NAMES),
            "sent_signal_features": [f"sent_prob_{l}" for l in nc.LEVELS] + [f"sent_hist_{l}" for l in nc.LEVELS],
            "extra_doc_features": nc.DOC_EXTRA,
        },
        "word": {
            "total_linguistic_features": len(nc.WORD_FEATURE_NAMES),
            "groups": {
                "frequency_and_shape": ["zipf", "length", "syllables", "vowel_ratio", "has_hyphen"],
                "suffixes": [f"suf_{s}" for s in nc.SUFFIXES],
                "prefixes": [f"pre_{p}" for p in nc.PREFIXES],
            },
        },
    }

    try:
        pred = get_predictor()
        if pred and "rf" in data.get("sentence", {}):
            sent_rf = pred.rf.get("sent")
            if sent_rf is not None and len(sent_rf.feature_importances_) == len(nc.SENT_FEATURE_NAMES):
                ranked_s = _rank_features(nc.SENT_FEATURE_NAMES, sent_rf.feature_importances_, "sentence")
                data["sentence"]["rf"]["feature_importance_all"] = ranked_s
                data["sentence"]["rf"]["group_importance"] = _group_totals(ranked_s)

        if pred and "rf" in data.get("document", {}):
            doc_rf = pred.rf.get("doc")
            doc_names = nc.DOC_FEATURE_NAMES + [f"sent_prob_{l}" for l in nc.LEVELS] + [f"sent_hist_{l}" for l in nc.LEVELS]
            if doc_rf is not None and len(doc_rf.feature_importances_) == len(doc_names):
                ranked_d = _rank_features(doc_names, doc_rf.feature_importances_, "document")
                data["document"]["rf"]["feature_importance_all"] = ranked_d
                data["document"]["rf"]["group_importance"] = _group_totals(ranked_d)

        word_rf = nc._load_word_model()
        if word_rf is not None and "rf" in data.get("word", {}) and len(word_rf.feature_importances_) == len(nc.WORD_FEATURE_NAMES):
            ranked_w = _rank_features(nc.WORD_FEATURE_NAMES, word_rf.feature_importances_, "word")
            data["word"]["rf"]["feature_importance_all"] = ranked_w
            data["word"]["rf"]["group_importance"] = _group_totals(ranked_w)
    except Exception as exc:
        print(f"Warning: Could not enrich full feature importances ({exc})")

    return data


@app.get("/api/metrics")
def get_metrics():
    metrics_path = os.path.join(nc.ART_DIR, "metrics.json")
    if not os.path.exists(metrics_path):
        raise HTTPException(
            status_code=404, detail="metrics.json not found. Models are still training."
        )
    with open(metrics_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return _enrich_metrics(data)


@app.get("/api/level-profiles")
def get_level_profiles():
    metrics_path = os.path.join(nc.ART_DIR, "metrics.json")
    if not os.path.exists(metrics_path):
        raise HTTPException(status_code=404, detail="metrics.json not found.")
    with open(metrics_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("level_profiles", {})


@app.get("/api/dataset-analytics")
def get_dataset_analytics():
    path = os.path.join(nc.ART_DIR, "dataset_analytics.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="dataset_analytics.json not found.")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.post("/api/quiz/generate")
def generate_quiz(req: QuizGenerateRequest):
    doc, words = validate_english_input(req.text, min_words=3)
    if len(words) < 35:
        raise HTTPException(
            status_code=400,
            detail=f"บทความสั้นเกินไปสำหรับการสร้างชุดควิซ (พบ {len(words)} คำ) ต้องการบทความอย่างน้อย 35 คำขึ้นไป (ประมาณ 3 ประโยค) เพื่อให้มีเนื้อหาคำศัพท์และไวยากรณ์เพียงพอสำหรับออกข้อสอบอย่างน้อย 4 ข้อ",
        )
    return quiz.generate_quiz(
        req.text,
        num_questions=req.num_questions or 10,
        types=req.types,
        level=req.level,
    )


@app.post("/api/quiz/grade")
def grade_quiz(req: QuizGradeRequest):
    res = quiz.grade_quiz(req.quiz_id, req.answers)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

