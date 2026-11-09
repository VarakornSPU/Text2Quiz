"""
compute_dataset_analytics.py — Computes comprehensive Dataset Visualizations & Analytics
========================================================================================
สกัดสถิติเชิงลึกจากชุดข้อมูลจริงทั้งหมดใน 'Dataset Project ML/':
  1. Dataset Overview & Source Distribution
  2. POS Distribution across CEFR Levels (A1..C2)
  3. Verb Form & Tense Distribution across CEFR Levels (A1..C2)
  4. Sentence Length & Tree Depth across CEFR Levels (A1..C2)
  5. Named Entity (NER) Frequency across Levels and Datasets
  6. Lemmatization Impact & Coverage (with vs without Lemma)
  7. Sample sentences per level with linguistic markup
บันทึกเป็น backend/artifacts/dataset_analytics.json
"""
import os
import sys
import json
from collections import defaultdict, Counter

import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nlp_core as nc
import ml_models as mm

DATA_DIR = nc.DATA_DIR
ART_DIR = nc.ART_DIR


def main():
    print("Computing Dataset Analytics...")

    # 1. Words Dataset (ENGLISH_CERF_WORDS.csv)
    wdf = pd.read_csv(os.path.join(DATA_DIR, "ENGLISH_CERF_WORDS.csv"))
    word_counts = {lvl: int((wdf["CEFR"] == lvl).sum()) for lvl in nc.LEVELS}
    total_words = len(wdf)

    # 2. Articles Dataset (cefr_leveled_texts.csv)
    adf = pd.read_csv(os.path.join(DATA_DIR, "cefr_leveled_texts.csv"))
    adf = adf[adf["label"].isin(nc.LEVELS)].copy()
    adf["word_count"] = adf["text"].apply(lambda t: len(t.split()))
    article_counts = {lvl: int((adf["label"] == lvl).sum()) for lvl in nc.LEVELS}
    article_avg_words = {
        lvl: round(float(adf[adf["label"] == lvl]["word_count"].mean()), 1)
        for lvl in nc.LEVELS
    }

    # 3. Sentence Datasets (CEFR-SP & ReadMe)
    sdf = mm.load_sentence_data()
    total_sentences = len(sdf)
    sentence_counts = {
        lvl: int((sdf["label"] == (i + 1)).sum()) for i, lvl in enumerate(nc.LEVELS)
    }
    source_counts = sdf["source"].value_counts().to_dict()

    # 4. Analyze Linguistic distributions by Level (sample up to 250 sentences per level)
    print("Sampling & analyzing sentences by CEFR level...")
    nlp = nc.get_nlp()

    pos_by_level = {lvl: Counter() for lvl in nc.LEVELS}
    vf_by_level = {lvl: Counter() for lvl in nc.LEVELS}
    length_by_level = {lvl: [] for lvl in nc.LEVELS}
    depth_by_level = {lvl: [] for lvl in nc.LEVELS}
    clauses_by_level = {lvl: [] for lvl in nc.LEVELS}
    ner_by_level = {lvl: [] for lvl in nc.LEVELS}
    ner_by_source = defaultdict(list)

    samples_by_level = {lvl: [] for lvl in nc.LEVELS}

    # Lemma coverage test
    lemma_hits_total = 0
    surface_hits_total = 0
    total_content_tokens = 0
    lex = nc.get_lexicon()

    for lvl_idx, lvl in enumerate(nc.LEVELS):
        sub = sdf[sdf["label"] == (lvl_idx + 1)]
        sample = sub.sample(min(len(sub), 200), random_state=42)

        docs = list(nlp.pipe(sample["text"], batch_size=64))
        for text, doc, src in zip(sample["text"], docs, sample["source"]):
            span = doc[:]
            words = [t for t in span if t.is_alpha]
            length_by_level[lvl].append(len(words))

            # POS distribution
            for t in words:
                pos_by_level[lvl][t.pos_] += 1
                if t.pos_ in nc.CONTENT_POS:
                    total_content_tokens += 1
                    if t.lemma_.lower() in lex:
                        lemma_hits_total += 1
                    if t.lower_ in lex:
                        surface_hits_total += 1

            # Verb Forms & Tense
            vfs = nc.detect_verb_forms(span)
            for vf in vfs:
                vf_by_level[lvl][vf["name"]] += 1

            # Clauses & Depth
            ci = nc.analyze_clauses(span)
            depth_by_level[lvl].append(ci["depth"])
            clauses_by_level[lvl].append(ci["n_clauses"])

            # NER
            n_ents = sum(1 for t in span if t.ent_iob_ == "B" and t.ent_type_ in nc.NAME_ENTS)
            ner_by_level[lvl].append(n_ents)
            ner_by_source[src].append(n_ents)

            # Store 3 interesting sample sentences for UI explorer
            if len(samples_by_level[lvl]) < 3 and len(vfs) > 0 and ci["n_clauses"] > 1:
                samples_by_level[lvl].append({
                    "text": text,
                    "source": src,
                    "level": lvl,
                    "word_count": len(words),
                    "clauses": ci["n_clauses"],
                    "depth": ci["depth"],
                    "verb_forms": [vf["name"] for vf in vfs],
                    "tokens": [{"text": t.text, "pos": t.pos_, "lemma": t.lemma_} for t in span if not t.is_space][:15]
                })

    # Normalize POS distribution to percentage per level
    pos_chart = []
    top_pos_tags = ["NOUN", "VERB", "ADJ", "ADV", "PRON", "ADP", "AUX", "CCONJ", "SCONJ"]
    for lvl in nc.LEVELS:
        total_pos = sum(pos_by_level[lvl].values()) or 1
        row = {"level": lvl}
        for pos in top_pos_tags:
            row[pos] = round((pos_by_level[lvl][pos] / total_pos) * 100, 1)
        pos_chart.append(row)

    # Top Tenses across levels
    tense_chart = []
    top_tenses = [
        "Present simple", "Past simple", "Present continuous", "Present perfect",
        "Future (will)", "Past continuous", "Past perfect", "Present simple passive",
        "Present perfect continuous", "Modal"
    ]
    for lvl in nc.LEVELS:
        tot_vf = sum(vf_by_level[lvl].values()) or 1
        row = {"level": lvl}
        for t in top_tenses:
            row[t] = round((vf_by_level[lvl][t] / tot_vf) * 100, 1)
        tense_chart.append(row)

    # Length & Complexity Averages
    complexity_chart = []
    for lvl in nc.LEVELS:
        complexity_chart.append({
            "level": lvl,
            "avg_words": round(float(np.mean(length_by_level[lvl])), 1) if length_by_level[lvl] else 0,
            "avg_depth": round(float(np.mean(depth_by_level[lvl])), 1) if depth_by_level[lvl] else 0,
            "avg_clauses": round(float(np.mean(clauses_by_level[lvl])), 2) if clauses_by_level[lvl] else 0,
            "avg_ner": round(float(np.mean(ner_by_level[lvl])), 2) if ner_by_level[lvl] else 0,
        })

    # Lemmatization Coverage Impact
    tot_c = max(1, total_content_tokens)
    lemma_impact = {
        "lemma_coverage_pct": round((lemma_hits_total / tot_c) * 100, 1),
        "surface_coverage_pct": round((surface_hits_total / tot_c) * 100, 1),
        "oov_reduction_pct": round(((lemma_hits_total - surface_hits_total) / tot_c) * 100, 1),
        "total_analyzed_tokens": total_content_tokens,
    }

    # NER frequency by source
    ner_source_summary = {
        src: round(float(np.mean(vals)), 2) for src, vals in ner_by_source.items()
    }

    result = {
        "overview": {
            "total_sentences": total_sentences,
            "total_articles": len(adf),
            "total_lexicon_words": total_words,
            "sentence_counts": sentence_counts,
            "article_counts": article_counts,
            "word_counts": word_counts,
            "source_counts": source_counts,
            "article_avg_words": article_avg_words,
        },
        "pos_distribution": pos_chart,
        "tense_distribution": tense_chart,
        "complexity_metrics": complexity_chart,
        "lemma_impact": lemma_impact,
        "ner_by_source": ner_source_summary,
        "sample_sentences": samples_by_level,
    }

    out_path = os.path.join(ART_DIR, "dataset_analytics.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Dataset Analytics saved to {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()

