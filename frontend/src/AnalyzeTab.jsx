import React, { useState, useMemo } from 'react';
import {
  CEFR_COLORS,
  CEFR_HEX,
  LevelBadge,
  LevelProgressBar,
  Card,
  Tooltip,
  getLevelColor,
} from './ui';
import {
  Sparkles,
  BookOpen,
  HelpCircle,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Award,
  ChevronRight,
  Send,
  Cpu,
  AlertTriangle,
  AlertCircle,
  X,
  Info,
} from 'lucide-react';

/**
 * รายการคำศัพท์ภาษาอังกฤษพื้นฐานและคำไวยากรณ์ที่พบบ่อย (Common English Vocabulary & Function Words):
 * ใช้ตรวจจับข้อความสั้น (3-12 คำ) ว่ามีคำภาษาอังกฤษจริงอย่างน้อย 1 คำหรือไม่ เพื่อดักจับการพิมพ์ตัวอักษรมั่ว
 */
const COMMON_ENGLISH_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
  'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just',
  'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want',
  'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been',
  'has', 'had', 'am', 'check', 'read', 'tell', 'help', 'click', 'fake', 'news', 'story', 'stories',
  'source', 'website', 'real', 'written', 'variety', 'topics', 'page', 'description', 'sure', 'sound',
  'online', 'pictures', 'articles', 'links', 'videos', 'true', 'site', 'upset', 'easy', 'share',
  'information', 'circulate', 'quickly', 'range', 'crazy', 'recognise', 'recognize', 'subtle',
  'types', 'misinformation', 'experts', 'media', 'studies', 'psychology', 'examining', 'phenomenon',
  'tips', 'fooled', 'where', 'comes', 'does', 'sound', 'many', 'about', 'clear', 'organisation'
]);

/**
 * นับคำภาษาอังกฤษจริง (Genuine English words):
 * ไม่นับเครื่องหมายวรรคตอนเดี่ยวๆ (... , ! ?), ตัวเลขโดดๆ (123) หรือการเคาะเว้นวรรคเปล่า
 * รองรับคำที่มี apostrophe หรือ hyphen เช่น don't, it's, state-of-the-art
 */
export function countEnglishWords(str) {
  if (!str || !str.trim()) return 0;
  const matches = str.match(/\b[a-zA-Z]+(?:['’-][a-zA-Z]+)*\b/g);
  return matches ? matches.length : 0;
}

/**
 * ตรวจสอบความถูกต้องของข้อความก่อนส่งวิเคราะห์:
 * - ป้องกันภาษาอื่นนอกจากภาษาอังกฤษ เช่น ภาษาไทย, CJK, อาหรับ
 * - ป้องกันการพิมพ์ตัวอักษรซ้ำผิดปกติ (เช่น ddddddddddddd)
 * - ป้องกันคำที่ยาวผิดปกติ (> 28 ตัวอักษร)
 * - ตรวจจับคำศัพท์ที่รู้จักในข้อความสั้น
 * - ต้องการคำภาษาอังกฤษอย่างน้อย 3 คำเพื่อประเมินระดับ CEFR
 */
export function validateInputText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { valid: false, message: null, words: 0, hasNonLatin: false };
  }

  const words = countEnglishWords(trimmed);

  // ตรวจจับอักษรภาษาไทย
  const hasThai = /[\u0E00-\u0E7F]/.test(trimmed);
  if (hasThai) {
    return {
      valid: false,
      hasNonLatin: true,
      message: 'ตรวจพบภาษาไทย: ระบบรองรับเฉพาะข้อความภาษาอังกฤษเท่านั้น (English text only)',
      words,
    };
  }

  // ตรวจจับอักษรภาษาอื่นที่ไม่ใช่ละติน (จีน, ญี่ปุ่น, เกาหลี, อาหรับ, ซีริลลิก ฯลฯ)
  const hasOtherNonLatin = /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(trimmed);
  if (hasOtherNonLatin) {
    return {
      valid: false,
      hasNonLatin: true,
      message: 'ตรวจพบอักษรภาษาอื่น: ระบบรองรับเฉพาะข้อความภาษาอังกฤษเท่านั้น (English text only)',
      words,
    };
  }

  // ตรวจจับการพิมพ์ตัวอักษรซ้ำผิดปกติ เช่น ddddddddddddddd
  if (/(.)\1{3,}/.test(trimmed)) {
    return {
      valid: false,
      hasNonLatin: false,
      message: 'ตรวจพบการพิมพ์ตัวอักษรซ้ำผิดปกติ กรุณาป้อนข้อความภาษาอังกฤษที่มีความหมาย',
      words,
    };
  }

  if (words < 3) {
    return {
      valid: false,
      hasNonLatin: false,
      message: `กรุณาป้อนข้อความภาษาอังกฤษอย่างน้อย 3 คำขึ้นไป (ปัจจุบันพบ ${words} คำ)`,
      words,
    };
  }

  // สำหรับข้อความสั้น (3-12 คำ): ต้องมีคำศัพท์ภาษาอังกฤษที่รู้จักอย่างน้อย 1 คำ
  const tokenList = trimmed.match(/\b[a-zA-Z]+(?:['’-][a-zA-Z]+)*\b/g) || [];
  if (words < 12) {
    const hasCommonWord = tokenList.some((w) => COMMON_ENGLISH_WORDS.has(w.toLowerCase()));
    if (!hasCommonWord) {
      return {
        valid: false,
        hasNonLatin: false,
        message: 'ไม่พบคำศัพท์ภาษาอังกฤษที่รู้จักในข้อความ กรุณาป้อนประโยคภาษาอังกฤษที่มีความหมาย',
        words,
      };
    }
  }

  return { valid: true, message: null, words, hasNonLatin: false };
}

const FIXED_PIPELINE = {
  docModel: 'rf',
  docLabel: 'RF + Features',
  sentenceModel: 'bytehybrid',
  sentenceLabel: 'Byte-LSTM + Features',
  wordModel: 'bytehybrid',
  wordLabel: 'Byte-LSTM + Features',
};

const SAMPLE_TEXT = `Every time you're online, you are bombarded by pictures, articles, links and videos trying to tell their story. Unfortunately, not all of these stories are true. Sometimes they want you to click on another story or advertisement at their own site, other times they want to upset people for political reasons. These days it's so easy to share information. These stories circulate quickly, and the result is ... fake news.
There is a range of fake news: from crazy stories which people easily recognise to more subtle types of misinformation. Experts in media studies and online psychology have been examining the fake news phenomenon. Read these tips, and don't get fooled!

1. Check the source
Look at the website where the story comes from. Does it look real? Is the text well written? Are there a variety of other stories or is it just one story? Fake news websites often use addresses that sound like real newspapers, but don't have many real stories about other topics. If you aren't sure, click on the 'About' page and look for a clear description of the organisation.`;

export default function AnalyzeTab({
  onAnalyze,
  analysis,
  loading,
  bestModel,
  availableModels,
  analysisError,
  onClearError,
}) {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [colorMode, setColorMode] = useState('word'); // 'word' | 'sentence' | 'none'
  const [copied, setCopied] = useState(false);
  const [quizError, setQuizError] = useState(null);
  const [showRules, setShowRules] = useState(false);

  // ตรวจสอบความถูกต้องของข้อความและนับคำภาษาอังกฤษจริง
  const validation = useMemo(() => validateInputText(text), [text]);

  // Quiz states
  const [showQuizConfig, setShowQuizConfig] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [grading, setGrading] = useState(false);

  // Quiz config
  const [numQ, setNumQ] = useState(6);
  const [quizTypes, setQuizTypes] = useState({
    vocabulary: true,
    verb_tense: true,
    structure: true,
  });

  // เกณฑ์ความยาวบทความสำหรับการสร้างควิซ
  const wordCount = validation.words;
  const quizEligible = wordCount >= 35;
  const maxPossibleQ = wordCount >= 100 ? 10 : wordCount >= 80 ? 8 : wordCount >= 55 ? 6 : 4;

  // ปรับจำนวนข้อให้อยู่ในเกณฑ์ที่ความยาวบทความรองรับได้เสมอ
  React.useEffect(() => {
    if (quizEligible && numQ > maxPossibleQ) {
      setNumQ(maxPossibleQ);
    }
  }, [quizEligible, maxPossibleQ, numQ]);

  const handleTextChange = (newText) => {
    setText(newText);
    if (analysisError && onClearError) {
      onClearError();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startQuiz = async () => {
    setQuizLoading(true);
    setQuizError(null);
    try {
      const activeTypes = Object.keys(quizTypes).filter((k) => quizTypes[k]);
      if (activeTypes.length === 0) {
        throw new Error('กรุณาเลือกประเภทคำถามอย่างน้อย 1 หมวดหมู่');
      }

      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          num_questions: numQ,
          types: activeTypes,
          level: analysis?.general?.level || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error generating quiz');
      }

      const data = await res.json();
      if (!data.questions || data.questions.length === 0) {
        throw new Error('ไม่พบคำถามที่สามารถสร้างได้จากบทความนี้ กรุณาเพิ่มความยาวบทความ');
      }

      setQuizData(data);
      setUserAnswers({});
      setQuizResult(null);
      setShowQuizConfig(false);
      setQuizError(null);
    } catch (err) {
      setQuizError(err.message);
    } finally {
      setQuizLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quizData) return;
    setGrading(true);
    try {
      const res = await fetch('/api/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz_id: quizData.quiz_id,
          answers: userAnswers,
        }),
      });
      const data = await res.json();
      setQuizResult(data);
    } catch (err) {
      alert('Error grading quiz: ' + err.message);
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="analyze-container">
      {/* Input Section */}
      <Card
        title="Input Article / Text"
        icon={<BookOpen size={20} className="text-primary" />}
        badge={
          <div className="flex gap-2 items-center">
            <button
              type="button"
              className={`btn-rules-pill ${showRules ? 'active' : ''}`}
              onClick={() => setShowRules(!showRules)}
              title="ดูข้อกำหนดและกฎทั้งหมดของข้อความที่ไม่สามารถวิเคราะห์ได้"
            >
              <HelpCircle size={14} />
              <span>กฎข้อความ</span>
              <span className="rules-toggle-chevron">{showRules ? '▲' : '▼'}</span>
            </button>
            <button
              className="btn-ghost"
              onClick={() => handleTextChange(SAMPLE_TEXT)}
              title="Load sample article"
            >
              Load Sample
            </button>
            <button
              className="btn-ghost"
              onClick={() => handleTextChange('')}
              title="Clear text"
            >
              Clear
            </button>
          </div>
        }
      >
        {/* Input Rules & Restrictions Drawer Panel */}
        {showRules && (
          <div className="input-rules-drawer">
            <div className="rules-drawer-header">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary" />
                <strong className="text-sm text-slate-800">
                  เกณฑ์และข้อกำหนดของข้อความ (Input Requirements & Restrictions)
                </strong>
              </div>
              <button
                type="button"
                className="rules-close-btn"
                onClick={() => setShowRules(false)}
                title="ปิดคำแนะนำ"
              >
                <X size={15} />
              </button>
            </div>

            <div className="rules-cards-grid">
              {/* 1. Language Rule */}
              <div className="rule-card">
                <div className="rule-card-title text-indigo-700">
                  <span className="rule-num">1</span>
                  <span>ภาษาที่รองรับ (Language)</span>
                </div>
                <ul className="rule-list">
                  <li className="rule-fail">
                    <span className="icon-cross">✕</span>
                    <span>ห้ามภาษาไทย หรือภาษาอื่น (จีน, ญี่ปุ่น, เกาหลี, อาหรับ, รัสเซีย ฯลฯ)</span>
                  </li>
                  <li className="rule-fail">
                    <span className="icon-cross">✕</span>
                    <span>ห้ามบทความภาษาอื่นที่ใช้อักษรละตินเด่นชัด (เช่น ฝรั่งเศส, สเปน, เยอรมัน)</span>
                  </li>
                  <li className="rule-pass">
                    <span className="icon-check">✓</span>
                    <span>รองรับภาษาอังกฤษทุกระดับ (รวมคำยืมทั่วไป เช่น <em>café, résumé, cliché</em>)</span>
                  </li>
                </ul>
              </div>

              {/* 2. Word Count Rule */}
              <div className="rule-card">
                <div className="rule-card-title text-emerald-700">
                  <span className="rule-num">2</span>
                  <span>ความยาวข้อความ (Word Count)</span>
                </div>
                <ul className="rule-list">
                  <li className="rule-fail">
                    <span className="icon-cross">✕</span>
                    <span>ห้ามข้อความว่างเปล่า หรือสั้นกว่า <strong>3 คำ</strong></span>
                  </li>
                  <li className="rule-pass">
                    <span className="icon-check">✓</span>
                    <span><strong>วิเคราะห์ CEFR</strong>: ต้องการอย่างน้อย <strong>3 คำขึ้นไป</strong></span>
                  </li>
                  <li className="rule-pass">
                    <span className="icon-check">✓</span>
                    <span><strong>สร้างควิซ (Quiz)</strong>: ต้องการอย่างน้อย <strong>35 คำขึ้นไป</strong> (เกณฑ์ 35/55/80/100 คำ)</span>
                  </li>
                </ul>
              </div>

              {/* 3. Text Quality & Anti-Spam */}
              <div className="rule-card">
                <div className="rule-card-title text-amber-700">
                  <span className="rule-num">3</span>
                  <span>คุณภาพคำศัพท์ (Anti-Spam)</span>
                </div>
                <ul className="rule-list">
                  <li className="rule-fail">
                    <span className="icon-cross">✕</span>
                    <span>ห้ามพิมพ์ตัวอักษรเดิมซ้ำกันผิดปกติ (เช่น <code>dddddddd</code>, <code>aaaaaa</code>)</span>
                  </li>
                  <li className="rule-fail">
                    <span className="icon-cross">✕</span>
                    <span>ห้ามพิมพ์แป้นพิมพ์มั่วที่ไม่มีคำศัพท์จริง (เช่น <code>asdf jkl; qwer</code>)</span>
                  </li>
                  <li className="rule-pass">
                    <span className="icon-check">✓</span>
                    <span>คำศัพท์เฉพาะทางยาวๆ ที่มีอยู่จริง (เช่น <em>Pneumonoultramicroscopicsilicovolcanoconiosis</em>) วิเคราะห์ได้ปกติ</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <textarea
          className={`article-input ${!validation.valid && text.trim() && validation.hasNonLatin ? 'input-error' : ''}`}
          rows={6}
          placeholder="Paste English article here to analyze CEFR level and generate quiz..."
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
        />

        {!validation.valid && text.trim() && (
          <div className="input-validation-warning">
            <div className="flex items-center gap-2 flex-grow">
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span>{validation.message}</span>
            </div>
            <button
              type="button"
              className="warning-view-rules-btn"
              onClick={() => setShowRules(true)}
              title="เปิดดูกฎและข้อกำหนดทั้งหมด"
            >
              ดูกฎทั้งหมด ➔
            </button>
          </div>
        )}

        {/* Backend Analysis Error Banner (แทน window.alert) */}
        {analysisError && (
          <div className="analysis-error-banner">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-danger block text-sm">การวิเคราะห์ไม่สำเร็จ</strong>
                <span className="text-xs text-slate-700 leading-relaxed">{analysisError}</span>
              </div>
            </div>
            {onClearError && (
              <button
                type="button"
                className="error-dismiss-btn"
                onClick={onClearError}
                title="ปิดการแจ้งเตือน"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Fixed Active ML Pipeline Bar */}
        <div className="fixed-pipeline-strip">
          <div className="pipeline-title-group">
            <Cpu size={14} className="text-primary flex-shrink-0" />
            <span className="pipeline-title">ML Pipeline:</span>
          </div>
          <div className="pipeline-badges-group">
            <span
              className="pipeline-badge"
              title="ระดับบทความ: Random Forest + Linguistic Features (ความแม่นยำสูงสุด 66.7%, QWK 0.934)"
            >
              <span className="badge-scope">Document:</span>
              <span className="badge-model">RF + Features</span>
            </span>
            <span
              className="pipeline-badge"
              title="ระดับประโยค: Byte-LSTM + Linguistic Features (Adjacent Accuracy 96.4%, QWK 0.749)"
            >
              <span className="badge-scope">Sentence:</span>
              <span className="badge-model">Byte-LSTM + Features</span>
            </span>
            <span
              className="pipeline-badge"
              title="ระดับคำศัพท์ (OOV): Byte-LSTM + 41 Word Features"
            >
              <span className="badge-scope">Word:</span>
              <span className="badge-model">Byte-LSTM + Features</span>
            </span>
          </div>
        </div>

        <div className="input-actions">
          <span className="text-muted text-sm">
            <strong className="text-slate-800">{validation.words}</strong>{' '}
            {validation.words === 1 ? 'word' : 'words'}
          </span>
          <button
            className="btn-primary"
            disabled={loading || !validation.valid}
            title={
              !validation.valid
                ? validation.message || 'กรุณาป้อนข้อความภาษาอังกฤษ'
                : 'วิเคราะห์ระดับ CEFR'
            }
            onClick={() => onAnalyze(text, FIXED_PIPELINE)}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                <Sparkles size={16} /> Analyze CEFR Level
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Analysis Results View */}
      {analysis && (
        <div className="results-wrapper">
          {/* Top Summary: General Level & Breakdown */}
          <div className="summary-row">
            {/* General Level Card */}
            <div className="general-level-card">
              <div className="general-level-body">
                <div className="level-title-row">
                  <span className="level-title">General level</span>
                </div>
                <div className="level-huge-label">
                  <span className="level-letters">
                    {(analysis.general?.label || 'B1.0').split('.')[0]}
                  </span>
                  <span className="level-decimal">
                    .{(analysis.general?.label || 'B1.0').split('.')[1] ?? '0'}
                  </span>
                </div>
                <span
                  className="model-tag"
                  title={`Analyzed with ${analysis.models_used?.document?.name || analysis.model_name || analysis.model_used}`}
                >
                  Model: {analysis.models_used?.document?.label || analysis.model_name || analysis.model_used?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Level Breakdown Card */}
            <div className="breakdown-card">
              <div className="breakdown-header-row">
                <div className="breakdown-title-main">Level breakdown</div>
                <span
                  className="model-tag"
                  title="คำนวณด้วย Random Forest ที่ฝึกแยกตามกลุ่มฟีเจอร์แต่ละด้านโดยเฉพาะ"
                >
                  Model: Random Forest (Feature-Group RFs)
                </span>
              </div>
              <div className="breakdown-items-list">
                <LevelProgressBar
                  title="Vocabulary"
                  level={analysis.breakdown?.vocabulary?.label || 'B2.1'}
                  score={analysis.breakdown?.vocabulary?.score}
                />
                <LevelProgressBar
                  title="Verb form"
                  level={analysis.breakdown?.verb_form?.label || 'A2.9'}
                  score={analysis.breakdown?.verb_form?.score}
                />
                <LevelProgressBar
                  title="Clause"
                  level={analysis.breakdown?.clause?.label || 'A2.5'}
                  score={analysis.breakdown?.clause?.score}
                />
              </div>
              <p className="breakdown-model-note">
                <strong>หมายเหตุ:</strong> ส่วนนี้ใช้ <strong>Random Forest แยกตามกลุ่มฟีเจอร์</strong> (Vocab / Verb form / Clause) เสมอ ไม่เปลี่ยนตามตัวเลือกโมเดลด้านบน เนื่องจากโมเดลอื่น (BiLSTM, Byte-LSTM, TF-IDF) อ่านข้อความรวมทั้งประโยค จึงไม่สามารถแยกประเมินคะแนนเฉพาะด้านทางไวยากรณ์ออกจากกันได้
              </p>
            </div>
          </div>

          {/* Interactive Text Display Card */}
          <Card
            title="Text Analysis & Highlighting"
            badge={
              <div className="text-card-controls">
                {/* Color Legend */}
                <div className="cefr-legend">
                  <span className="legend-item" style={{ color: CEFR_HEX.A1 }}>A1</span>
                  <span className="legend-item" style={{ color: CEFR_HEX.A2 }}>A2</span>
                  <span className="legend-item" style={{ color: CEFR_HEX.B1 }}>B1</span>
                  <span className="legend-item" style={{ color: CEFR_HEX.B2 }}>B2</span>
                  <span className="legend-item" style={{ color: CEFR_HEX.C1 }}>C1</span>
                  <span className="legend-item" style={{ color: CEFR_HEX.C2 }}>C2</span>
                </div>

                {/* Color Mode Switcher */}
                <select
                  className="select-control"
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value)}
                >
                  <option value="word">Color coding by word</option>
                  <option value="sentence">Color coding by sentence</option>
                  <option value="none">None</option>
                </select>

                <button className="btn-icon" onClick={handleCopy} title="Copy text">
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
            }
          >
            <div className="highlighted-text-box">
              {colorMode === 'sentence' ? (
                // Sentence mode highlighting
                analysis.sentences?.map((s, idx) => {
                  const sColor = getLevelColor(s.level);
                  return (
                    <Tooltip
                      key={idx}
                      content={
                        <div className="tooltip-inner">
                          <div>
                            <strong>Sentence {idx + 1}</strong>: {s.label}{' '}
                            <span className="text-muted text-xs">
                              ({analysis.models_used?.sentence?.label || 'Byte-LSTM + Feat'})
                            </span>
                          </div>
                          <div>Clauses: {s.n_clauses} (Depth: {s.depth})</div>
                          <div>Vocab: {s.breakdown?.vocabulary?.label} | Tense: {s.breakdown?.verb_form?.label}</div>
                        </div>
                      }
                    >
                      <span
                        className="highlight-sentence"
                        style={{
                          backgroundColor: sColor.light,
                          borderBottom: `2px solid ${sColor.border}`,
                        }}
                      >
                        {s.text}{' '}
                      </span>
                    </Tooltip>
                  );
                })
              ) : colorMode === 'word' ? (
                // Word mode highlighting
                analysis.tokens?.map((tok) => {
                  if (tok.is_space) return tok.text;
                  const lvlColor = tok.level ? CEFR_HEX[tok.level] : null;

                  if (!lvlColor || tok.is_name) {
                    return (
                      <Tooltip
                        key={tok.i}
                        content={
                          <div className="tooltip-inner">
                            <div className="font-bold">{tok.text}</div>
                            <div>Lemma: {tok.lemma}</div>
                            <div>POS: {tok.pos} ({tok.tag})</div>
                            {tok.ent ? (
                              <div className="text-warning font-semibold">
                                Named Entity: {tok.ent} (ชื่อเฉพาะ/ไม่นับระดับ)
                              </div>
                            ) : tok.is_punct ? (
                              <div className="text-muted">Punctuation</div>
                            ) : (
                              <div className="text-muted">Structure / Particle</div>
                            )}
                          </div>
                        }
                      >
                        <span className={tok.is_name ? 'text-entity' : ''}>
                          {tok.text}
                        </span>
                        {tok.ws}
                      </Tooltip>
                    );
                  }

                  return (
                    <Tooltip
                      key={tok.i}
                      content={
                        <div className="tooltip-inner">
                          <div className="font-bold">{tok.text}</div>
                          <div>Lemma: {tok.lemma}</div>
                          <div>POS: {tok.pos} ({tok.tag})</div>
                          <div>
                            Level: <strong>{tok.level}</strong>{' '}
                            <span className="text-muted text-xs">
                              ({tok.source === 'model'
                                ? `model: ${tok.model_name || analysis.models_used?.word?.label || 'Byte-LSTM + Feat'}`
                                : tok.source})
                            </span>
                          </div>
                          {tok.morph && <div className="text-xs text-muted">{tok.morph}</div>}
                        </div>
                      }
                    >
                      <span
                        className="colored-word"
                        style={{
                          color: lvlColor,
                          fontWeight: ['B2', 'C1', 'C2'].includes(tok.level) ? '600' : '500',
                        }}
                      >
                        {tok.text}
                      </span>
                      {tok.ws}
                    </Tooltip>
                  );
                })
              ) : (
                // None mode
                text
              )}
            </div>

            {/* Quiz Generation Trigger Banner */}
            <div className="quiz-trigger-bar">
              <div className="quiz-trigger-info">
                <Award size={22} className={quizEligible ? 'text-primary' : 'text-muted'} />
                <div>
                  <h4 className="font-bold flex items-center gap-2">
                    <span>Generate Quiz from this Article</span>
                    {!quizEligible && (
                      <span
                        className="badge-tag text-xs"
                        style={{
                          backgroundColor: '#FEF3C7',
                          color: '#B45309',
                          borderColor: '#FDE68A',
                        }}
                      >
                        ต้องการ 35 คำขึ้นไป (ปัจจุบัน {wordCount} คำ)
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-muted">
                    {quizEligible
                      ? 'Interactive quiz with vocabulary cloze, verb tenses, and sentence structure with Thai explanations'
                      : `บทความสั้นเกินไปสำหรับสร้างชุดควิซ (พบ ${wordCount} คำ) ต้องการอย่างน้อย 35 คำขึ้นไป (ประมาณ 3 ประโยค) เพื่อให้มีเนื้อหาเพียงพอสำหรับออกข้อสอบ`}
                  </p>
                </div>
              </div>
              <button
                className="btn-accent"
                disabled={!quizEligible}
                title={
                  !quizEligible
                    ? `บทความต้องมีความยาวอย่างน้อย 35 คำขึ้นไป (ปัจจุบันพบ ${wordCount} คำ)`
                    : 'Configure & Generate Quiz'
                }
                onClick={() => setShowQuizConfig(!showQuizConfig)}
              >
                <Sliders size={16} /> Configure & Generate Quiz
              </button>
            </div>

            {/* Quiz Error Banner */}
            {quizError && (
              <div className="analysis-error-banner mt-3 mb-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-danger block text-sm">ไม่สามารถสร้างควิซได้</strong>
                    <span className="text-xs text-slate-700 leading-relaxed">{quizError}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="error-dismiss-btn"
                  onClick={() => setQuizError(null)}
                  title="ปิดการแจ้งเตือน"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {/* Quiz Config Modal / Drawer */}
            {showQuizConfig && quizEligible && (
              <div className="quiz-config-card">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  <Sliders size={18} /> Quiz Configuration
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="label-block mb-0">Number of Questions</label>
                      <span className="text-xs text-muted">
                        บทความยาว <strong>{wordCount}</strong> คำ
                      </span>
                    </div>

                    {/* Question Buttons - Clean and Simple */}
                    <div className="flex gap-2 mb-2">
                      {[4, 6, 8, 10].map((n) => {
                        const isAllowed = n <= maxPossibleQ;
                        const reqWords = n === 4 ? 35 : n === 6 ? 55 : n === 8 ? 80 : 100;
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={!isAllowed}
                            title={
                              !isAllowed
                                ? `ต้องการบทความอย่างน้อย ${reqWords} คำขึ้นไป (ปัจจุบันพบ ${wordCount} คำ)`
                                : `สร้างควิซ ${n} ข้อ`
                            }
                            className={`btn-pill flex-1 py-1.5 text-xs font-semibold ${
                              numQ === n ? 'active' : ''
                            } ${!isAllowed ? 'disabled-pill' : ''}`}
                            onClick={() => setNumQ(n)}
                          >
                            {n} Questions
                          </button>
                        );
                      })}
                    </div>

                    {/* Clean Minimalist Criteria Status Bar */}
                    <div className="quiz-criteria-strip">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Info size={12} className="text-primary flex-shrink-0" />
                        <span>เกณฑ์คำ:</span>
                      </div>
                      {[
                        { q: 4, min: 35 },
                        { q: 6, min: 55 },
                        { q: 8, min: 80 },
                        { q: 10, min: 100 },
                      ].map((t) => {
                        const isMet = wordCount >= t.min;
                        return (
                          <div
                            key={t.q}
                            className={`criteria-strip-item ${isMet ? 'unlocked' : 'locked'}`}
                          >
                            <span className={`dot ${isMet ? 'dot-active' : 'dot-muted'}`} />
                            <span>
                              {t.q} ข้อ (≥{t.min})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="label-block">Question Categories</label>
                    <div className="flex flex-col gap-1 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizTypes.vocabulary}
                          onChange={(e) =>
                            setQuizTypes({ ...quizTypes, vocabulary: e.target.checked })
                          }
                        />
                        Vocabulary Cloze (เติมคำศัพท์ตามบริบท)
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizTypes.verb_tense}
                          onChange={(e) =>
                            setQuizTypes({ ...quizTypes, verb_tense: e.target.checked })
                          }
                        />
                        Verb Tense & Form (รูปกริยาและกาล)
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={quizTypes.structure}
                          onChange={(e) =>
                            setQuizTypes({ ...quizTypes, structure: e.target.checked })
                          }
                        />
                        Sentence Structure (ความซับซ้อนของประโยค)
                      </label>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setShowQuizConfig(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    disabled={quizLoading}
                    onClick={startQuiz}
                  >
                    {quizLoading ? 'Generating...' : 'Start Quiz Now'}
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Interactive Quiz Active Section */}
          {quizData && (
            <Card
              title={`Interactive Article Quiz (${quizData.questions.length} Questions)`}
              icon={<Award size={20} className="text-accent" />}
              badge={
                quizResult ? (
                  <span className="badge-score">
                    Score: {quizResult.score} / {quizResult.total} ({quizResult.percentage}%)
                  </span>
                ) : (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setQuizData(null)}
                  >
                    Close Quiz
                  </button>
                )
              }
            >
              <div className="quiz-questions-list">
                {quizData.questions.map((q, idx) => {
                  const gradedDetail = quizResult?.details?.find((d) => d.id === q.id);
                  const isAnswered = userAnswers[q.id] !== undefined;

                  return (
                    <div
                      key={q.id}
                      className={`quiz-item-card ${
                        gradedDetail
                          ? gradedDetail.is_correct
                            ? 'correct'
                            : 'incorrect'
                          : ''
                      }`}
                    >
                      <div className="quiz-item-header">
                        <span className="question-num">Question {idx + 1}</span>
                        <div className="flex gap-2 items-center">
                          <span className="badge-tag">{q.type_label}</span>
                          <LevelBadge level={q.level} size="sm" />
                        </div>
                      </div>

                      <div className="quiz-sentence-box">
                        {q.sentence}
                      </div>

                      <div className="quiz-options-grid">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = userAnswers[q.id] === optIdx;
                          let optClass = 'quiz-option';
                          if (isSelected) optClass += ' selected';

                          if (gradedDetail) {
                            if (optIdx === gradedDetail.correct_index) {
                              optClass += ' option-correct';
                            } else if (isSelected && !gradedDetail.is_correct) {
                              optClass += ' option-wrong';
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              className={optClass}
                              disabled={!!quizResult}
                              onClick={() =>
                                setUserAnswers({ ...userAnswers, [q.id]: optIdx })
                              }
                            >
                              <span className="opt-letter">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="opt-text">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation in Thai when graded */}
                      {gradedDetail && (
                        <div className="explanation-box">
                          <div className="explanation-header">
                            {gradedDetail.is_correct ? (
                              <span className="text-success font-bold flex items-center gap-1">
                                <Check size={16} /> ถูกต้อง!
                              </span>
                            ) : (
                              <span className="text-danger font-bold flex items-center gap-1">
                                ✕ ยังไม่ถูกต้อง
                              </span>
                            )}
                          </div>
                          <div className="explanation-body">
                            {gradedDetail.explanation.split('\n').map((line, lIdx) => (
                              <p key={lIdx}>{line}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submit Button */}
              {!quizResult ? (
                <div className="quiz-submit-row">
                  <span className="text-sm text-muted">
                    Answered {Object.keys(userAnswers).length} / {quizData.questions.length} questions
                  </span>
                  <button
                    className="btn-primary"
                    disabled={grading || Object.keys(userAnswers).length === 0}
                    onClick={submitQuiz}
                  >
                    {grading ? 'Checking Answers...' : 'Submit & Check Answers'}
                  </button>
                </div>
              ) : (
                <div className="quiz-result-summary">
                  <div className="result-score-circle">
                    <span className="score-percent">{quizResult.percentage}%</span>
                    <span className="score-ratio">
                      {quizResult.score} / {quizResult.total}
                    </span>
                  </div>
                  <div className="result-feedback">
                    <h4 className="font-bold text-lg">
                      {quizResult.percentage >= 80
                        ? 'ยอดเยี่ยมมาก! เข้าใจบทความและไวยากรณ์ได้เป็นอย่างดี'
                        : quizResult.percentage >= 50
                        ? 'ทำได้ดี! ลองศึกษาคำอธิบายเฉลยในข้อที่ผิดเพื่อพัฒนาต่อ'
                        : 'ลองอ่านคำอธิบายเฉลยและทบทวน Tense/คำศัพท์เพิ่มเติมครับ'}
                    </h4>
                    <p className="text-sm text-muted mt-1">
                      สามารถดูคำอธิบายไวยากรณ์และที่มาของคำตอบได้ที่ใต้แต่ละข้อ
                    </p>
                    <button
                      className="btn-accent mt-3"
                      onClick={() => {
                        setUserAnswers({});
                        setQuizResult(null);
                        startQuiz();
                      }}
                    >
                      <RotateCcw size={16} /> Try New Quiz
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

