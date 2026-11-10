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
import json
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str
    model: Optional[str] = "auto"  # 'auto', 'rf', 'bilstm', 'bytelstm', 'hybrid'


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
    }


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    doc = nc.parse(text)
    du = nc.doc_unit(doc)
    units = du["units"]
    doc_feats = du["doc_feats"]

    if not units:
        raise HTTPException(status_code=400, detail="No readable text found")

    pred = get_predictor()

    # เลือกโมเดล
    requested_model = (req.model or "auto").lower()
    if requested_model == "auto":
        selected_model = pred.best["document"] if pred else "rf"
    elif requested_model in mm.MODEL_NAMES:
        selected_model = requested_model
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{req.model}'. Choose from: auto, {', '.join(mm.MODEL_NAMES)}",
        )

    # คำนวณระดับบทความ / ประโยค
    sentences_data = []
    sent_levels_num = []

    if pred:
        probs = pred.sentence_proba(selected_model, units)
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
                }
            )

        # General Level ของบทความ
        gen_p = pred.general_proba(selected_model, units, doc_feats)
        gen_score = nc.expected_score(gen_p)
        general_level = nc.score_label(gen_score)
        general_level["probabilities"] = [float(x) for x in gen_p]

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
                }
            )

    # Token-level serialization
    sent_ids = {}
    levels_by_tok = {}
    for s_idx, s in enumerate(doc.sents):
        toks = [t for t in s if not t.is_space]
        t_lvls = nc.token_levels(toks)
        for t, (lvl, src) in zip(toks, t_lvls):
            sent_ids[t.i] = s_idx
            levels_by_tok[t.i] = (lvl, src)

    serialized_tokens = nc.serialize_tokens(doc, sent_ids, levels_by_tok)

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
        "model_used": selected_model,
        "model_name": mm.MODEL_NAMES.get(selected_model, selected_model),
        "requested_model": requested_model,
        "stats": {
            "word_count": len([t for t in doc if t.is_alpha]),
            "sentence_count": len(units),
            "entity_count": len(all_entities),
            "verb_form_count": len(all_verb_forms),
        },
    }


@app.post("/api/compare")
def compare_models(req: CompareRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    pred = get_predictor()
    if not pred:
        raise HTTPException(
            status_code=503, detail="Models are not trained yet. Run ml_models.py first."
        )

    doc = nc.parse(text)
    du = nc.doc_unit(doc)
    units = du["units"]
    doc_feats = du["doc_feats"]

    comparison = {}
    for model_key, model_name in mm.MODEL_NAMES.items():
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
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
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

