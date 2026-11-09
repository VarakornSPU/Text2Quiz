"""
quiz.py — Rule-based quiz generation and grading with linguistic explanations (Thai)
=====================================================================================
สร้างควิซ 3 ประเภทจากบทความจริง:
  1. Vocabulary Cloze (เติมคำศัพท์ ตัวลวงระดับ/POS เดียวกัน ผันรูปเดียวกัน)
  2. Verb Tense / Verb Form (เลือกรูปกริยา ตัวลวงผันจากกริยาตัวเดียวกัน)
  3. Sentence Structure (โครงสร้างประโยค: clause, ตัวเชื่อม, ความซับซ้อน)

ทุกข้อมีคำอธิบายเฉลยเป็นภาษาไทยอย่างละเอียด อิงหลักไวยากรณ์และระดับ CEFR จริง
"""
import os
import re
import uuid
import random
import json
from collections import defaultdict

import lemminflect
import nlp_core as nc

# In-memory store สำหรับเก็บ session ควิซ (คำถาม + เฉลย)
QUIZ_STORE = {}

# โหลด lemma -> POS ที่พบบ่อย (ถ้ามี) หรือใช้ fallback
_POS_CACHE = None


def _get_lemma_pos():
    global _POS_CACHE
    if _POS_CACHE is None:
        path = os.path.join(nc.ART_DIR, "lemma_pos.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                _POS_CACHE = json.load(f)
        else:
            _POS_CACHE = {}
    return _POS_CACHE


def _get_words_by_level_pos():
    """จัดกลุ่มคำศัพท์ตาม (level 1..6, pos) เพื่อใช้สุ่มตัวลวง"""
    lex = nc.get_lexicon()
    lemma_pos = _get_lemma_pos()
    grouped = defaultdict(list)
    for word, lvl in lex.items():
        if not word.isalpha() or len(word) < 3:
            continue
        pos = lemma_pos.get(word, None)
        if pos:
            grouped[(lvl, pos)].append(word)
        else:
            grouped[lvl].append(word)
    return grouped


_GROUPED_WORDS = None


def get_grouped_words():
    global _GROUPED_WORDS
    if _GROUPED_WORDS is None:
        _GROUPED_WORDS = _get_words_by_level_pos()
    return _GROUPED_WORDS


# =============================================================================
# [1] VOCABULARY CLOZE GENERATOR
# =============================================================================
def generate_vocab_questions(doc, target_level=None, max_q=5):
    """สร้างคำถาม Vocabulary Cloze จากคำศัพท์สำคัญในบทความ"""
    questions = []
    tokens = [t for t in doc if not t.is_space]
    token_lvls = nc.token_levels(tokens)
    grouped = get_grouped_words()

    candidates = []
    for t, (lvl, src) in zip(tokens, token_lvls):
        if (
            lvl is not None
            and t.pos_ in nc.CONTENT_POS
            and not nc.is_name_token(t)
            and len(t.text) >= 3
            and t.is_alpha
        ):
            # เน้นคำที่ระดับใกล้เคียง target_level หรือระดับ B1 ขึ้นไป
            diff = abs(lvl - target_level) if target_level else 0
            candidates.append((diff, t, lvl))

    candidates.sort(key=lambda x: x[0])

    used_lemmas = set()
    for _, tok, lvl in candidates:
        if len(questions) >= max_q:
            break
        lemma = tok.lemma_.lower()
        if lemma in used_lemmas:
            continue

        sent = tok.sent
        sent_text = sent.text.strip()
        # แทนที่คำด้วยช่องว่าง [ _____ ]
        start_in_sent = tok.idx - sent.start_char
        end_in_sent = start_in_sent + len(tok.text)
        blanked_sentence = (
            sent_text[:start_in_sent] + "[ _____ ]" + sent_text[end_in_sent:]
        )

        correct_word = tok.text
        # สุ่มตัวลวง 3 ตัว: POS เดียวกัน + ระดับ CEFR เดียวกัน
        distractors = []
        pool = grouped.get((lvl, tok.pos_), []) or grouped.get(lvl, [])
        pool = [w for w in pool if w != lemma and w != correct_word.lower()]
        random.shuffle(pool)

        for candidate_lemma in pool:
            if len(distractors) >= 3:
                break
            # ผันรูปให้อยู่ในรูปเดียวกับคำที่หายไป (เช่น เติม -s, -ed, -ing)
            inflected = lemminflect.getInflection(candidate_lemma, tok.tag_)
            cand_word = inflected[0] if inflected else candidate_lemma
            if tok.text.istitle():
                cand_word = cand_word.capitalize()
            elif tok.text.isupper():
                cand_word = cand_word.upper()
            else:
                cand_word = cand_word.lower()

            if cand_word not in distractors and cand_word != correct_word:
                distractors.append(cand_word)

        # Fallback หากตัวลวงไม่พอ
        fallback_pool = [w for w in grouped.get(lvl, []) if w != lemma]
        random.shuffle(fallback_pool)
        for w in fallback_pool:
            if len(distractors) >= 3:
                break
            if w not in distractors and w != correct_word:
                distractors.append(w)

        if len(distractors) < 3:
            continue

        used_lemmas.add(lemma)
        options = distractors + [correct_word]
        random.shuffle(options)
        correct_idx = options.index(correct_word)

        explanation = (
            f"คำตอบที่ถูกต้องคือ '{correct_word}'\n"
            f"• คำศัพท์: {lemma} (หน้าที่: {tok.pos_}, ระดับ CEFR: {nc.LEVELS[lvl - 1]})\n"
            f"• บริบทในประโยค: คำนี้ทำหน้าที่เป็น {tok.dep_} ขยายหรือเชื่อมโยงกับ '{tok.head.text}'\n"
            f"• ตัวเลือกอื่นถูกตัดออกเนื่องจากความหมายไม่สอดคล้องกับบริบทของประโยค"
        )

        questions.append(
            {
                "id": str(uuid.uuid4())[:8],
                "type": "vocabulary",
                "type_label": "Vocabulary Cloze",
                "sentence": blanked_sentence,
                "original_sentence": sent_text,
                "target_word": correct_word,
                "options": options,
                "correct_index": correct_idx,
                "explanation": explanation,
                "level": nc.LEVELS[lvl - 1],
            }
        )

    return questions


# =============================================================================
# [2] VERB TENSE / VERB FORM GENERATOR
# =============================================================================
def generate_tense_questions(doc, max_q=5):
    """สร้างคำถาม Verb Tense / Verb Form พร้อมเฉลยอธิบายโครงสร้างไวยากรณ์"""
    questions = []
    seen_heads = set()

    for sent in doc.sents:
        if len(questions) >= max_q:
            break
        vfs = nc.detect_verb_forms(sent)
        if not vfs:
            continue

        for vf in vfs:
            if len(questions) >= max_q:
                break
            head_tok = doc[vf["head"]]
            if head_tok.lemma_.lower() in seen_heads or not vf["contiguous"]:
                continue

            lemma = head_tok.lemma_.lower()
            correct_text = vf["text"]
            lvl = vf["level"]

            # สร้างตัวลวงจากกริยาตัวเดิมในรูป tense อื่นๆ
            distractor_forms = [
                ("past_simple", lemminflect.getInflection(lemma, "VBD")),
                ("past_participle", lemminflect.getInflection(lemma, "VBN")),
                ("present_participle", lemminflect.getInflection(lemma, "VBG")),
                ("third_person", lemminflect.getInflection(lemma, "VBZ")),
                ("base_form", lemminflect.getInflection(lemma, "VB")),
                ("present_perf", ("have " if not head_tok.tag_ == "VBZ" else "has ") + (lemminflect.getInflection(lemma, "VBN")[0] if lemminflect.getInflection(lemma, "VBN") else lemma)),
                ("continuous", ("is " if head_tok.tag_ == "VBZ" else "are ") + (lemminflect.getInflection(lemma, "VBG")[0] if lemminflect.getInflection(lemma, "VBG") else lemma)),
            ]

            distractors = []
            for _, val in distractor_forms:
                cand = val[0] if isinstance(val, (list, tuple)) else str(val)
                if cand and cand.lower() != correct_text.lower() and cand not in distractors:
                    distractors.append(cand)
                if len(distractors) >= 3:
                    break

            if len(distractors) < 3:
                continue

            seen_heads.add(lemma)

            # เว้นช่องว่างในประโยค
            tokens_in_vf = [doc[i] for i in vf["tokens"]]
            start_char = tokens_in_vf[0].idx - sent.start_char
            end_char = tokens_in_vf[-1].idx + len(tokens_in_vf[-1].text) - sent.start_char
            blanked = sent.text[:start_char] + "[ _____ ]" + sent.text[end_char:]

            options = distractors[:3] + [correct_text]
            random.shuffle(options)
            correct_idx = options.index(correct_text)

            explanation = (
                f"คำตอบที่ถูกต้องคือ '{correct_text}'\n"
                f"• โครงสร้างไวยากรณ์: {vf['name']} ({vf['pattern']}) — ระดับ CEFR: {nc.LEVELS[lvl - 1]}\n"
                f"• คำอธิบาย: {vf['desc_th']}\n"
                f"• กริยาหลักคือ '{lemma}' ผันรูปตามประธานและเวลาในบริบทประโยคนี้"
            )

            questions.append(
                {
                    "id": str(uuid.uuid4())[:8],
                    "type": "verb_tense",
                    "type_label": "Verb Tense & Form",
                    "sentence": blanked.strip(),
                    "original_sentence": sent.text.strip(),
                    "target_word": correct_text,
                    "options": options,
                    "correct_index": correct_idx,
                    "explanation": explanation,
                    "level": nc.LEVELS[lvl - 1],
                }
            )

    return questions


# =============================================================================
# [3] SENTENCE STRUCTURE GENERATOR
# =============================================================================
def generate_structure_questions(doc, max_q=4):
    """สร้างคำถามเกี่ยวกับโครงสร้างประโยค (Clause, Conjunction, Dependency)"""
    questions = []

    for sent in doc.sents:
        if len(questions) >= max_q:
            break
        ci = nc.analyze_clauses(sent)
        if ci["n_clauses"] < 2:
            continue

        # แบบที่ 1: ถามจำนวน Clause ในประโยค
        n_clauses = ci["n_clauses"]
        options = [str(n_clauses)]
        for delta in [-1, 1, 2, -2]:
            cand = n_clauses + delta
            if cand > 0 and str(cand) not in options:
                options.append(str(cand))
            if len(options) == 4:
                break
        random.shuffle(options)
        correct_idx = options.index(str(n_clauses))

        clauses_summary = "\n".join(
            [f"  - {c['name']}: \"{c['text']}\"" for c in ci["clauses"][:3]]
        )
        explanation = (
            f"ประโยคนี้ประกอบด้วย {n_clauses} clauses (อนุประโยค):\n"
            f"{clauses_summary}\n"
            f"• มีความลึกของ Dependency Tree = {ci['depth']} แสดงถึงความซับซ้อนเชิงไวยากรณ์"
        )

        questions.append(
            {
                "id": str(uuid.uuid4())[:8],
                "type": "structure",
                "type_label": "Sentence Structure",
                "sentence": f"How many clauses (ประโยคย่อย/อนุประโยค) are in this sentence?\n\n\"{sent.text.strip()}\"",
                "original_sentence": sent.text.strip(),
                "target_word": str(n_clauses),
                "options": options,
                "correct_index": correct_idx,
                "explanation": explanation,
                "level": "B1" if n_clauses == 2 else "B2",
            }
        )

        # แบบที่ 2: ถามหาตัวเชื่อม (Marker / Conjunction)
        sub_clauses = [c for c in ci["clauses"] if c["marker_text"] is not None]
        if sub_clauses and len(questions) < max_q:
            target_clause = sub_clauses[0]
            marker = target_clause["marker_text"]
            other_words = [
                t.text
                for t in sent
                if t.text.lower() != marker.lower() and len(t.text) > 2 and t.is_alpha
            ]
            random.shuffle(other_words)
            opts = [marker] + other_words[:3]
            random.shuffle(opts)

            exp = (
                f"ตัวเชื่อมที่ถูกต้องคือ '{marker}'\n"
                f"• ทำหน้าที่เป็นตัวเชื่อมของ {target_clause['name']} ({target_clause['desc_th']})\n"
                f"• เชื่อมกับประโยค: \"{target_clause['text']}\""
            )

            questions.append(
                {
                    "id": str(uuid.uuid4())[:8],
                    "type": "structure",
                    "type_label": "Subordinate Clause Marker",
                    "sentence": f"Which word acts as the clause connector/marker in this sentence?\n\n\"{sent.text.strip()}\"",
                    "original_sentence": sent.text.strip(),
                    "target_word": marker,
                    "options": opts,
                    "correct_index": opts.index(marker),
                    "explanation": exp,
                    "level": "B1",
                }
            )

    return questions


# =============================================================================
# [4] QUIZ MASTER GENERATOR & GRADER
# =============================================================================
def generate_quiz(text, num_questions=10, types=None, level=None):
    """
    สร้างชุดควิซรวมตามการตั้งค่า:
    - num_questions: จำนวนข้อ (5..20)
    - types: list ของ 'vocabulary', 'verb_tense', 'structure' (default เอาหมด)
    - level: 'A1'..'C2' หรือ None (auto)
    """
    doc = nc.parse(text)
    if not types:
        types = ["vocabulary", "verb_tense", "structure"]

    target_num_level = nc.LEVELS.index(level) + 1 if level in nc.LEVELS else None

    # สัดส่วนประเภทคำถาม
    q_pool = []
    if "vocabulary" in types:
        q_pool.extend(generate_vocab_questions(doc, target_level=target_num_level, max_q=num_questions))
    if "verb_tense" in types:
        q_pool.extend(generate_tense_questions(doc, max_q=num_questions))
    if "structure" in types:
        q_pool.extend(generate_structure_questions(doc, max_q=num_questions))

    random.shuffle(q_pool)
    selected_questions = q_pool[:num_questions]

    # บันทึกเฉลยไว้ใน memory
    quiz_id = str(uuid.uuid4())
    answers = {q["id"]: q["correct_index"] for q in selected_questions}
    QUIZ_STORE[quiz_id] = {
        "answers": answers,
        "questions": selected_questions,
    }

    # ซ่อนเฉลยก่อนส่งให้ client
    client_questions = []
    for q in selected_questions:
        cq = {k: v for k, v in q.items() if k not in ("correct_index", "explanation")}
        client_questions.append(cq)

    return {
        "quiz_id": quiz_id,
        "total": len(client_questions),
        "questions": client_questions,
    }


def grade_quiz(quiz_id, user_answers):
    """
    ตรวจควิซ:
    - user_answers: dict { question_id: selected_index }
    คืนผลคะแนนรวม + คะแนนแยกประเภท + เฉลยและคำอธิบายภาษาไทย
    """
    session = QUIZ_STORE.get(quiz_id)
    if not session:
        return {"error": "Quiz session expired or not found"}

    correct_answers = session["answers"]
    full_questions = session["questions"]

    score = 0
    breakdown = defaultdict(lambda: {"correct": 0, "total": 0})
    graded_details = []

    for q in full_questions:
        qid = q["id"]
        qtype = q["type"]
        corr = correct_answers.get(qid)
        user_choice = user_answers.get(qid)
        is_correct = user_choice is not None and int(user_choice) == corr

        if is_correct:
            score += 1
            breakdown[qtype]["correct"] += 1
        breakdown[qtype]["total"] += 1

        graded_details.append(
            {
                "id": qid,
                "type": qtype,
                "type_label": q["type_label"],
                "sentence": q["sentence"],
                "options": q["options"],
                "user_choice": user_choice,
                "correct_index": corr,
                "is_correct": is_correct,
                "explanation": q["explanation"],
                "level": q.get("level", "B1"),
            }
        )

    total = len(full_questions)
    percentage = round((score / total) * 100, 1) if total > 0 else 0

    return {
        "score": score,
        "total": total,
        "percentage": percentage,
        "breakdown": dict(breakdown),
        "details": graded_details,
    }

