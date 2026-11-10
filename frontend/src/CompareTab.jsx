import React, { useState, useEffect, useMemo } from 'react';
import { Card, LevelBadge, CEFR_HEX } from './ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  GitCompare,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Info,
  Play,
  ListOrdered,
  Search,
  TrendingUp,
} from 'lucide-react';

const GROUP_META = {
  vocabulary: { label: 'Vocabulary', color: '#2563EB', bg: '#DBEAFE' },
  verb_form: { label: 'Verb Form / Tense', color: '#7C3AED', bg: '#EDE9FE' },
  clause: { label: 'Clause & Syntax', color: '#059669', bg: '#D1FAE5' },
  other: { label: 'POS, NER & Readability', color: '#D97706', bg: '#FEF3C7' },
  'other (POS, entity, readability)': { label: 'POS, NER & Readability', color: '#D97706', bg: '#FEF3C7' },
  sentence_model: { label: 'Sentence RF Signals', color: '#DB2777', bg: '#FCE7F3' },
  frequency_and_shape: { label: 'Frequency & Word Shape', color: '#2563EB', bg: '#DBEAFE' },
  suffixes: { label: 'Suffix Morphology', color: '#7C3AED', bg: '#EDE9FE' },
  prefixes: { label: 'Prefix Morphology', color: '#059669', bg: '#D1FAE5' },
};

const BASE_FEATURE_DESC = {
  n_words: 'จำนวนคำทั้งหมด (Word count)',
  prop_oov: 'สัดส่วนคำนอกพจนานุกรม (OOV ratio)',
  mean_level: 'ระดับ CEFR เฉลี่ยของคำศัพท์',
  max_level: 'ระดับ CEFR สูงสุดของคำศัพท์',
  p75_level: 'เปอร์เซ็นไทล์ที่ 75 ของระดับคำศัพท์',
  n_ge_B2: 'จำนวนคำศัพท์ระดับ B2 ขึ้นไป',
  n_ge_C1: 'จำนวนคำศัพท์ระดับ C1 ขึ้นไป',
  mean_zipf: 'ความถี่คำเฉลี่ยในภาษาอังกฤษ (Zipf)',
  min_zipf: 'ความถี่ต่ำสุด (คำที่หายากที่สุด)',
  prop_rare: 'สัดส่วนคำศัพท์หายาก (Zipf < 3.5)',
  mean_word_len: 'ความยาวคำเฉลี่ย (ตัวอักษร)',
  max_word_len: 'ความยาวคำสูงสุด',
  mean_syll: 'จำนวนพยางค์เฉลี่ยต่อคำ',
  prop_poly: 'สัดส่วนคำหลายพยางค์ (≥ 3 พยางค์)',
  ttr: 'ความหลากหลายคำศัพท์ (Type-Token Ratio)',
  lex_density: 'ความหนาแน่นคำเนื้อหา (Content word ratio)',
  n_verb_groups: 'จำนวนกลุ่มกริยาทั้งหมด',
  n_finite_verbs: 'จำนวนกริยาแท้ (Finite verbs)',
  max_vf_level: 'ระดับ CEFR สูงสุดของ Tense / Verb form',
  mean_vf_level: 'ระดับ CEFR เฉลี่ยของ Tense / Verb form',
  n_vf_ge_B1: 'จำนวนรูปกริยา/Tense ระดับ B1 ขึ้นไป',
  vf_present: 'จำนวนกริยากลุ่ม Present',
  vf_past: 'จำนวนกริยากลุ่ม Past',
  vf_perfect: 'จำนวนกริยากลุ่ม Perfect (have + V3)',
  vf_continuous: 'จำนวนกริยากลุ่ม Continuous (be + V-ing)',
  vf_passive: 'จำนวนกริยากลุ่ม Passive voice (be + V3)',
  vf_modal: 'จำนวนกริยากลุ่ม Modal (should/might/must)',
  vf_future: 'จำนวนกริยากลุ่ม Future (will/going to)',
  vf_nonfinite: 'จำนวนรูป Non-finite (to+V / gerund / participle)',
  vf_rare: 'จำนวนโครงสร้างขั้นสูง (Inversion / Subjunctive)',
  n_clauses: 'จำนวนอนุประโยค (Clauses) ทั้งหมด',
  n_finite_clauses: 'จำนวน Finite clauses',
  n_relative: 'จำนวน Relative clauses (who/which/that)',
  n_adverbial: 'จำนวน Adverbial clauses (when/because/if)',
  n_complement: 'จำนวน Complement & Subject clauses',
  n_nonfinite: 'จำนวน Non-finite clauses',
  n_coordinate: 'จำนวน Coordinate clauses (and/but/or)',
  tree_depth: 'ความลึกสูงสุดของ Dependency Parse Tree',
  mean_dep_dist: 'ระยะห่างการเชื่อมโยงคำเฉลี่ย (Dependency distance)',
  max_dep_dist: 'ระยะห่างการเชื่อมโยงคำสูงสุด',
  n_mark: 'จำนวนคำเชื่อมอนุประโยค (Subordinator markers)',
  n_wh: 'จำนวนคำ Wh- (which, who, where)',
  n_comma: 'จำนวนเครื่องหมายจุลภาค (,)',
  n_entities: 'จำนวน Named Entities (ชื่อคน/สถานที่/องค์กร)',
  prop_entity: 'สัดส่วนคำที่เป็น Named Entity',
  flesch: 'คะแนนความอ่านง่าย Flesch Reading Ease',
  fk_grade: 'ระดับชั้นความยาก Flesch-Kincaid Grade Level',
  n_sentences: 'จำนวนประโยคทั้งหมดในบทความ',
  doc_ttr: 'ความหลากหลายคำศัพท์ทั้งบทความ (400 คำแรก)',
  doc_prop_ge_B2: 'สัดส่วนคำระดับ B2+ ทั้งบทความ',
  doc_prop_ge_C1: 'สัดส่วนคำระดับ C1+ ทั้งบทความ',
  doc_mean_level: 'ระดับคำศัพท์เฉลี่ยทั้งบทความ',
  zipf: 'ความถี่คำในภาษาอังกฤษ (Zipf frequency)',
  length: 'จำนวนตัวอักษรของคำ',
  syllables: 'จำนวนพยางค์ของคำ',
  vowel_ratio: 'สัดส่วนสระต่อตัวอักษรทั้งหมด',
  has_hyphen: 'มีเครื่องหมายขีดกลาง (-) หรือไม่',
};

function describeFeature(name) {
  if (BASE_FEATURE_DESC[name]) return BASE_FEATURE_DESC[name];
  if (name.startsWith('prop_') && name.length === 7) {
    return `สัดส่วนคำศัพท์ระดับ ${name.slice(5)}`;
  }
  if (name.startsWith('pos_')) {
    return `สัดส่วนชนิดคำ ${name.slice(4)} (POS ratio)`;
  }
  if (name.startsWith('sent_prob_')) {
    return `ความน่าจะเป็นเฉลี่ยระดับ ${name.slice(10)} จาก Sentence RF`;
  }
  if (name.startsWith('sent_hist_')) {
    return `สัดส่วนประโยคที่ทำนายเป็นระดับ ${name.slice(10)}`;
  }
  if (name.startsWith('suf_')) {
    return `ลงท้ายด้วยปัจจัย -${name.slice(4)}`;
  }
  if (name.startsWith('pre_')) {
    return `ขึ้นต้นด้วยอุปสรรค ${name.slice(4)}-`;
  }
  for (const [prefix, label] of [
    ['mean_', 'ค่าเฉลี่ยรายประโยค: '],
    ['max_', 'ค่าสูงสุดรายประโยค: '],
    ['std_', 'ส่วนเบี่ยงเบนมาตรฐาน: '],
  ]) {
    if (name.startsWith(prefix)) {
      return label + describeFeature(name.slice(prefix.length));
    }
  }
  return name;
}

function getModelFeatureSummary(scope, metrics) {
  const hybridInput = metrics?.ablation?.hybrid_input === 'ner' ? 'Raw + NER Masked (<PERSON>, <GPE>)' : 'Raw Tokens';
  if (scope === 'word') {
    return [
      {
        key: 'rf',
        name: 'Random Forest',
        inputType: '41 Word Features (Tabular)',
        features: ['Zipf word frequency', 'Word length & Syllables', 'Vowel ratio & Hyphen', '24 Suffixes (-tion, -ity, -ous...)', '12 Prefixes (un-, dis-, inter-...)'],
        logic: 'ใช้ความถี่คำและโครงสร้างหน่วยคำ (Morphology) จัดลำดับความยากของคำนอกพจนานุกรม (OOV)',
      },
      {
        key: 'bytelstm',
        name: 'Byte-LSTM',
        inputType: 'UTF-8 Byte Sequence (max 32 bytes)',
        features: ['Raw character bytes (vocab 258)', '32d Learned Byte Embedding', '2-Layer BiLSTM + Attention & Max Pool'],
        logic: 'เรียนรู้แพทเทิร์นตัวอักษร รากศัพท์ และคำลงท้ายจากระดับไบต์โดยไม่ต้องตัดคำ',
      },
      {
        key: 'hybrid',
        name: 'Hybrid (Byte-LSTM + Features)',
        inputType: 'UTF-8 Bytes + 41 Word Features',
        features: ['Byte-LSTM sequence vector', 'Standardized 41 Word Features (zipf, length, syllables, affixes)', 'Fused MLP Classification Head'],
        logic: 'ผสานบริบทระดับตัวอักษรเข้ากับความถี่คำ Zipf และโครงสร้างพยางค์',
      },
    ];
  }
  if (scope === 'document') {
    return [
      {
        key: 'rf',
        name: 'Random Forest',
        inputType: '212 Document Features',
        features: [
          'Mean / Max / Std of 65 Sentence Features (195)',
          'Doc stats: n_sentences, doc_ttr, B2+/C1+ share (5)',
          'Sentence RF probabilities & level histogram (12)',
        ],
        logic: 'รวมสถิติความยากคำ ศัพท์สูง โครงสร้างประโยค Tense และสัดส่วนความยากรายประโยคทั้งบทความ',
      },
      {
        key: 'bilstm',
        name: 'Word BiLSTM',
        inputType: 'Hierarchical Sentence BiLSTM Embeddings',
        features: [
          'Raw word sequence per sentence (300d GloVe)',
          'Mean + Max Pooling of Sentence BiLSTM vectors',
          'Sentence level probabilities + histogram -> Logistic Regression',
        ],
        logic: 'ดึงความหมายและบริบทลำดับคำของทุกประโยคในบทความมารวมกันแบบ Hierarchical',
      },
      {
        key: 'bytelstm',
        name: 'Byte-LSTM',
        inputType: 'Hierarchical Byte-LSTM Embeddings',
        features: [
          'UTF-8 bytes per sentence (vocab 258)',
          'Mean + Max Pooling of Sentence Byte-LSTM vectors',
          'Sentence level probabilities + histogram -> Logistic Regression',
        ],
        logic: 'จับรูปแบบ Morphology และคำศัพท์ยาว/ซับซ้อนในระดับตัวอักษรทั้งบทความ',
      },
      {
        key: 'hybrid',
        name: 'Hybrid (BiLSTM + Features)',
        inputType: 'Hierarchical BiLSTM + 200 Doc Linguistic Features',
        features: [
          `Word BiLSTM (${hybridInput}) + 65 Sent Features`,
          'Standardized 200 Document Linguistic Features',
          'Mean/Max Sentence Vectors + Doc Features -> Logistic Regression',
        ],
        logic: 'รวมทั้งความเข้าใจบริบทจาก Deep Learning และตรรกะไวยากรณ์ (Vocab, Tense, Clause, Readability)',
      },
    ];
  }
  // sentence scope
  return [
    {
      key: 'rf',
      name: 'Random Forest',
      inputType: '65 Linguistic Features',
      features: [
        'Vocabulary (22): prop_A1..C2, min/mean Zipf, syllables, TTR, OOV',
        'Verb Form / Tense (14): max/mean VF level, perfect, passive, modal',
        'Clause & Syntax (13): n_clauses, tree_depth, dep_dist, rel/advcl',
        'POS, NER & Readability (16): 12 POS ratios, entities, Flesch, FK Grade',
      ],
      logic: 'ตัดสินใจด้วยกติกาไวยากรณ์ ความซับซ้อนโครงสร้างต้นไม้ และสถิติความหายากของคำศัพท์ล้วนๆ',
    },
    {
      key: 'bilstm',
      name: 'Word BiLSTM',
      inputType: 'Raw Word Sequence (max 100 tokens)',
      features: [
        'Raw tokens (คงรูปผันกริยา/Tense ไม่ผ่าน Lemma)',
        '300d Pretrained spaCy GloVe Word Embeddings',
        '2-Layer BiLSTM (128d) + Attention & Max Pooling (512d)',
      ],
      logic: 'อ่านลำดับคำและรูปกริยาดิบจากซ้ายไปขวาและขวาไปซ้ายเพื่อจับบริบทประโยค',
    },
    {
      key: 'bytelstm',
      name: 'Byte-LSTM',
      inputType: 'UTF-8 Byte Sequence (max 400 bytes)',
      features: [
        'Raw UTF-8 bytes (0–255, vocab 258)',
        '64d Learned Byte Embeddings',
        '2-Layer BiLSTM + Attention & Max Pooling (512d)',
      ],
      logic: 'ไม่อาศัย Dictionary แต่จับความซับซ้อนจากความยาวและรากคำ/หน่วยคำระดับ Byte โดยตรง',
    },
    {
      key: 'hybrid',
      name: 'Hybrid (BiLSTM + Features)',
      inputType: `${hybridInput} + 65 Linguistic Features`,
      features: [
        `Word BiLSTM encoder on ${hybridInput} (512d)`,
        'MLP projection of 65 Standardized Linguistic Features (64d)',
        'Concatenated 576d representation -> 6 CEFR classes',
      ],
      logic: 'รวม Deep Learning (บริบทลำดับคำ) เข้ากับ Logic เชิงภาษาศาสตร์ (Tense, Clause, Vocab, Readability)',
    },
  ];
}

export default function CompareTab() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('sentence'); // 'sentence' | 'document' | 'word'
  const [liveText, setLiveText] = useState('Experts have been examining the fake news phenomenon.');
  const [liveResult, setLiveResult] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedConfModel, setSelectedConfModel] = useState('rf');

  // Feature ranking filters
  const [featGroupFilter, setFeatGroupFilter] = useState('ALL');
  const [featSearch, setFeatSearch] = useState('');
  const [featLimit, setFeatLimit] = useState(20);

  useEffect(() => {
    fetch('/api/metrics')
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching metrics:', err);
        setLoading(false);
      });
  }, []);

  // Reset filters when switching scope
  const handleScopeChange = (newScope) => {
    setScope(newScope);
    setFeatGroupFilter('ALL');
    setFeatSearch('');
    if (newScope === 'word' && selectedConfModel === 'bilstm') {
      setSelectedConfModel('rf');
    }
  };

  const handleLiveTest = async () => {
    if (!liveText.trim()) return;
    setLiveLoading(true);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: liveText }),
      });
      const data = await res.json();
      setLiveResult(data);
    } catch (err) {
      alert('Error during live comparison: ' + err.message);
    } finally {
      setLiveLoading(false);
    }
  };

  const scopeData = metrics?.[scope] || {};
  const models = scope === 'word' ? ['rf', 'bytelstm', 'hybrid'] : ['rf', 'bilstm', 'bytelstm', 'hybrid'];
  const modelNames = {
    rf: 'Random Forest (Linguistic)',
    bilstm: 'Word BiLSTM (GloVe 300d)',
    bytelstm: 'Byte-LSTM (UTF-8 Bytes)',
    hybrid: 'Hybrid (BiLSTM + Features)',
  };

  // Full ranked features (fallback to top 25 if backend not enriched)
  const allRankedFeatures = useMemo(() => {
    const raw = scopeData.rf?.feature_importance_all || scopeData.rf?.feature_importance || [];
    return raw.map((item, idx) => ({
      rank: item.rank || idx + 1,
      name: item.name,
      importance: item.importance,
      group: item.group || 'other',
    }));
  }, [scopeData]);

  const availableGroups = useMemo(() => {
    const gs = new Set(allRankedFeatures.map((f) => f.group));
    return ['ALL', ...Array.from(gs)];
  }, [allRankedFeatures]);

  const filteredRankedFeatures = useMemo(() => {
    const q = featSearch.trim().toLowerCase();
    const filtered = allRankedFeatures.filter((f) => {
      const matchGroup = featGroupFilter === 'ALL' || f.group === featGroupFilter;
      const matchText =
        !q ||
        f.name.toLowerCase().includes(q) ||
        describeFeature(f.name).toLowerCase().includes(q);
      return matchGroup && matchText;
    });
    return featLimit === 'ALL' ? filtered : filtered.slice(0, featLimit);
  }, [allRankedFeatures, featGroupFilter, featSearch, featLimit]);

  const maxImportance = allRankedFeatures[0]?.importance || 1;

  // Group importance list sorted descending
  const groupImportanceList = useMemo(() => {
    const gi = scopeData.rf?.group_importance;
    if (!gi) return [];
    return Object.entries(gi)
      .map(([group, weight]) => ({ group, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [scopeData]);

  if (loading) {
    return (
      <div className="loading-box">
        <div className="spinner large" />
        <p className="mt-3 text-muted">Loading model benchmarks and evaluations...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="empty-box">
        <Info size={32} className="text-warning mb-2" />
        <h3>Model Metrics Not Ready Yet</h3>
        <p className="text-muted text-sm">
          Models are currently training in the background. Please refresh in a moment.
        </p>
      </div>
    );
  }

  const barChartData = models
    .filter((m) => scopeData[m])
    .map((m) => ({
      name: m.toUpperCase(),
      Accuracy: Number(((scopeData[m]?.test?.accuracy || 0) * 100).toFixed(1)),
      'Adjacent Acc (±1)': Number(((scopeData[m]?.test?.adjacent_acc || 0) * 100).toFixed(1)),
      'Macro F1': Number(((scopeData[m]?.test?.macro_f1 || 0) * 100).toFixed(1)),
      QWK: Number(((scopeData[m]?.test?.qwk || 0) * 100).toFixed(1)),
    }));

  const confMatrix = scopeData[selectedConfModel]?.test?.confusion || [];
  const maxConfVal = Math.max(...confMatrix.flat(), 1);
  const modelFeatureSpecs = getModelFeatureSummary(scope, metrics);

  // Build neural learning curve data (Val Macro-F1 across epochs)
  const historyEpochs = (() => {
    const neuralModels = models.filter((m) => m !== 'rf' && scopeData[m]?.history?.length);
    if (!neuralModels.length) return [];
    const maxEp = Math.max(...neuralModels.map((m) => scopeData[m].history.length));
    const rows = [];
    for (let ep = 1; ep <= maxEp; ep++) {
      const row = { epoch: `Ep ${ep}` };
      neuralModels.forEach((m) => {
        const entry = scopeData[m].history.find((h) => h.epoch === ep);
        if (entry) {
          row[`${m}_qwk`] = Number((entry.dev_qwk * 100).toFixed(1));
          row[`${m}_loss`] = Number(entry.dev_loss.toFixed(3));
        }
      });
      rows.push(row);
    }
    return rows;
  })();

  return (
    <div className="compare-container">
      {/* Scope Selector Header */}
      <div className="compare-header-row">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GitCompare size={22} className="text-primary" /> Model Evaluation & Feature Comparison
          </h2>
          <p className="text-sm text-muted">
            เปรียบเทียบประสิทธิภาพ 4 สถาปัตยกรรม พร้อมฟีเจอร์ที่ใช้จริงและการจัดลำดับความสำคัญของฟีเจอร์
          </p>
        </div>
        <div className="scope-tabs">
          {['sentence', 'document', 'word'].map((s) => (
            <button
              key={s}
              className={`scope-tab-btn ${scope === s ? 'active' : ''}`}
              onClick={() => handleScopeChange(s)}
            >
              {s.toUpperCase()} Level
            </button>
          ))}
        </div>
      </div>

      {/* 1. Main Benchmark Comparison Table */}
      <Card title={`Performance Summary on Test Set (${scope.toUpperCase()} Level)`}>
        <div className="table-responsive">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Model Architecture</th>
                <th>Accuracy</th>
                <th>Adjacent Acc (±1)</th>
                <th>Macro F1</th>
                <th>QWK (Kappa)</th>
                <th>MAE</th>
                <th>Inference (ms)</th>
                <th>Size (MB)</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const res = scopeData[m]?.test;
                if (!res) return null;
                const isBest = metrics.best?.[scope] === m;

                return (
                  <tr key={m} className={isBest ? 'highlight-row' : ''}>
                    <td className="font-bold flex items-center gap-2">
                      {modelNames[m]}
                      {isBest && <span className="best-pill">BEST</span>}
                    </td>
                    <td className="font-semibold">{(res.accuracy * 100).toFixed(1)}%</td>
                    <td className="font-semibold text-success">
                      {(res.adjacent_acc * 100).toFixed(1)}%
                    </td>
                    <td>{(res.macro_f1 * 100).toFixed(1)}%</td>
                    <td>{(res.qwk * 100).toFixed(1)}%</td>
                    <td>{res.mae?.toFixed(2)}</td>
                    <td className="text-muted">
                      {scopeData[m]?.infer_ms !== undefined ? `${scopeData[m].infer_ms.toFixed(2)} ms` : '-'}
                    </td>
                    <td className="text-muted">{scopeData[m]?.size_mb || '-'} MB</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2. Features Used by Each Model */}
      <Card
        title={`Features Used by Each Model — ฟีเจอร์ที่แต่ละโมเดลใช้ (${scope.toUpperCase()} Level)`}
        icon={<Cpu size={18} className="text-primary" />}
      >
        <p className="text-sm text-muted mb-4">
          แต่ละโมเดลรับข้อมูลและสกัดคุณลักษณะต่างกัน เพื่อทดสอบว่าการใช้ <strong>Linguistic Features (Tense, Clause, Vocab)</strong> vs <strong>Sequence (Word / Byte)</strong> แบบไหนแม่นยำกว่ากัน
        </p>
        <div className={`grid ${modelFeatureSpecs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
          {modelFeatureSpecs.map((spec) => {
            const isBest = metrics.best?.[scope] === spec.key;
            return (
              <div key={spec.key} className={`model-feature-card ${isBest ? 'best' : ''}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-sm flex items-center gap-2">
                    {spec.name}
                    {isBest && <span className="best-pill">BEST</span>}
                  </div>
                  <span className="badge-tag">{spec.inputType}</span>
                </div>
                <p className="text-xs text-muted mb-2">{spec.logic}</p>
                <ul className="feature-bullet-list">
                  {spec.features.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 3. Feature Group Importance + Ranked Feature Importance List */}
      {allRankedFeatures.length > 0 && (
        <Card
          title={`Feature Importance Ranking (${scope.toUpperCase()} Level · ${allRankedFeatures.length} Features)`}
          icon={<ListOrdered size={18} className="text-warning" />}
          badge={
            <span className="badge-tag">
              Gini Feature Importance (Random Forest)
            </span>
          }
        >
          {/* Category Weight Summary */}
          {groupImportanceList.length > 0 && (
            <div className="group-importance-section mb-4">
              <div className="text-xs font-bold text-muted uppercase mb-2">
                Feature Category Weights (สัดส่วนน้ำหนักรวมแยกตามกลุ่มฟีเจอร์)
              </div>
              <div className="group-weight-grid">
                {groupImportanceList.map(({ group, weight }) => {
                  const meta = GROUP_META[group] || { label: group, color: '#64748B', bg: '#F1F5F9' };
                  const pct = (weight * 100).toFixed(1);
                  return (
                    <div key={group} className="group-weight-card">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="font-mono font-bold text-sm">{pct}%</span>
                      </div>
                      <div className="feat-track">
                        <div
                          className="feat-fill"
                          style={{ width: `${pct}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <div className="feat-toolbar">
            <div className="flex flex-wrap gap-1.5 items-center">
              {availableGroups.map((g) => {
                const meta = GROUP_META[g];
                const label = g === 'ALL' ? `All (${allRankedFeatures.length})` : (meta?.label || g);
                return (
                  <button
                    key={g}
                    className={`btn-pill text-xs ${featGroupFilter === g ? 'active' : ''}`}
                    onClick={() => setFeatGroupFilter(g)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 items-center">
              <div className="search-input-wrap">
                <Search size={14} className="text-muted" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search feature..."
                  value={featSearch}
                  onChange={(e) => setFeatSearch(e.target.value)}
                />
              </div>
              <select
                className="select-control text-xs"
                value={featLimit}
                onChange={(e) => setFeatLimit(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              >
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
                <option value={40}>Top 40</option>
                <option value="ALL">Show All ({allRankedFeatures.length})</option>
              </select>
            </div>
          </div>

          {/* Ranked Feature Table */}
          <div className="table-responsive" style={{ maxHeight: '420px' }}>
            <table className="compare-table text-xs">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Rank</th>
                  <th>Feature Name</th>
                  <th>Meaning (คำอธิบายฟีเจอร์)</th>
                  <th>Category</th>
                  <th style={{ width: 180 }}>Importance Weight</th>
                </tr>
              </thead>
              <tbody>
                {filteredRankedFeatures.map((f) => {
                  const meta = GROUP_META[f.group] || { label: f.group, color: '#64748B', bg: '#F1F5F9' };
                  const pct = (f.importance * 100).toFixed(2);
                  const relWidth = (f.importance / maxImportance) * 100;
                  return (
                    <tr key={f.name} className={f.rank <= 3 ? 'highlight-row' : ''}>
                      <td className="font-mono font-bold">#{f.rank}</td>
                      <td className="font-mono font-semibold text-primary">{f.name}</td>
                      <td>{describeFeature(f.name)}</td>
                      <td>
                        <span
                          className="group-badge"
                          style={{ backgroundColor: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="feat-track" style={{ flex: 1 }}>
                            <div
                              className="feat-fill"
                              style={{ width: `${relWidth}%`, background: meta.color }}
                            />
                          </div>
                          <span className="font-mono font-semibold" style={{ width: 48, textAlign: 'right' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. Grouped Bar Chart & Confusion Matrix */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Metrics Comparison (Test Set %)">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="Accuracy" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Adjacent Acc (±1)" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Macro F1" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Confusion Matrix Heatmap */}
        <Card
          title="Confusion Matrix (Actual vs Predicted)"
          badge={
            <select
              className="select-control text-xs"
              value={selectedConfModel}
              onChange={(e) => setSelectedConfModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          }
        >
          <div className="conf-matrix-container">
            <div className="conf-grid">
              <div className="conf-cell header">Act \ Pred</div>
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                <div key={lvl} className="conf-cell header">{lvl}</div>
              ))}

              {confMatrix.map((row, actualIdx) => (
                <React.Fragment key={actualIdx}>
                  <div className="conf-cell row-header">
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][actualIdx]}
                  </div>
                  {row.map((val, predIdx) => {
                    const ratio = val / maxConfVal;
                    const isDiagonal = actualIdx === predIdx;
                    return (
                      <div
                        key={predIdx}
                        className={`conf-cell value ${isDiagonal ? 'diagonal' : ''}`}
                        style={{
                          backgroundColor: isDiagonal
                            ? `rgba(16, 185, 129, ${Math.max(0.15, ratio)})`
                            : `rgba(239, 68, 68, ${ratio * 0.7})`,
                          color: ratio > 0.4 ? '#fff' : '#1e293b',
                        }}
                        title={`Actual: ${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][actualIdx]}, Pred: ${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][predIdx]} (${val})`}
                      >
                        {val}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-muted text-center mt-2">
              Diagonal (Green) = Correct Predictions. Adjacent cells = Off by 1 level.
            </p>
          </div>
        </Card>
      </div>

      {/* 5. Neural Learning Curves (when epoch history exists) */}
      {historyEpochs.length > 0 && (
        <Card
          title={`Neural Training Curves (${scope.toUpperCase()} Level — Dev QWK %)`}
          icon={<TrendingUp size={18} className="text-success" />}
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyEpochs} margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="epoch" />
                <YAxis unit="%" />
                <RechartsTooltip formatter={(v) => `${v}%`} />
                <Legend />
                {models.includes('bilstm') && scopeData.bilstm?.history?.length > 0 && (
                  <Line type="monotone" dataKey="bilstm_qwk" name="Word BiLSTM QWK" stroke="#3B82F6" strokeWidth={2} />
                )}
                {models.includes('bytelstm') && scopeData.bytelstm?.history?.length > 0 && (
                  <Line type="monotone" dataKey="bytelstm_qwk" name="Byte-LSTM QWK" stroke="#10B981" strokeWidth={2} />
                )}
                {models.includes('hybrid') && scopeData.hybrid?.history?.length > 0 && (
                  <Line type="monotone" dataKey="hybrid_qwk" name="Hybrid QWK" stroke="#7C3AED" strokeWidth={2.5} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* 6. Ablation Studies Section */}
      {metrics.ablation && (
        <Card
          title="Ablation Experiments: Feature Groups, Lemma & Named Entities Impact"
          icon={<Layers size={18} className="text-accent" />}
        >
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="font-bold text-sm mb-2">1. Word Lexicon Lookup: Lemma vs Surface Form</h4>
              <p className="text-xs text-muted mb-3">
                การ Lemma ก่อนเปิดตารางคำศัพท์ช่วยลด OOV (คำที่ไม่รู้จัก) ได้อย่างมีนัยสำคัญ
              </p>
              <table className="compare-table text-xs">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Test Accuracy</th>
                    <th>Macro F1</th>
                    <th>OOV Rate (Test)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold">With Lemmatization</td>
                    <td className="text-success font-bold">
                      {((metrics.ablation.rf_lookup?.lemma?.accuracy || 0) * 100).toFixed(1)}%
                    </td>
                    <td>{((metrics.ablation.rf_lookup?.lemma?.macro_f1 || 0) * 100).toFixed(1)}%</td>
                    <td className="text-success font-bold">
                      {((metrics.ablation.oov_rate?.lemma || 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td>Surface Form (No Lemma)</td>
                    <td>{((metrics.ablation.rf_lookup?.surface?.accuracy || 0) * 100).toFixed(1)}%</td>
                    <td>{((metrics.ablation.rf_lookup?.surface?.macro_f1 || 0) * 100).toFixed(1)}%</td>
                    <td className="text-danger font-bold">
                      {((metrics.ablation.oov_rate?.surface || 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-2">2. BiLSTM Input: Raw vs Lemma vs NER Mask</h4>
              <p className="text-xs text-muted mb-3">
                โมเดล BiLSTM รับคำดิบ/NER-masked จะคง Tense Morphology ได้ดีกว่าการทำ Lemma ทั้งประโยค
              </p>
              <table className="compare-table text-xs">
                <thead>
                  <tr>
                    <th>Input Format</th>
                    <th>Test Accuracy</th>
                    <th>Macro F1</th>
                    <th>QWK</th>
                  </tr>
                </thead>
                <tbody>
                  {['raw', 'lemma', 'ner'].map((inp) => {
                    const r = metrics.ablation.lstm_input?.[inp]?.test;
                    if (!r) return null;
                    return (
                      <tr key={inp} className={inp === 'ner' ? 'highlight-row' : ''}>
                        <td className="font-semibold">
                          {inp === 'raw'
                            ? 'Raw Tokens (Preserves Tense)'
                            : inp === 'lemma'
                            ? 'Lemmatized (Loses Tense)'
                            : 'Raw + NER Masked'}
                        </td>
                        <td>{(r.accuracy * 100).toFixed(1)}%</td>
                        <td>{(r.macro_f1 * 100).toFixed(1)}%</td>
                        <td>{(r.qwk * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Feature Group Ablation */}
          {metrics.ablation.rf_groups && (
            <div>
              <h4 className="font-bold text-sm mb-2">3. Feature Group Ablation (ตัดทีละกลุ่มฟีเจอร์บน Random Forest)</h4>
              <p className="text-xs text-muted mb-2">
                ทดสอบตัดกลุ่มฟีเจอร์ออกทีละกลุ่มเพื่อพิสูจน์ว่าทั้ง Vocabulary, Verb Form/Tense และ Clause มีส่วนช่วยความแม่นยำจริง
              </p>
              <table className="compare-table text-xs">
                <thead>
                  <tr>
                    <th>Feature Subset</th>
                    <th>Test Accuracy</th>
                    <th>Adjacent Acc (±1)</th>
                    <th>Macro F1</th>
                    <th>QWK</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['all', 'All 65 Features (Full Model)'],
                    ['without_vocabulary', 'Without Vocabulary Features'],
                    ['without_verb_form', 'Without Verb Form / Tense Features'],
                    ['without_clause', 'Without Clause / Syntax Features'],
                    ['only_vocabulary', 'Only Vocabulary Features'],
                    ['only_verb_form', 'Only Verb Form / Tense Features'],
                    ['only_clause', 'Only Clause / Syntax Features'],
                  ].map(([k, label]) => {
                    const row = metrics.ablation.rf_groups[k];
                    if (!row) return null;
                    return (
                      <tr key={k} className={k === 'all' ? 'highlight-row' : ''}>
                        <td className="font-semibold">{label}</td>
                        <td>{(row.accuracy * 100).toFixed(1)}%</td>
                        <td>{(row.adjacent_acc * 100).toFixed(1)}%</td>
                        <td>{(row.macro_f1 * 100).toFixed(1)}%</td>
                        <td>{(row.qwk * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 7. Live Side-by-Side Model Tester */}
      <Card
        title="Live Side-by-Side Model Comparison"
        icon={<Sparkles size={18} className="text-primary" />}
      >
        <p className="text-sm text-muted mb-3">
          ทดสอบใส่ประโยคหรือย่อหน้าใดๆ เพื่อดูการประเมิน CEFR แบบสดๆ พร้อม Probability Distribution ของทั้ง 4 โมเดล
        </p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            className="article-input"
            style={{ height: '42px' }}
            placeholder="Type any sentence to compare all 4 models..."
            value={liveText}
            onChange={(e) => setLiveText(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={liveLoading || !liveText.trim()}
            onClick={handleLiveTest}
          >
            {liveLoading ? <span className="spinner" /> : <Play size={16} />} Compare
          </button>
        </div>

        {liveResult && (
          <div className="grid grid-cols-4 gap-4">
            {['rf', 'bilstm', 'bytelstm', 'hybrid'].map((m) => {
              const res = liveResult.comparison?.[m];
              if (!res) return null;
              return (
                <div key={m} className="live-model-box">
                  <div className="live-model-header">
                    <span className="font-bold text-sm">{m.toUpperCase()}</span>
                    <LevelBadge level={res.document?.level} label={res.document?.label} />
                  </div>
                  <div className="prob-bars mt-2">
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl, idx) => {
                      const prob = res.probabilities?.[idx] || 0;
                      return (
                        <div key={lvl} className="prob-row">
                          <span className="text-xs text-muted">{lvl}</span>
                          <div className="prob-track">
                            <div
                              className="prob-fill"
                              style={{
                                width: `${prob * 100}%`,
                                backgroundColor: CEFR_HEX[lvl],
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono">{(prob * 100).toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
