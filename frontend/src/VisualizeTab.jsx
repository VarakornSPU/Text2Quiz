import React, { useState, useEffect } from 'react';
import { Card, LevelBadge, CEFR_HEX, CEFR_COLORS } from './ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  Database,
  BarChart3,
  Layers,
  Network,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
  Sparkles,
} from 'lucide-react';

const POS_COLORS = {
  NOUN: '#3B82F6',
  VERB: '#10B981',
  ADJ: '#F59E0B',
  ADV: '#8B5CF6',
  PRON: '#EC4899',
  ADP: '#64748B',
  AUX: '#06B6D4',
  CCONJ: '#F97316',
  SCONJ: '#E11D48',
};

export default function VisualizeTab({ analysis }) {
  const [viewMode, setViewMode] = useState('dataset'); // 'dataset' | 'text'
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedLvl, setSelectedLvl] = useState('B1');
  const [activePosMetric, setActivePosMetric] = useState('ALL');

  // Input text view states
  const [selectedSentIdx, setSelectedSentIdx] = useState(0);

  useEffect(() => {
    fetch('/api/dataset-analytics')
      .then((res) => res.json())
      .then((data) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading dataset analytics:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="loading-box">
        <div className="spinner large" />
        <p className="mt-3 text-muted">Loading Dataset Project ML Visualizations & Statistics...</p>
      </div>
    );
  }

  const overview = analytics?.overview || {};
  const posDist = analytics?.pos_distribution || [];
  const tenseDist = analytics?.tense_distribution || [];
  const complexity = analytics?.complexity_metrics || [];
  const lemmaImpact = analytics?.lemma_impact || {};
  const samples = analytics?.sample_sentences?.[selectedLvl] || [];

  return (
    <div className="visualize-container">
      {/* Top Header & View Mode Switcher */}
      <div className="compare-header-row">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Database size={22} className="text-primary" /> Data Visualization Dashboard
          </h2>
          <p className="text-sm text-muted">
            การวิเคราะห์ข้อมูลทางภาษาจาก Dataset Project ML จริง (POS, Tense, Complexity & Lemmatization)
          </p>
        </div>
        <div className="scope-tabs">
          <button
            className={`scope-tab-btn ${viewMode === 'dataset' ? 'active' : ''}`}
            onClick={() => setViewMode('dataset')}
          >
            📊 Dataset Project ML
          </button>
          <button
            className={`scope-tab-btn ${viewMode === 'text' ? 'active' : ''}`}
            onClick={() => setViewMode('text')}
          >
            📝 Input Article Analysis
          </button>
        </div>
      </div>

      {viewMode === 'dataset' ? (
        /* =========================================================================
           DATASET PROJECT ML VISUALIZATION DASHBOARD
           ========================================================================= */
        <div className="dataset-viz-view">
          {/* Overview Metric Cards */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="app-card" style={{ padding: '16px' }}>
              <span className="text-xs font-bold text-muted uppercase">Total Sentences</span>
              <div className="text-2xl font-extrabold text-primary mt-1">
                {overview.total_sentences?.toLocaleString()}
              </div>
              <span className="text-xs text-muted">WikiAuto (7,453) · ReadMe (2,821) · SCoRE (2,551)</span>
            </div>

            <div className="app-card" style={{ padding: '16px' }}>
              <span className="text-xs font-bold text-muted uppercase">Leveled Articles</span>
              <div className="text-2xl font-extrabold text-accent mt-1">
                {overview.total_articles?.toLocaleString()}
              </div>
              <span className="text-xs text-muted">CEFR Leveled Texts (A1–C2 Balanced)</span>
            </div>

            <div className="app-card" style={{ padding: '16px' }}>
              <span className="text-xs font-bold text-muted uppercase">Vocabulary Headwords</span>
              <div className="text-2xl font-extrabold text-success mt-1">
                {overview.total_lexicon_words?.toLocaleString()}
              </div>
              <span className="text-xs text-muted">ENGLISH_CERF_WORDS (A1–C2)</span>
            </div>

            <div className="app-card" style={{ padding: '16px' }}>
              <span className="text-xs font-bold text-muted uppercase">Lemma OOV Reduction</span>
              <div className="text-2xl font-extrabold text-warning mt-1">
                +{lemmaImpact.oov_reduction_pct}%
              </div>
              <span className="text-xs text-muted">Coverage: 59.2% (Raw) ➔ 80.7% (Lemma)</span>
            </div>
          </div>

          {/* 1. Part of Speech (POS) Distribution across CEFR Levels */}
          <Card
            title="1. Part-of-Speech (POS) Distribution across CEFR Levels in Dataset"
            icon={<Tag size={18} className="text-primary" />}
            badge={
              <div className="flex gap-1">
                {['ALL', 'NOUN', 'VERB', 'ADJ', 'ADV', 'SCONJ'].map((p) => (
                  <button
                    key={p}
                    className={`btn-pill text-xs ${activePosMetric === p ? 'active' : ''}`}
                    onClick={() => setActivePosMetric(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            }
          >
            <p className="text-xs text-muted mb-3">
              แสดงสัดส่วน Part of Speech ในชุดข้อมูลจริง: ประโยคระดับสูง (B2–C2) จะมีสัดส่วนคำนาม (Noun)
              และคำขยาย (Adjective/Adverb) และตัวเชื่อม subordinate (SCONJ) สูงขึ้นอย่างเห็นได้ชัด
            </p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={posDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="level" />
                  <YAxis unit="%" />
                  <RechartsTooltip formatter={(val) => `${val}%`} />
                  <Legend />
                  {(activePosMetric === 'ALL' || activePosMetric === 'NOUN') && (
                    <Bar dataKey="NOUN" fill={POS_COLORS.NOUN} name="Noun (คำนาม)" />
                  )}
                  {(activePosMetric === 'ALL' || activePosMetric === 'VERB') && (
                    <Bar dataKey="VERB" fill={POS_COLORS.VERB} name="Verb (กริยา)" />
                  )}
                  {(activePosMetric === 'ALL' || activePosMetric === 'ADJ') && (
                    <Bar dataKey="ADJ" fill={POS_COLORS.ADJ} name="Adjective (คำคุณศัพท์)" />
                  )}
                  {(activePosMetric === 'ALL' || activePosMetric === 'ADV') && (
                    <Bar dataKey="ADV" fill={POS_COLORS.ADV} name="Adverb (กริยาวิเศษณ์)" />
                  )}
                  {(activePosMetric === 'ALL' || activePosMetric === 'SCONJ') && (
                    <Bar dataKey="SCONJ" fill={POS_COLORS.SCONJ} name="Subordinate Conj" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* 2. Verb Tense & Syntactic Complexity Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Tense Distribution by CEFR Level */}
            <Card
              title="2. Verb Form & Tense Distribution by CEFR Level"
              icon={<BarChart3 size={18} className="text-accent" />}
            >
              <p className="text-xs text-muted mb-3">
                ระดับ A1–A2 ใช้ Present/Past Simple เป็นหลัก ขณะที่ B1–C2 เริ่มมี Present Perfect, Passive Voice และ Modals
              </p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenseDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="level" />
                    <YAxis unit="%" />
                    <RechartsTooltip formatter={(val) => `${val}%`} />
                    <Legend />
                    <Bar dataKey="Present simple" fill="#3B82F6" stackId="a" />
                    <Bar dataKey="Past simple" fill="#10B981" stackId="a" />
                    <Bar dataKey="Present perfect" fill="#F59E0B" stackId="a" />
                    <Bar dataKey="Present simple passive" fill="#8B5CF6" stackId="a" />
                    <Bar dataKey="Modal" fill="#EC4899" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Sentence Length & Tree Depth */}
            <Card
              title="3. Sentence Length & Syntactic Tree Depth"
              icon={<Network size={18} className="text-success" />}
            >
              <p className="text-xs text-muted mb-3">
                ความยาวประโยคเฉลี่ย (Word Count) และความลึกของ Dependency Tree ใน Dataset เพิ่มขึ้นตามระดับ CEFR
              </p>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={complexity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="level" />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="avg_words"
                      name="Avg Word Count (จำนวนคำ)"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_depth"
                      name="Dependency Tree Depth"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_clauses"
                      name="Clauses / Sentence"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 4. Lemmatization & Named Entity (NER) Evaluation Card */}
          <Card
            title="4. การประเมินผลการใช้ Lemmatization และ Named Entity (NER) บน Dataset"
            icon={<Layers size={18} className="text-primary" />}
          >
            <div className="grid grid-cols-2 gap-6">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-1.5 text-primary">
                  <CheckCircle2 size={16} /> ทำไมต้อง Lemmatize ตอนหาระดับคำศัพท์?
                </h4>
                <p className="text-xs text-muted mb-3">
                  เมื่อทดสอบเปิดพจนานุกรม CEFR กับ Content Words ทั้งหมด {lemmaImpact.total_analyzed_tokens?.toLocaleString()} คำในชุดข้อมูล:
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>เปิดคำศัพท์โดยตรง (Surface Form - ไม่ Lemma):</span>
                    <strong className="text-danger">{lemmaImpact.surface_coverage_pct}%</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span>เปิดคำศัพท์หลังทำ Lemmatization:</span>
                    <strong className="text-success">{lemmaImpact.lemma_coverage_pct}%</strong>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-primary">
                    <span>ลดปัญหาคำที่ไม่รู้จัก (OOV Reduction):</span>
                    <span>+{lemmaImpact.oov_reduction_pct}%</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  ตัวอย่าง: <code>stories</code> ➔ <code>story</code> (A1), <code>bombarded</code> ➔ <code>bombard</code> (B1)
                  หากไม่ Lemma คำผันรูปเหล่านี้จะหลุดเป็นคำ OOV ทันที
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-1.5 text-warning">
                  <AlertCircle size={16} /> ทำไมระดับประโยค/บทความห้ามแทนที่ด้วย Lemma?
                </h4>
                <p className="text-xs text-slate-600 mb-2">
                  หากแทนที่ข้อความทั้งประโยคด้วย Lemma ก่อนส่งให้ LSTM จะทำให้รูปกริยาและ Tense หายไป:
                </p>
                <div className="bg-white p-2.5 rounded border border-slate-200 text-xs font-mono mb-2">
                  <div className="text-slate-500">ต้นฉบับ: Experts have been examining the news.</div>
                  <div className="text-danger mt-1">หลัง Lemma: expert have be examine the news.</div>
                </div>
                <p className="text-xs text-slate-500">
                  สังเกตว่า <code>have been examining</code> (Present perfect continuous = B1) จะกลายเป็น
                  <code>have be examine</code> ซึ่งทำลายสัญญาณไวยากรณ์ ทำให้ความแม่นยำของโมเดลประโยคลดลงจาก 44.0% เหลือ 38.5%
                </p>
              </div>
            </div>
          </Card>

          {/* 5. Interactive Dataset Sentence Explorer */}
          <Card
            title="5. Interactive Dataset Sentence Explorer (สำรวจประโยคจริงใน Dataset)"
            icon={<Filter size={18} className="text-primary" />}
            badge={
              <div className="flex gap-1">
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                  <button
                    key={lvl}
                    className={`btn-pill text-xs ${selectedLvl === lvl ? 'active' : ''}`}
                    onClick={() => setSelectedLvl(lvl)}
                  >
                    Level {lvl}
                  </button>
                ))}
              </div>
            }
          >
            <p className="text-xs text-muted mb-3">
              ตัวอย่างประโยคจริงจากชุดข้อมูลระดับ <strong>{selectedLvl}</strong> พร้อมโครงสร้างไวยากรณ์และรูปกริยาที่โมเดลตรวจพบ
            </p>
            <div className="space-y-3">
              {samples.map((s, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <LevelBadge level={s.level} size="sm" />
                      <span className="badge-tag">{s.source}</span>
                      <span className="text-xs text-muted">{s.word_count} words · {s.clauses} clauses · depth {s.depth}</span>
                    </div>
                    <div className="text-xs font-semibold text-primary">
                      {s.verb_forms?.join(', ') || 'Simple'}
                    </div>
                  </div>
                  <div className="font-medium text-slate-800 mb-2">"{s.text}"</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.tokens?.map((t, tIdx) => (
                      <span key={tIdx} className="chip text-xs">
                        {t.text} <span className="text-slate-400">({t.pos})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        /* =========================================================================
           INPUT TEXT LINGUISTIC VISUALIZATION (ARTICLE SPECIFIC)
           ========================================================================= */
        <div className="text-viz-view">
          {!analysis ? (
            <div className="empty-box">
              <Sparkles size={32} className="text-primary mb-2" />
              <h3>No Article Analyzed Yet</h3>
              <p className="text-muted text-sm">
                Please enter an article in Tab 1 and click "Analyze CEFR Level" first.
              </p>
            </div>
          ) : (
            <Card
              title={`Sentence Dependency Tree & Clause Map (Sentence ${selectedSentIdx + 1} of ${analysis.sentences?.length || 1})`}
              icon={<Network size={18} className="text-accent" />}
              badge={
                <div className="flex gap-2">
                  <button
                    className="btn-ghost text-xs"
                    disabled={selectedSentIdx === 0}
                    onClick={() => setSelectedSentIdx(selectedSentIdx - 1)}
                  >
                    Previous
                  </button>
                  <span className="text-xs font-semibold py-1">
                    Sentence {selectedSentIdx + 1}
                  </span>
                  <button
                    className="btn-ghost text-xs"
                    disabled={selectedSentIdx >= (analysis.sentences?.length || 1) - 1}
                    onClick={() => setSelectedSentIdx(selectedSentIdx + 1)}
                  >
                    Next
                  </button>
                </div>
              }
            >
              <p className="text-sm font-semibold mb-3 text-slate-700">
                "{analysis.sentences?.[selectedSentIdx]?.text}"
              </p>
              <div className="svg-dep-wrapper">
                <svg
                  className="dep-svg"
                  height="180"
                  width={Math.max(700, (analysis.tokens?.filter((t) => t.sent === selectedSentIdx)?.length || 10) * 75 + 60)}
                >
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
                    </marker>
                  </defs>
                  {analysis.tokens?.filter((t) => t.sent === selectedSentIdx)?.map((t, idx, arr) => {
                    const headTok = arr.find((st) => st.i === t.head);
                    if (!headTok || headTok.i === t.i) return null;
                    const headIdx = arr.indexOf(headTok);
                    const x1 = idx * 75 + 40;
                    const x2 = headIdx * 75 + 40;
                    const dist = Math.abs(x2 - x1);
                    const arcHeight = Math.min(100, 25 + dist * 0.25);
                    const midX = (x1 + x2) / 2;
                    const midY = 120 - arcHeight;
                    return (
                      <g key={t.i}>
                        <path d={`M ${x1} 130 Q ${midX} ${midY} ${x2} 130`} fill="none" stroke="#94A3B8" strokeWidth="1.5" markerEnd="url(#arrow)" />
                        <text x={midX} y={midY - 4} textAnchor="middle" fontSize="10" fill="#64748B" fontFamily="JetBrains Mono">
                          {t.dep}
                        </text>
                      </g>
                    );
                  })}
                  {analysis.tokens?.filter((t) => t.sent === selectedSentIdx)?.map((t, idx) => {
                    const x = idx * 75 + 40;
                    const isRoot = t.dep === 'ROOT';
                    return (
                      <g key={t.i} transform={`translate(${x}, 145)`}>
                        <text textAnchor="middle" fontSize="12" fontWeight={isRoot ? '700' : '500'} fill={isRoot ? '#2563EB' : '#1E293B'}>
                          {t.text}
                        </text>
                        <text y="16" textAnchor="middle" fontSize="10" fill={POS_COLORS[t.pos] || '#64748B'} fontFamily="JetBrains Mono">
                          {t.pos}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
