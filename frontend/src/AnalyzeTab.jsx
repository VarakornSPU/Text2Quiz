import React, { useState } from 'react';
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
} from 'lucide-react';

const SAMPLE_TEXT = `Every time you're online, you are bombarded by pictures, articles, links and videos trying to tell their story. Unfortunately, not all of these stories are true. Sometimes they want you to click on another story or advertisement at their own site, other times they want to upset people for political reasons. These days it's so easy to share information. These stories circulate quickly, and the result is ... fake news.
There is a range of fake news: from crazy stories which people easily recognise to more subtle types of misinformation. Experts in media studies and online psychology have been examining the fake news phenomenon. Read these tips, and don't get fooled!

1. Check the source
Look at the website where the story comes from. Does it look real? Is the text well written? Are there a variety of other stories or is it just one story? Fake news websites often use addresses that sound like real newspapers, but don't have many real stories about other topics. If you aren't sure, click on the 'About' page and look for a clear description of the organisation.`;

export default function AnalyzeTab({ onAnalyze, analysis, loading }) {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [colorMode, setColorMode] = useState('word'); // 'word' | 'sentence' | 'none'
  const [copied, setCopied] = useState(false);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startQuiz = async () => {
    setQuizLoading(true);
    try {
      const activeTypes = Object.keys(quizTypes).filter((k) => quizTypes[k]);
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
      const data = await res.json();
      setQuizData(data);
      setUserAnswers({});
      setQuizResult(null);
      setShowQuizConfig(false);
    } catch (err) {
      alert('Error generating quiz: ' + err.message);
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
          <div className="flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => setText(SAMPLE_TEXT)}
              title="Load sample article"
            >
              Load Sample
            </button>
            <button
              className="btn-ghost"
              onClick={() => setText('')}
              title="Clear text"
            >
              Clear
            </button>
          </div>
        }
      >
        <textarea
          className="article-input"
          rows={6}
          placeholder="Paste English article here to analyze CEFR level and generate quiz..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="input-actions">
          <span className="text-muted text-sm">
            {text.trim() ? text.trim().split(/\s+/).length : 0} words
          </span>
          <button
            className="btn-primary"
            disabled={loading || !text.trim()}
            onClick={() => onAnalyze(text)}
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
              <div className="card-top-chips">
                <span className="chip">propn. -∞</span>
                <span className="chip">intj. -∞</span>
                <span className="chip">min.</span>
              </div>
              <div className="general-level-body">
                <div className="level-title-row">
                  <span className="level-title">General level</span>
                  <span className="info-icon" title="Overall CEFR proficiency level">ⓘ</span>
                </div>
                <div className="level-huge-label">
                  <span className="level-letters">{analysis.general?.level || 'B1'}</span>
                  <span className="level-decimal">
                    .{Math.round(((analysis.general?.score || 3.0) % 1) * 10)}
                  </span>
                </div>
                <span className="model-tag">Model: {analysis.model_used?.toUpperCase()}</span>
              </div>
            </div>

            {/* Level Breakdown Card */}
            <div className="breakdown-card">
              <div className="breakdown-title-main">Level breakdown</div>
              <div className="breakdown-items-list">
                <LevelProgressBar
                  title="Vocabulary"
                  level={analysis.breakdown?.vocabulary?.label || 'B2.1'}
                  score={analysis.breakdown?.vocabulary?.score}
                  info="Based on vocabulary frequency, lemma distribution, and lexical rarity"
                />
                <LevelProgressBar
                  title="Verb form"
                  level={analysis.breakdown?.verb_form?.label || 'A2.9'}
                  score={analysis.breakdown?.verb_form?.score}
                  info="Evaluated through verb tenses, auxiliaries, active/passive voice, and mood"
                />
                <LevelProgressBar
                  title="Clause"
                  level={analysis.breakdown?.clause?.label || 'A2.5'}
                  score={analysis.breakdown?.clause?.score}
                  info="Assessed by clause depth, subordinate markers, and sentence complexity"
                />
              </div>
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
                          <div><strong>Sentence {idx + 1}</strong>: {s.label}</div>
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
                          <div>Level: <strong>{tok.level}</strong> ({tok.source})</div>
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
                <Award size={22} className="text-primary" />
                <div>
                  <h4 className="font-bold">Generate Quiz from this Article</h4>
                  <p className="text-sm text-muted">
                    Interactive quiz with vocabulary cloze, verb tenses, and sentence structure with Thai explanations
                  </p>
                </div>
              </div>
              <button
                className="btn-accent"
                onClick={() => setShowQuizConfig(!showQuizConfig)}
              >
                <Sliders size={16} /> Configure & Generate Quiz
              </button>
            </div>

            {/* Quiz Config Modal / Drawer */}
            {showQuizConfig && (
              <div className="quiz-config-card">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  <Sliders size={18} /> Quiz Configuration
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-block">Number of Questions</label>
                    <div className="flex gap-2">
                      {[4, 6, 8, 10].map((n) => (
                        <button
                          key={n}
                          className={`btn-pill ${numQ === n ? 'active' : ''}`}
                          onClick={() => setNumQ(n)}
                        >
                          {n} Questions
                        </button>
                      ))}
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

