"""
nlp_core.py — Linguistic processing & feature extraction for CEFR analysis
===========================================================================
ใช้ร่วมกันทั้งตอน train (ml_models.py) และตอนใช้งานจริง (app.py / quiz.py)
เพื่อให้ feature ที่โมเดลเห็นตอน train กับตอนใช้งาน "เหมือนกันทุกประการ"

Sections
  [1] CONSTANTS & PIPELINE      โหลด spaCy ครั้งเดียว, ค่าคงที่ระดับ CEFR
  [2] WORD LEXICON              หาระดับคำ: lemma -> wordlist -> word model (OOV)
  [3] TENSE / VERB-FORM DETECTOR  แยก verb group แล้วระบุ tense + ระดับไวยากรณ์
  [4] CLAUSE ANALYZER           นับ/จำแนก clause, ความลึก tree
  [5] FEATURE EXTRACTION        vector feature ระดับประโยค / บทความ + token sequences
  [6] SCORE UTILS               probability -> คะแนนทศนิยม เช่น "B1.9"
  [7] TOKEN SERIALIZATION       แปลงผลวิเคราะห์เป็น JSON สำหรับ frontend
  [8] SELF-TEST                 python nlp_core.py

หลักการเรื่อง Lemma / NER (สำคัญ):
  * ไม่มีคำไหนถูกตัดออกจากข้อความ — lemma และ NER เป็นข้อมูล "เพิ่ม" ต่อ token
  * tense อ่านจากคำเดิม + tag (VBD/VBN/VBG) + auxiliaries  -> ไม่ผ่าน lemma
  * lemma ใช้เฉพาะ lookup ระดับคำใน wordlist (stories -> story)
  * ชื่อเฉพาะ/ตัวเลข ไม่ได้รับ "ระดับคำศัพท์" แต่ยังนับในโครงสร้างประโยคทั้งหมด
"""
import os
import re
import math
import functools

import numpy as np
import pandas as pd
import spacy
from wordfreq import zipf_frequency

# =============================================================================
# [1] CONSTANTS & PIPELINE
# =============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "Dataset Project ML")
ART_DIR = os.path.join(BASE_DIR, "artifacts")
os.makedirs(ART_DIR, exist_ok=True)

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
SPACY_MODEL = "en_core_web_md"

# entity ที่เป็น "ชื่อ" -> ไม่ให้ระดับคำศัพท์ (Paris, Marlboro, Delpire ...)
NAME_ENTS = {"PERSON", "GPE", "ORG", "NORP", "FAC", "LOC", "PRODUCT",
             "EVENT", "WORK_OF_ART", "LAW", "LANGUAGE"}
# POS ที่ไม่มีระดับคำศัพท์ (เหมือน "propn. -∞ / intj. -∞" ในเว็บตัวอย่าง)
NO_LEVEL_POS = {"PROPN", "NUM", "PUNCT", "SYM", "SPACE", "X", "INTJ"}
CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV"}
CONTRACTIONS = {"'s", "'re", "'ve", "'ll", "'d", "n't", "'m", "’s", "’re", "’ve", "’ll", "’d", "n’t", "’m"}


@functools.lru_cache(maxsize=None)
def get_nlp():
    """โหลด spaCy pipeline ครั้งเดียวทั้งโปรแกรม (exclude tokenizer เพื่อเลี่ยง Windows 64-bit int bug)"""
    return spacy.load(SPACY_MODEL, exclude=["tokenizer"])


def parse(text):
    doc = get_nlp()(text)
    # Retokenize เพื่อรวมคำย่อ เช่น "don't", "isn't", "won't", "can't" ให้เป็นคำเดียว
    # แก้ปัญหา "do n't" หรือ "is n't" แยกกันในหน้า UI และ Tense detector
    if len(doc) > 1:
        with doc.retokenize() as r:
            for i in range(len(doc) - 1):
                t2 = doc[i + 1].text.lower()
                if t2 in ("n't", "'t", "nt") or (t2 in ("'re", "'ve", "'ll", "'d", "'m") and doc[i].pos_ == "PRON"):
                    r.merge(doc[i:i + 2], attrs={
                        "LEMMA": doc[i].lemma_,
                        "POS": doc[i].pos_,
                        "TAG": doc[i].tag_,
                        "DEP": doc[i].dep_,
                    })
    return doc


# =============================================================================
# [2] WORD LEXICON  (ระดับคำ)
# =============================================================================
@functools.lru_cache(maxsize=None)
def get_lexicon():
    """ENGLISH_CERF_WORDS.csv -> {word: level(1..6)}
    - headword แบบ 'analyze/analyse' แยกด้วย '/'
    - headword ซ้ำ -> ใช้ระดับต่ำสุด (ความหมายพื้นฐานที่สุด)
    - วลี เช่น 'according to' เก็บไว้ใน lex_phrases (ไม่ใช้ lookup รายคำ)"""
    df = pd.read_csv(os.path.join(DATA_DIR, "ENGLISH_CERF_WORDS.csv"))
    lex = {}
    for hw, lvl in zip(df["headword"], df["CEFR"]):
        if not isinstance(hw, str) or lvl not in LEVELS:
            continue
        for form in hw.split("/"):
            form = form.strip().lower()
            if form:
                lex[form] = min(lex.get(form, 9), LEVELS.index(lvl) + 1)
    return lex


def syllables(word):
    """นับพยางค์แบบ heuristic (กลุ่มสระ)"""
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee", "ye")) and n > 1:
        n -= 1
    return max(1, n)


SUFFIXES = ["tion", "sion", "ment", "ness", "ity", "ous", "ive", "al", "ly", "able", "ible",
            "ful", "less", "ise", "ize", "ence", "ance", "er", "est", "ing", "ed", "ist", "ism", "ic"]
PREFIXES = ["un", "in", "im", "dis", "re", "pre", "over", "under", "non", "mis", "inter", "trans"]
WORD_FEATURE_NAMES = (["zipf", "length", "syllables", "vowel_ratio", "has_hyphen"]
                      + [f"suf_{s}" for s in SUFFIXES] + [f"pre_{p}" for p in PREFIXES])


def word_feature_vector(word):
    """feature ของ 'คำเดี่ยว' สำหรับ word model (ทำนายระดับคำที่ไม่อยู่ใน wordlist)"""
    w = word.lower()
    letters = re.sub(r"[^a-z]", "", w)
    v = [zipf_frequency(w, "en"), len(w), syllables(w),
         (sum(c in "aeiou" for c in letters) / max(1, len(letters))), float("-" in w)]
    v += [float(w.endswith(s) and len(w) > len(s) + 2) for s in SUFFIXES]
    v += [float(w.startswith(p) and len(w) > len(p) + 3) for p in PREFIXES]
    return v


# word model (RF) ถูก train ใน ml_models.py แล้ว set เข้ามาที่นี่
_WORD_MODEL = {"model": None}
_OOV_CACHE = {}


def set_word_model(model):
    _WORD_MODEL["model"] = model
    _OOV_CACHE.clear()


def _load_word_model():
    if _WORD_MODEL["model"] is None:
        path = os.path.join(ART_DIR, "word_rf.joblib")
        if os.path.exists(path):
            import joblib
            _WORD_MODEL["model"] = joblib.load(path)
    return _WORD_MODEL["model"]


def _predict_oov(words):
    """ทำนายระดับคำที่ไม่อยู่ใน wordlist แบบ batch (เร็วกว่าทีละคำมาก) แล้ว cache ไว้"""
    todo = [w for w in set(words) if w not in _OOV_CACHE]
    if not todo:
        return
    model = _load_word_model()
    if model is None:  # fallback ก่อน train: ใช้ความถี่คำ
        for w in todo:
            z = zipf_frequency(w, "en")
            _OOV_CACHE[w] = int(np.clip(round(7.5 - z), 1, 6))
        return
    X = np.array([word_feature_vector(w) for w in todo])
    for w, p in zip(todo, model.predict(X)):
        _OOV_CACHE[w] = int(p) + 1


def is_name_token(tok):
    """True = ชื่อเฉพาะ / entity ที่ไม่ควรมีระดับคำศัพท์
    สำคัญ: คำศัพท์ทั่วไปที่ขึ้นต้นตัวพิมพ์ใหญ่ (เช่น Membership, Body, Information) มักถูก spaCy
    เข้าใจผิดว่าเป็น PROPN — หากคำนั้นอยู่ในพจนานุกรม CEFR ให้ถือว่าเป็นคำศัพท์ทั่วไปที่มีระดับตามปกติ"""
    low = tok.lower_
    lem = tok.lemma_.lower()
    lex = get_lexicon()
    if low in lex or lem in lex:
        return False
    return tok.pos_ == "PROPN" or tok.ent_type_ in NAME_ENTS


def token_levels(tokens, use_lemma=True):
    """คืน list ของ (level 1..6 หรือ None, source) ต่อ token
    source: 'wordlist' | 'model' (OOV) | 'none' (ไม่มีระดับ: ชื่อเฉพาะ, ตัวเลข, เครื่องหมาย)
    use_lemma=False ใช้สำหรับการทดลอง ablation (lookup ด้วยรูปคำเดิม)"""
    lex = get_lexicon()
    out, oov = [], []
    for tok in tokens:
        low = tok.lower_
        if tok.pos_ in NO_LEVEL_POS or is_name_token(tok) or not any(c.isalpha() for c in low) or tok.like_num:
            out.append((None, "none"))
            continue
        if low in CONTRACTIONS:
            out.append((1, "wordlist"))
            continue
        key = tok.lemma_.lower() if use_lemma else low
        if key in lex:
            out.append((lex[key], "wordlist"))
        elif low in lex:
            out.append((lex[low], "wordlist"))
        else:
            out.append((None, "model:" + key))
            oov.append(key)
    if oov:
        _predict_oov(oov)
        out = [(_OOV_CACHE[s[6:]], "model") if s.startswith("model:") else (l, s) for l, s in out]
    return out


# =============================================================================
# [3] TENSE / VERB-FORM DETECTOR
# =============================================================================
# form -> (ระดับ CEFR 1..6, ชื่อ, โครงสร้าง, คำอธิบายภาษาไทย)  อ้างอิง English Grammar Profile (โดยประมาณ)
VERB_FORMS = {
    "present_simple":       (1, "Present simple", "V / V-s", "เหตุการณ์ทั่วไป ความจริง หรือกิจวัตร"),
    "imperative":           (1, "Imperative", "V (ไม่มีประธาน)", "ประโยคคำสั่ง/ขอร้อง"),
    "present_continuous":   (1, "Present continuous", "am/is/are + V-ing", "กำลังเกิดขึ้นตอนนี้ หรือช่วงนี้"),
    "infinitive":           (1, "To-infinitive", "to + V", "รูป to + กริยาช่องที่ 1 (non-finite)"),
    "modal_can":            (1, "Modal (can)", "can + V", "ความสามารถ/การขออนุญาต"),
    "past_simple":          (2, "Past simple", "V-ed / V2", "เหตุการณ์ที่จบแล้วในอดีต"),
    "past_continuous":      (2, "Past continuous", "was/were + V-ing", "กำลังเกิดขึ้น ณ ช่วงเวลาหนึ่งในอดีต"),
    "future_will":          (2, "Future (will)", "will + V", "อนาคต การคาดการณ์ หรือการตัดสินใจทันที"),
    "going_to":             (2, "Future (be going to)", "am/is/are going to + V", "แผนหรือความตั้งใจในอนาคต"),
    "present_perfect":      (2, "Present perfect", "have/has + V3", "เกิดในอดีตและเชื่อมโยงถึงปัจจุบัน"),
    "modal_basic":          (2, "Modal", "could/should/must + V", "ความเป็นไปได้ คำแนะนำ หรือความจำเป็น"),
    "used_to":              (2, "Used to", "used to + V", "สิ่งที่เคยทำเป็นประจำในอดีต"),
    "gerund":               (2, "Gerund / -ing form", "V-ing", "กริยาเติม -ing ทำหน้าที่เหมือนคำนามหรือ clause ย่อ"),
    "past_perfect":         (3, "Past perfect", "had + V3", "เกิดก่อนอีกเหตุการณ์หนึ่งในอดีต"),
    "passive_present":      (3, "Present simple passive", "am/is/are + V3", "ประธานเป็นผู้ถูกกระทำ (ปัจจุบัน)"),
    "passive_past":         (3, "Past simple passive", "was/were + V3", "ประธานเป็นผู้ถูกกระทำ (อดีต)"),
    "passive_future":       (3, "Future passive", "will be + V3", "ประธานเป็นผู้ถูกกระทำ (อนาคต)"),
    "passive_infinitive":   (3, "Passive infinitive", "to be + V3", "to-infinitive รูปถูกกระทำ"),
    "present_perfect_continuous": (3, "Present perfect continuous", "have/has been + V-ing",
                                   "เริ่มในอดีตและยังดำเนินต่อเนื่องถึงปัจจุบัน"),
    "modal_advanced":       (3, "Modal (may/might/would)", "may/might/would + V", "ความเป็นไปได้ไม่แน่นอน/สมมติ"),
    "passive_modal":        (3, "Modal passive", "modal + be + V3", "modal ในรูปถูกกระทำ"),
    "participle_clause":    (3, "Participle clause", "V3 / V-ing (ไม่มี aux)", "clause ย่อด้วย participle"),
    "future_continuous":    (4, "Future continuous", "will be + V-ing", "กำลังดำเนินอยู่ ณ เวลาหนึ่งในอนาคต"),
    "future_perfect":       (4, "Future perfect", "will have + V3", "จะเสร็จสิ้นก่อนเวลาหนึ่งในอนาคต"),
    "passive_perfect":      (4, "Perfect passive", "have/has/had been + V3", "perfect ในรูปถูกกระทำ"),
    "passive_continuous":   (4, "Continuous passive", "am/is/are/was being + V3", "กำลังถูกกระทำ"),
    "past_perfect_continuous": (4, "Past perfect continuous", "had been + V-ing",
                                "ดำเนินต่อเนื่องมาจนถึงจุดหนึ่งในอดีต"),
    "modal_perfect":        (4, "Modal perfect", "modal + have + V3", "คาดเดา/เสียดายเกี่ยวกับอดีต (should have, might have)"),
    "modal_continuous":     (4, "Modal continuous", "modal + be + V-ing", "modal + กำลังกระทำ"),
    "perfect_infinitive":   (4, "Perfect infinitive", "to have + V3", "to-infinitive รูป perfect"),
    "future_perfect_continuous": (5, "Future perfect continuous", "will have been + V-ing",
                                  "ดำเนินต่อเนื่องจนถึงจุดหนึ่งในอนาคต"),
    "inversion":            (5, "Inversion", "Had/Were/Should + S + V / Never have I...", "สลับกริยาช่วยไว้หน้าประธาน (ภาษาทางการ)"),
    "subjunctive":          (5, "Subjunctive", "suggest/insist that + S + V", "ใช้กริยารูปฐานหลัง suggest/insist/recommend that"),
}
VERB_FORM_KEYS = list(VERB_FORMS)

# กลุ่ม form สำหรับ feature (ลด sparsity)
FORM_GROUPS = {
    "vf_present": {"present_simple", "imperative", "present_continuous"},
    "vf_past": {"past_simple", "past_continuous", "used_to"},
    "vf_perfect": {"present_perfect", "past_perfect", "present_perfect_continuous", "past_perfect_continuous",
                   "future_perfect", "future_perfect_continuous", "passive_perfect", "modal_perfect", "perfect_infinitive"},
    "vf_continuous": {"present_continuous", "past_continuous", "present_perfect_continuous", "past_perfect_continuous",
                      "future_continuous", "passive_continuous", "modal_continuous", "future_perfect_continuous"},
    "vf_passive": {"passive_present", "passive_past", "passive_future", "passive_infinitive", "passive_modal",
                   "passive_perfect", "passive_continuous"},
    "vf_modal": {"modal_can", "modal_basic", "modal_advanced", "modal_perfect", "modal_continuous", "passive_modal"},
    "vf_future": {"future_will", "going_to", "future_continuous", "future_perfect", "passive_future",
                  "future_perfect_continuous"},
    "vf_nonfinite": {"infinitive", "gerund", "participle_clause", "passive_infinitive", "perfect_infinitive"},
    "vf_rare": {"inversion", "subjunctive"},
}
NONFINITE = FORM_GROUPS["vf_nonfinite"]
SUBJUNCTIVE_TRIGGERS = {"suggest", "insist", "recommend", "demand", "propose", "require", "request", "urge"}
NEG_INVERSION = {"never", "rarely", "seldom", "hardly", "little", "scarcely", "nowhere"}


def _aux_info(head):
    auxes = sorted([c for c in head.children if c.dep_ in ("aux", "auxpass")], key=lambda t: t.i)
    return auxes, [a.lemma_.lower() for a in auxes]


def _classify_group(head, auxes, lem):
    """ระบุ verb form จาก head verb + กริยาช่วย (อ่านจาก tag ของคำเดิม ไม่ใช่ lemma)"""
    tag = head.tag_
    passive = any(a.dep_ == "auxpass" for a in auxes)
    has_to = any(a.tag_ == "TO" for a in auxes)
    modal = next((a for a in auxes if a.tag_ == "MD"), None)
    perfect = any(a.lemma_.lower() == "have" and a.dep_ == "aux" for a in auxes) and \
        (tag == "VBN" or any(a.tag_ == "VBN" for a in auxes))
    progressive = tag == "VBG" and any(a.lemma_.lower() == "be" and a.dep_ == "aux" for a in auxes)

    # ---- non-finite ----
    if has_to:
        if perfect:
            return "perfect_infinitive"
        if passive:
            return "passive_infinitive"
        return "infinitive"
    # ---- modal ----
    if modal is not None:
        m = modal.lower_
        if m in ("will", "'ll", "shall", "wo", "’ll"):
            if perfect and progressive:
                return "future_perfect_continuous"
            if perfect:
                return "future_perfect"
            if passive:
                return "passive_future"
            if progressive:
                return "future_continuous"
            return "future_will"
        if perfect:
            return "modal_perfect"
        if passive:
            return "passive_modal"
        if progressive:
            return "modal_continuous"
        if m in ("can", "ca"):
            return "modal_can"
        if m in ("may", "might", "would", "'d", "’d"):
            return "modal_advanced"
        return "modal_basic"
    # ---- finite, no modal ----
    first = auxes[0] if auxes else head
    past = first.tag_ == "VBD"
    if perfect and progressive:
        return "past_perfect_continuous" if past else "present_perfect_continuous"
    if perfect and passive:
        return "passive_perfect"
    if perfect:
        return "past_perfect" if past else "present_perfect"
    if passive and any(a.lower_ == "being" for a in auxes):
        return "passive_continuous"
    if progressive:
        return "past_continuous" if past else "present_continuous"
    if passive:
        return "passive_past" if past else "passive_present"
    if auxes:  # do/does/did + V
        return "past_simple" if past else "present_simple"
    if tag == "VBD":
        return "past_simple"
    if tag in ("VBZ", "VBP"):
        return "present_simple"
    if tag == "VBG":
        return "gerund"
    if tag == "VBN":
        return "participle_clause"
    if tag == "VB":
        has_subj = any(c.dep_ in ("nsubj", "nsubjpass", "expl") for c in head.children)
        if not has_subj and head.dep_ in ("ROOT", "conj"):
            return "imperative"
        if has_subj and head.head.lemma_.lower() in SUBJUNCTIVE_TRIGGERS and head.dep_ == "ccomp":
            return "subjunctive"
        return "present_simple" if has_subj else "infinitive"
    return "present_simple"


def detect_verb_forms(span):
    """หา verb group ทุกตัวในประโยค -> list ของ dict
    ตัวอย่าง: 'have been examining' -> present_perfect_continuous (B1)"""
    forms, skip = [], set()
    for tok in span:
        if tok.i in skip or tok.pos_ not in ("VERB", "AUX") or tok.dep_ in ("aux", "auxpass"):
            continue
        auxes, lem = _aux_info(tok)
        form = None
        # 'be going to + V' และ 'used to + V' -> รวม group กับกริยาตัวถัดไป
        xc = next((c for c in tok.children if c.dep_ == "xcomp" and c.pos_ in ("VERB", "AUX")
                   and any(a.tag_ == "TO" for a in c.children)), None)
        if xc is not None and tok.lemma_ == "go" and tok.tag_ == "VBG" and "be" in lem:
            form = "going_to"
        elif xc is not None and tok.lower_ == "used" and tok.tag_ == "VBD" and not auxes:
            form = "used_to"
        if form:
            skip.add(xc.i)
            extra = [xc] + [a for a in xc.children if a.tag_ == "TO"]
        else:
            form = _classify_group(tok, auxes, lem)
            extra = []
        # inversion: กริยาช่วยอยู่หน้าประธานในประโยคบอกเล่า (Had I known..., Never have I...)
        subj = next((c for c in tok.children if c.dep_ in ("nsubj", "nsubjpass")), None)
        if auxes and subj is not None and auxes[0].i < subj.i and form not in NONFINITE \
                and not span.text.strip().endswith("?") and auxes[0].lower_ in ("had", "were", "should", "have", "has", "do", "does", "did") \
                and (tok.dep_ == "advcl" and not any(c.dep_ == "mark" for c in tok.children)
                     or any(t.lower_ in NEG_INVERSION for t in span[:max(1, auxes[0].i - span.start)])):
            form = "inversion"
        negs = [c for c in tok.children if c.dep_ == "neg"]
        group = sorted(auxes + negs + [tok] + extra, key=lambda t: t.i)
        idx = [t.i for t in group]
        lvl, name, pattern, desc = VERB_FORMS[form]
        forms.append({
            "form": form, "level": lvl, "name": name, "pattern": pattern, "desc_th": desc,
            "head": tok.i, "tokens": idx, "text": " ".join(t.text for t in group),
            "contiguous": idx == list(range(idx[0], idx[-1] + 1)), "negated": bool(negs),
            "finite": form not in NONFINITE, "subject": subj.i if subj is not None else None,
        })
    return forms


# =============================================================================
# [4] CLAUSE ANALYZER
# =============================================================================
CLAUSE_TYPES = {
    "relcl": ("relative", "Relative clause", "อนุประโยคขยายคำนาม (who/which/that)"),
    "advcl": ("adverbial", "Adverbial clause", "อนุประโยคบอกเวลา/เหตุผล/เงื่อนไข (when/because/if)"),
    "ccomp": ("complement", "Complement clause", "อนุประโยคทำหน้าที่เป็นกรรม (that/what ...)"),
    "csubj": ("subject", "Subject clause", "อนุประโยคทำหน้าที่เป็นประธาน"),
    "csubjpass": ("subject", "Subject clause", "อนุประโยคทำหน้าที่เป็นประธาน"),
    "xcomp": ("nonfinite", "Non-finite clause", "clause ที่ไม่มีประธานของตัวเอง (to + V / V-ing)"),
    "acl": ("nonfinite", "Non-finite clause", "clause ย่อขยายคำนาม"),
    "conj": ("coordinate", "Coordinate clause", "clause ที่เชื่อมด้วย and/but/or"),
}


def _depth(tok):
    d = 0
    while tok.head.i != tok.i:
        tok = tok.head
        d += 1
    return d


def analyze_clauses(span):
    """คืน dict: รายการ clause (main + subordinate), จำนวน finite clause, ความลึก tree ฯลฯ"""
    clauses = []
    root = span.root
    for tok in span:
        if tok.pos_ not in ("VERB", "AUX") or tok.dep_ in ("aux", "auxpass"):
            continue
        if tok.i == root.i:
            continue
        dep = tok.dep_
        if dep == "conj":
            # นับเป็น clause เฉพาะเมื่อมีประธานของตัวเอง (ไม่งั้นเป็นแค่กริยาซ้อน)
            if not any(c.dep_ in ("nsubj", "nsubjpass", "expl") for c in tok.children):
                continue
        if dep not in CLAUSE_TYPES:
            continue
        ctype, name, desc = CLAUSE_TYPES[dep]
        marker = next((c for c in tok.children if c.dep_ == "mark"), None)
        if marker is None and ctype == "relative":
            marker = next((t for t in tok.subtree if t.tag_ in ("WDT", "WP", "WP$", "WRB") or
                           (t.lower_ == "that" and t.dep_ in ("nsubj", "dobj", "nsubjpass"))), None)
        if marker is None and ctype == "coordinate":
            marker = next((c for c in tok.head.children if c.dep_ == "cc" and c.i < tok.i), None)
        has_subj = any(c.dep_ in ("nsubj", "nsubjpass", "expl", "csubj") for c in tok.children) or \
            (ctype == "relative" and marker is not None)
        finite = ctype != "nonfinite" and (has_subj or tok.tag_ in ("VBD", "VBZ", "VBP") or
                                           any(c.tag_ == "MD" or c.lemma_ in ("be", "have", "do") and c.dep_ in ("aux", "auxpass")
                                               and c.tag_ in ("VBD", "VBZ", "VBP") for c in tok.children))
        sub = list(tok.subtree)
        clauses.append({"type": ctype, "name": name, "desc_th": desc, "verb": tok.i,
                        "marker": marker.i if marker is not None else None,
                        "marker_text": marker.text if marker is not None else None,
                        "start": sub[0].i, "end": sub[-1].i, "finite": bool(finite),
                        "text": " ".join(t.text for t in sub)})
    # main clause = root subtree ลบ subordinate subtrees ที่ไม่ใช่ coordinate
    covered = set()
    for c in clauses:
        if c["type"] != "coordinate":
            covered.update(range(c["start"], c["end"] + 1))
    main_tokens = [t for t in span if t.i not in covered and not t.is_punct]
    main = {"type": "main", "name": "Main clause", "desc_th": "ประโยคหลัก", "verb": root.i, "marker": None,
            "marker_text": None, "start": span.start, "end": span.end - 1, "finite": True,
            "text": " ".join(t.text for t in main_tokens)}
    words = [t for t in span if not t.is_punct and not t.is_space]
    dists = [abs(t.i - t.head.i) for t in words if t.head.i != t.i]
    return {
        "clauses": [main] + clauses,
        "n_clauses": 1 + len(clauses),
        "n_finite": 1 + sum(c["finite"] for c in clauses),
        "depth": max((_depth(t) for t in span), default=0),
        "mean_dep_dist": float(np.mean(dists)) if dists else 0.0,
        "max_dep_dist": float(max(dists)) if dists else 0.0,
        "counts": {k: sum(c["type"] == k for c in clauses)
                   for k in ("relative", "adverbial", "complement", "subject", "nonfinite", "coordinate")},
    }


# =============================================================================
# [5] FEATURE EXTRACTION
# =============================================================================
POS_LIST = ["NOUN", "VERB", "ADJ", "ADV", "PRON", "ADP", "CCONJ", "SCONJ", "DET", "PROPN", "NUM", "AUX"]

VOCAB_FEATS = (["n_words"] + [f"prop_{l}" for l in LEVELS] +
               ["prop_oov", "mean_level", "max_level", "p75_level", "n_ge_B2", "n_ge_C1",
                "mean_zipf", "min_zipf", "prop_rare", "mean_word_len", "max_word_len",
                "mean_syll", "prop_poly", "ttr", "lex_density"])
VERB_FEATS = (["n_verb_groups", "n_finite_verbs", "max_vf_level", "mean_vf_level", "n_vf_ge_B1"]
              + list(FORM_GROUPS))
CLAUSE_FEATS = (["n_clauses", "n_finite_clauses", "n_relative", "n_adverbial", "n_complement",
                 "n_nonfinite", "n_coordinate", "tree_depth", "mean_dep_dist", "max_dep_dist",
                 "n_mark", "n_wh", "n_comma"])
OTHER_FEATS = [f"pos_{p}" for p in POS_LIST] + ["n_entities", "prop_entity", "flesch", "fk_grade"]
SENT_FEATURE_NAMES = VOCAB_FEATS + VERB_FEATS + CLAUSE_FEATS + OTHER_FEATS
FEATURE_GROUPS = {"vocabulary": VOCAB_FEATS, "verb_form": VERB_FEATS, "clause": CLAUSE_FEATS}


def sentence_features(span, levels=None, verb_forms=None, clause_info=None, use_lemma=True):
    """feature vector ของ 1 ประโยค (list ของ float เรียงตาม SENT_FEATURE_NAMES)
    - vocab: ใช้ระดับคำจาก lemma lookup (ข้ามชื่อเฉพาะ)
    - verb form / clause: ใช้คำเดิม + tag + dependency (ทุกคำรวมชื่อเฉพาะยังอยู่ครบ)"""
    toks = [t for t in span if not t.is_space]
    words = [t for t in toks if not t.is_punct]
    nw = max(1, len(words))
    if levels is None:  # levels (ถ้าส่งมา) ต้องเรียงตาม token ที่ไม่ใช่ space
        levels = token_levels(toks, use_lemma=use_lemma)
    lv = [l for (l, s) in levels if l is not None]
    content = [t for t in words if t.pos_ in CONTENT_POS and not is_name_token(t)]
    nl = max(1, len(lv))
    lv_arr = np.array(lv) if lv else np.array([1])
    alpha = [t for t in words if t.is_alpha and not is_name_token(t)]
    zipfs = [zipf_frequency(t.lower_, "en") for t in alpha] or [7.0]
    wl = [len(t.text) for t in alpha] or [0]
    sy = [syllables(t.text) for t in alpha] or [0]
    vocab = ([len(words)] + [sum(1 for l in lv if l == k) / nl for k in range(1, 7)] +
             [sum(1 for (l, s) in levels if s == "model") / nl, float(lv_arr.mean()), float(lv_arr.max()),
              float(np.percentile(lv_arr, 75)), float((lv_arr >= 4).sum()), float((lv_arr >= 5).sum()),
              float(np.mean(zipfs)), float(np.min(zipfs)), float(np.mean(np.array(zipfs) < 3.5)),
              float(np.mean(wl)), float(np.max(wl)), float(np.mean(sy)), float(np.mean(np.array(sy) >= 3)),
              len({t.lower_ for t in words}) / nw, len(content) / nw])

    vf = verb_forms if verb_forms is not None else detect_verb_forms(span)
    vl = [f["level"] for f in vf] or [0]
    verb = [len(vf), sum(f["finite"] for f in vf), max(vl), float(np.mean(vl)), sum(l >= 3 for l in vl)]
    verb += [sum(f["form"] in grp for f in vf) for grp in FORM_GROUPS.values()]

    ci = clause_info if clause_info is not None else analyze_clauses(span)
    cnt = ci["counts"]
    clause = [ci["n_clauses"], ci["n_finite"], cnt["relative"], cnt["adverbial"], cnt["complement"] + cnt["subject"],
              cnt["nonfinite"], cnt["coordinate"], ci["depth"], ci["mean_dep_dist"], ci["max_dep_dist"],
              sum(t.dep_ == "mark" for t in toks), sum(t.tag_ in ("WDT", "WP", "WP$", "WRB") for t in toks),
              sum(t.text == "," for t in toks)]

    pos = [sum(t.pos_ == p for t in words) / nw for p in POS_LIST]
    ents = {(t.ent_iob_, t.i) for t in toks if t.ent_type_ in NAME_ENTS}
    n_ent = sum(1 for t in toks if t.ent_iob_ == "B" and t.ent_type_ in NAME_ENTS)
    asl, asw = len(words), float(np.mean([syllables(t.text) for t in words] or [1]))
    flesch = 206.835 - 1.015 * asl - 84.6 * asw
    fk = 0.39 * asl + 11.8 * asw - 15.59
    other = pos + [n_ent, len(ents) / nw, flesch, fk]
    return [float(x) for x in vocab + verb + clause + other]


DOC_EXTRA = ["n_sentences", "doc_ttr", "doc_prop_ge_B2", "doc_prop_ge_C1", "doc_mean_level"]
DOC_FEATURE_NAMES = ([f"mean_{n}" for n in SENT_FEATURE_NAMES] + [f"max_{n}" for n in SENT_FEATURE_NAMES]
                     + [f"std_{n}" for n in SENT_FEATURE_NAMES] + DOC_EXTRA)
DOC_FEATURE_GROUPS = {g: [f"{a}_{n}" for a in ("mean", "max", "std") for n in names] +
                      (["doc_ttr", "doc_prop_ge_B2", "doc_prop_ge_C1", "doc_mean_level"] if g == "vocabulary" else [])
                      for g, names in FEATURE_GROUPS.items()}


def doc_features(sent_feats, all_levels, all_words):
    """รวม feature รายประโยค -> feature ระดับบทความ (mean / max / std + สถิติทั้งบทความ)"""
    F = np.array(sent_feats, dtype=float)
    lv = np.array([l for l, s in all_levels if l is not None] or [1])
    words = [w.lower() for w in all_words]
    ttr = len(set(words[:400])) / max(1, len(words[:400]))   # ตัด 400 คำให้เทียบได้ระหว่างบทความยาว/สั้น
    extra = [len(sent_feats), ttr, float((lv >= 4).mean()), float((lv >= 5).mean()), float(lv.mean())]
    return list(F.mean(0)) + list(F.max(0)) + list(F.std(0)) + extra


def ner_masked_tokens(span):
    """แทนชื่อเฉพาะด้วย placeholder (คงตำแหน่งคำไว้) — ใช้กับ LSTM แบบ raw+NER"""
    out = []
    for t in span:
        if t.is_space:
            continue
        if t.ent_type_ in NAME_ENTS or t.pos_ == "PROPN":
            if t.ent_iob_ == "I" and out and out[-1].startswith("<"):
                continue  # entity หลายคำ -> placeholder เดียว
            out.append(f"<{t.ent_type_ or 'PROPN'}>")
        elif t.like_num:
            out.append("<NUM>")
        else:
            out.append(t.lower_)
    return out


def sentence_unit(span, use_lemma=True):
    """เตรียมทุกอย่างที่โมเดลต้องใช้สำหรับ 1 ประโยค (ใช้ทั้งตอน train และ inference)"""
    toks = [t for t in span if not t.is_space]
    levels = token_levels(toks, use_lemma=use_lemma)
    vf = detect_verb_forms(span)
    ci = analyze_clauses(span)
    return {
        "text": span.text.strip(),
        "raw": [t.lower_ for t in toks],
        "lemma": [t.lemma_.lower() for t in toks],
        "ner": ner_masked_tokens(span),
        "feats": sentence_features(span, levels=levels, verb_forms=vf, clause_info=ci),
        "levels": levels, "verb_forms": vf, "clauses": ci,
        "words": [t.text for t in toks if t.is_alpha],
    }


def doc_unit(doc, max_sents=80):
    """เตรียมข้อมูลระดับบทความ: แยกประโยค + feature ทุกประโยค + doc features"""
    sents = [s for s in doc.sents if any(not t.is_space and not t.is_punct for t in s)][:max_sents]
    units = [sentence_unit(s) for s in sents]
    all_levels = [lv for u in units for lv in u["levels"]]
    all_words = [w for u in units for w in u["words"]]
    return {"sents": sents, "units": units,
            "doc_feats": doc_features([u["feats"] for u in units], all_levels, all_words) if units else None}


# =============================================================================
# [6] SCORE UTILS
# =============================================================================
def expected_score(probs):
    """s = Σ k·P(level=k), k = 1..6"""
    p = np.asarray(probs, dtype=float)
    return float((p * np.arange(1, 7)).sum() / max(p.sum(), 1e-9))


def score_label(s):
    """3.9 -> {'level': 'B1', 'label': 'B1.9'}  (B1 + 0.9 ไปทาง B2)"""
    s = float(np.clip(s, 1.0, 6.99))
    base = int(math.floor(s))
    frac = int((s - base) * 10)
    return {"score": round(s, 2), "level": LEVELS[base - 1], "label": f"{LEVELS[base - 1]}.{frac}"}


# =============================================================================
# [7] TOKEN SERIALIZATION (JSON สำหรับ frontend)
# =============================================================================
def serialize_tokens(doc, sent_ids, levels_by_token):
    out = []
    for t in doc:
        lv, src = levels_by_token.get(t.i, (None, "none"))
        out.append({
            "i": t.i, "text": t.text, "ws": t.whitespace_, "lemma": t.lemma_, "pos": t.pos_, "tag": t.tag_,
            "dep": t.dep_, "head": t.head.i, "morph": str(t.morph), "ent": t.ent_type_, "ent_iob": t.ent_iob_,
            "level": LEVELS[lv - 1] if lv else None, "level_num": lv, "source": src,
            "sent": sent_ids.get(t.i, -1), "is_punct": t.is_punct, "is_space": t.is_space,
            "is_name": is_name_token(t), "idx": t.idx,
        })
    return out


# =============================================================================
# [8] SELF-TEST   ->  py -3.11 backend/nlp_core.py
# =============================================================================
if __name__ == "__main__":
    tests = [
        ("I play football every day.", "present_simple"),
        ("She is reading a book now.", "present_continuous"),
        ("They visited Paris last year.", "past_simple"),
        ("We were watching TV when he called.", "past_continuous"),
        ("I have finished my homework.", "present_perfect"),
        ("Experts have been examining the fake news phenomenon.", "present_perfect_continuous"),
        ("She had left before we arrived.", "past_perfect"),
        ("The letter was written by John.", "passive_past"),
        ("You are bombarded by pictures.", "passive_present"),
        ("I will call you tomorrow.", "future_will"),
        ("I am going to visit my aunt.", "going_to"),
        ("By next year, she will have graduated.", "future_perfect"),
        ("You should have told me.", "modal_perfect"),
        ("The house has been sold.", "passive_perfect"),
        ("Had I known, I would have helped.", "inversion"),
        ("Check the source.", "imperative"),
        ("I used to live in London.", "used_to"),
    ]
    ok = 0
    for sent, expected in tests:
        d = parse(sent)
        forms = [f["form"] for f in detect_verb_forms(d[:])]
        hit = expected in forms
        ok += hit
        print(f"{'OK ' if hit else 'XX '} {sent:60s} -> {forms}")
    print(f"\nTense detector: {ok}/{len(tests)} correct\n")

    d = parse("There is a range of fake news: from crazy stories which people easily recognise "
              "to more subtle types of misinformation, because experts say so.")
    ci = analyze_clauses(d[:])
    print("Clauses:", [(c["name"], c["marker_text"], c["finite"]) for c in ci["clauses"]], "depth", ci["depth"])
    lv = token_levels(list(d))
    print("Levels:", [(t.text, t.lemma_, LEVELS[l - 1] if l else "-", s) for t, (l, s) in zip(d, lv)][:14])
    print("Features:", len(SENT_FEATURE_NAMES), "sentence /", len(DOC_FEATURE_NAMES), "document")
    print(score_label(3.93))
