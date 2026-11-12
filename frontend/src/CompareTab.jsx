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
  Legend,
} from 'recharts';
import {
  GitCompare,
  Cpu,
  Sparkles,
  Zap,
  Info,
  Play,
  ListOrdered,
  Search,
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
        usesFeatures: true,
        name: 'Random Forest (+Features)',
        inputType: '41 Word Features',
        features: ['Zipf word frequency', 'Word length & Syllables', 'Vowel ratio & Hyphen', '24 Suffixes + 12 Prefixes'],
        logic: 'ใช้ความถี่คำและโครงสร้างหน่วยคำ (Morphology) ทำนายความยากของคำนอกพจนานุกรม (OOV)',
      },
      {
        key: 'bytelstm',
        usesFeatures: false,
        name: 'Byte-LSTM (Bytes Only)',
        inputType: 'UTF-8 Bytes (No Features)',
        features: ['Raw character bytes (vocab 258, max 32 bytes)', '32d Learned Byte Embedding + 2-Layer BiLSTM'],
        logic: 'อ่านจากตัวอักษรล้วน ไม่เห็นค่า Zipf หรือสถิติที่สกัดไว้เลย',
      },
      {
        key: 'hybrid',
        usesFeatures: true,
        name: 'Byte-LSTM + Features (Hybrid)',
        inputType: 'UTF-8 Bytes + 41 Word Features',
        features: ['Byte-LSTM sequence vector', 'Standardized 41 Word Features (zipf, length, syllables, affixes)'],
        logic: 'ผสาน Byte-LSTM เข้ากับ 41 Word Features เพื่อวัดผลต่างเทียบกับ Byte-LSTM ล้วน',
      },
    ];
  }
  if (scope === 'document') {
    return [
      {
        key: 'rf_tfidf',
        usesFeatures: false,
        name: 'Random Forest (TF-IDF Only)',
        inputType: 'TF-IDF 1-2 grams (No Ling. Features)',
        features: ['Top 8,000 word 1-2 grams TF-IDF', 'ไม่ใช้ Wordlist, Tense, Clause หรือ Readability'],
        logic: 'Baseline ฝั่ง RF ที่ดูแค่สถิติความถี่คำดิบในบทความ ไม่มีตรรกะภาษาศาสตร์',
      },
      {
        key: 'rf',
        usesFeatures: true,
        name: 'Random Forest (+Features)',
        inputType: '212 Doc Features',
        features: [
          'Mean / Max / Std of 65 Sentence Features (195)',
          'Doc stats: n_sentences, doc_ttr, B2+/C1+ share (5) + Sent RF signals (12)',
        ],
        logic: 'รวมสถิติความยากคำ โครงสร้างประโยค Tense และระดับรายประโยคทั้งบทความ',
      },
      {
        key: 'bilstm',
        usesFeatures: false,
        name: 'Word BiLSTM (Raw Only)',
        inputType: 'Pooled Word Sequence (No Ling. Features)',
        features: ['Raw word sequence per sentence (300d GloVe)', 'Mean + Max Pooling -> Logistic Regression'],
        logic: 'อ่านข้อความดิบล้วน ไม่เห็นพจนานุกรมหรือฟีเจอร์ไวยากรณ์',
      },
      {
        key: 'hybrid',
        usesFeatures: true,
        name: 'Word BiLSTM + Features (Hybrid)',
        inputType: `BiLSTM (${hybridInput}) + 200 Doc Features`,
        features: [`Pooled BiLSTM vectors (${hybridInput})`, 'Standardized 200 Document Linguistic Features'],
        logic: 'รวมบริบท Word BiLSTM เข้ากับ 200 Document Linguistic Features',
      },
      {
        key: 'bytelstm',
        usesFeatures: false,
        name: 'Byte-LSTM (Bytes Only)',
        inputType: 'Pooled UTF-8 Bytes (No Ling. Features)',
        features: ['UTF-8 bytes per sentence (vocab 258)', 'Mean + Max Pooling -> Logistic Regression'],
        logic: 'อ่านระดับไบต์ล้วน ไม่ใช้คำศัพท์หรือกฎไวยากรณ์',
      },
      {
        key: 'bytehybrid',
        usesFeatures: true,
        name: 'Byte-LSTM + Features',
        inputType: 'Byte-LSTM + 200 Doc Features',
        features: ['Pooled Byte-LSTM vectors', 'Standardized 200 Document Linguistic Features'],
        logic: 'รวม Byte-LSTM เข้ากับ 200 Document Linguistic Features เพื่อเทียบกับ Byte-LSTM ล้วน',
      },
    ];
  }
  // sentence scope
  return [
    {
      key: 'rf_tfidf',
      usesFeatures: false,
      name: 'Random Forest (TF-IDF Only)',
      inputType: 'TF-IDF 1-2 grams (No Ling. Features)',
      features: ['Top 5,000 word 1-2 grams TF-IDF', 'ไม่ใช้ Wordlist, Zipf, Tense หรือ Clause'],
      logic: 'RF แบบดั้งเดิมที่นับแค่คำที่ปรากฏ เทียบให้เห็นคุณค่าของ 65 Linguistic Features',
    },
    {
      key: 'rf',
      usesFeatures: true,
      name: 'Random Forest (+Features)',
      inputType: '65 Linguistic Features',
      features: [
        'Vocabulary (22) · Verb/Tense (14) · Clause (13) · POS/NER/Readability (16)',
        'ใช้พจนานุกรม CEFR + Zipf + กฎตรวจ Tense & Dependency Tree',
      ],
      logic: 'ตัดสินใจด้วยกติกาไวยากรณ์ ความซับซ้อนต้นไม้ประโยค และความยากคำศัพท์',
    },
    {
      key: 'bilstm',
      usesFeatures: false,
      name: 'Word BiLSTM (Raw Only)',
      inputType: 'Raw Word Sequence (No Ling. Features)',
      features: ['Raw tokens (max 100) + 300d GloVe Embeddings', '2-Layer BiLSTM + Attention & Max Pooling'],
      logic: 'อ่านลำดับคำดิบล้วน ไม่เห็น Wordlist หรือค่า Tense/Clause ที่สกัดไว้',
    },
    {
      key: 'hybrid',
      usesFeatures: true,
      name: 'Word BiLSTM + Features (Hybrid)',
      inputType: `${hybridInput} + 65 Features`,
      features: [`Word BiLSTM on ${hybridInput} (512d)`, 'MLP projection of 65 Linguistic Features (64d)'],
      logic: 'รวมบริบท Word BiLSTM เข้ากับ 65 Linguistic Features',
    },
    {
      key: 'bytelstm',
      usesFeatures: false,
      name: 'Byte-LSTM (Bytes Only)',
      inputType: 'UTF-8 Bytes (No Ling. Features)',
      features: ['Raw UTF-8 bytes (0–255, max 400 bytes)', '64d Byte Embeddings + 2-Layer BiLSTM'],
      logic: 'อ่านระดับไบต์ล้วน ไม่ตัดคำและไม่ใช้ฟีเจอร์ภาษาศาสตร์',
    },
    {
      key: 'bytehybrid',
      usesFeatures: true,
      name: 'Byte-LSTM + Features',
      inputType: 'UTF-8 Bytes + 65 Features',
      features: ['Byte-LSTM sequence vector (512d)', 'MLP projection of 65 Linguistic Features (64d)'],
      logic: 'รวม Byte-LSTM เข้ากับ 65 Linguistic Features เพื่อวัดผลต่างเทียบกับ Byte-LSTM ล้วน',
    },
  ];
}

export default function CompareTab() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('document'); // 'document' | 'sentence' | 'word'
  const [evalSplit, setEvalSplit] = useState('test'); // 'test' | 'dev'
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
    if (newScope === 'word' && !['rf', 'bytelstm', 'hybrid'].includes(selectedConfModel)) {
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
  const modelOrder =
    scope === 'word'
      ? ['rf', 'bytelstm', 'hybrid']
      : ['rf_tfidf', 'rf', 'bilstm', 'hybrid', 'bytelstm', 'bytehybrid'];
  const models = modelOrder.filter((m) => scopeData[m]?.test);
  const modelNames = {
    rf_tfidf: 'Random Forest (TF-IDF Only)',
    rf: 'Random Forest (+Features)',
    bilstm: 'Word BiLSTM (Raw Only)',
    hybrid: scope === 'word' ? 'Byte-LSTM + Features (Hybrid)' : 'Word BiLSTM + Features (Hybrid)',
    bytelstm: 'Byte-LSTM (Bytes Only)',
    bytehybrid: 'Byte-LSTM + Features',
  };
  const usesFeaturesMap = {
    rf_tfidf: false,
    rf: true,
    bilstm: false,
    hybrid: true,
    bytelstm: false,
    bytehybrid: true,
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
  const modelFeatureSpecs = getModelFeatureSummary(scope, metrics).filter((s) => scopeData[s.key]?.test);

  // Paired With vs Without Linguistic Features comparison
  const defaultPairs =
    scope === 'word'
      ? [{ family: 'Byte-LSTM', without: 'bytelstm', with: 'hybrid', without_desc: 'UTF-8 Bytes Only', with_desc: 'Bytes + 41 Word Features' }]
      : [
          { family: 'Random Forest', without: 'rf_tfidf', with: 'rf', without_desc: 'TF-IDF 1-2 grams', with_desc: 'Linguistic Features' },
          { family: 'Word BiLSTM', without: 'bilstm', with: 'hybrid', without_desc: 'Raw Sequence', with_desc: 'Word BiLSTM + Features' },
          { family: 'Byte-LSTM', without: 'bytelstm', with: 'bytehybrid', without_desc: 'UTF-8 Bytes Only', with_desc: 'Byte-LSTM + Features' },
        ];
  const featurePairs = (metrics.feature_comparison?.[scope] || defaultPairs).filter(
    (p) => scopeData[p.without]?.test && scopeData[p.with]?.test
  );
  const pairChartData = featurePairs.map((p) => ({
    family: p.family,
    'Without Features (Acc)': Number((scopeData[p.without].test.accuracy * 100).toFixed(1)),
    'With Features (Acc)': Number((scopeData[p.with].test.accuracy * 100).toFixed(1)),
    'Without Features (QWK)': Number((scopeData[p.without].test.qwk * 100).toFixed(1)),
    'With Features (QWK)': Number((scopeData[p.with].test.qwk * 100).toFixed(1)),
  }));

  const fmtDelta = (a, b, isPercent = true) => {
    const diff = (b - a) * (isPercent ? 100 : 1);
    const sign = diff >= 0 ? '+' : '';
    return { text: `${sign}${diff.toFixed(1)}${isPercent ? '%' : ''}`, pos: diff >= 0 };
  };

  const macroMetric = (res, field) => {
    const direct = res?.[`macro_${field}`];
    if (typeof direct === 'number') return direct;
    const present = (res?.per_class || []).filter((c) => (c.support || 0) > 0);
    if (!present.length) return null;
    return present.reduce((sum, c) => sum + (c[field] || 0), 0) / present.length;
  };

  const calcSelScore = (res) =>
    res ? 0.5 * (res.macro_f1 || 0) + 0.5 * (res.qwk || 0) : -1;

  const devBestModel =
    metrics.best?.[scope] ||
    models.reduce(
      (best, m) => (calcSelScore(scopeData[m]?.dev) > calcSelScore(scopeData[best]?.dev) ? m : best),
      models[0]
    );

  const testBestModel = models.reduce(
    (best, m) => (calcSelScore(scopeData[m]?.test) > calcSelScore(scopeData[best]?.test) ? m : best),
    models[0]
  );

  const renderModelBadges = (m) => {
    const isDevBest = m === devBestModel;
    const isTestBest = m === testBestModel;
    if (isDevBest && isTestBest) {
      return (
        <span
          className="best-pill"
          title="ชนะเกณฑ์ Selection Score (0.5×Macro F1 + 0.5×QWK) ทั้งบน Dev Set และ Test Set"
        >
          BEST (Dev & Test)
        </span>
      );
    }
    return (
      <>
        {isDevBest && (
          <span
            className="best-pill"
            title="ชนะเกณฑ์คัดเลือก Selection Score (0.5×Macro F1 + 0.5×QWK) บน Dev Set"
          >
            BEST (Dev)
          </span>
        )}
        {isTestBest && (
          <span
            className="top-test-pill"
            title="ชนะเกณฑ์ Selection Score (0.5×Macro F1 + 0.5×QWK) บน Test Set"
          >
            BEST (Test)
          </span>
        )}
      </>
    );
  };

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
          {['document', 'sentence', 'word'].map((s) => (
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
      <Card
        title={`Performance Summary on ${evalSplit === 'test' ? 'Test' : 'Dev'} Set (${scope.toUpperCase()} Level)`}
        badge={
          <div className="flex gap-1 items-center">
            <button
              type="button"
              className={`btn-pill text-xs ${evalSplit === 'test' ? 'active' : ''}`}
              onClick={() => setEvalSplit('test')}
            >
              Test Set
            </button>
            <button
              type="button"
              className={`btn-pill text-xs ${evalSplit === 'dev' ? 'active' : ''}`}
              onClick={() => setEvalSplit('dev')}
            >
              Dev Set
            </button>
          </div>
        }
      >
        <div className="table-responsive">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Model Architecture</th>
                <th>Linguistic Features</th>
                <th>Accuracy</th>
                <th>Adjacent Acc (±1)</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>Macro F1</th>
                <th>QWK (Kappa)</th>
                <th>MAE</th>
                <th title="Selection Score = 0.5 × Macro F1 + 0.5 × QWK บน Test Set">
                  Test Sel.
                </th>
                <th title="Selection Score = 0.5 × Macro F1 + 0.5 × QWK บน Dev Set ที่ใช้คัดเลือกป้าย BEST (Dev)">
                  Dev Sel.
                </th>
                <th>Inference (ms)</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const res = scopeData[m]?.[evalSplit];
                const testRes = scopeData[m]?.test;
                const devRes = scopeData[m]?.dev;
                if (!res) return null;
                const isRowBest = evalSplit === 'test' ? m === testBestModel : m === devBestModel;
                const usesFeat = usesFeaturesMap[m];
                const macroPrec = macroMetric(res, 'precision');
                const macroRec = macroMetric(res, 'recall');
                const testSel = calcSelScore(testRes);
                const devSel = calcSelScore(devRes);

                return (
                  <tr key={m} className={isRowBest ? 'highlight-row' : ''}>
                    <td className="font-bold flex flex-wrap items-center gap-1.5">
                      <span>{modelNames[m] || m}</span>
                      {renderModelBadges(m)}
                    </td>
                    <td>
                      <span className={`feat-mode-pill ${usesFeat ? 'with-feat' : 'no-feat'}`}>
                        {usesFeat ? '✓ With Features' : '✕ Raw / No Features'}
                      </span>
                    </td>
                    <td className="font-semibold">{(res.accuracy * 100).toFixed(1)}%</td>
                    <td className="font-semibold text-success">
                      {(res.adjacent_acc * 100).toFixed(1)}%
                    </td>
                    <td>{macroPrec !== null ? `${(macroPrec * 100).toFixed(1)}%` : '-'}</td>
                    <td>{macroRec !== null ? `${(macroRec * 100).toFixed(1)}%` : '-'}</td>
                    <td>{(res.macro_f1 * 100).toFixed(1)}%</td>
                    <td>{(res.qwk * 100).toFixed(1)}%</td>
                    <td>{res.mae?.toFixed(2)}</td>
                    <td className={`font-mono ${m === testBestModel ? 'font-bold text-primary' : 'text-muted'}`}>
                      {testSel >= 0 ? `${(testSel * 100).toFixed(2)}%` : '-'}
                    </td>
                    <td className={`font-mono ${m === devBestModel ? 'font-bold text-success' : 'text-muted'}`}>
                      {devSel >= 0 ? `${(devSel * 100).toFixed(2)}%` : '-'}
                    </td>
                    <td className="text-muted">
                      {scopeData[m]?.infer_ms !== undefined ? `${scopeData[m].infer_ms.toFixed(2)} ms` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted mt-3 space-y-1">
          <p>
            <strong>เกณฑ์คัดเลือก BEST (Dev):</strong> โมเดลที่ได้ <code>Dev Sel. = 0.5 × Macro F1 + 0.5 × QWK</code> สูงสุดบน <strong>Dev Set</strong> (ใช้คัดเลือกโมเดลใช้งานจริงเพื่อป้องกัน Test Set Leakage)
          </p>
          <p>
            <strong>เกณฑ์คัดเลือก BEST (Test):</strong> โมเดลที่ได้ <code>Test Sel. = 0.5 × Macro F1 + 0.5 × QWK</code> สูงสุดบน <strong>Test Set</strong> (แสดงประสิทธิภาพรวมที่ดีที่สุดบนชุดทดสอบจริง)
          </p>
          {scope === 'word' && (
            <p>
              <strong>หมายเหตุ WORD Level:</strong> แสดงเฉพาะ 3 โมเดลที่อ่านโครงสร้างภายในคำได้ (<code>Random Forest + 41 Word Features</code>, <code>Byte-LSTM</code>, <code>Byte-LSTM + Features</code>) เนื่องจากงานระดับคำใช้ทำนายคำนอกพจนานุกรม (Out-of-Vocabulary: OOV) ที่ไม่ซ้ำกับชุดฝึก โมเดลที่ต้องอิงคลังคำทั้งคำอย่าง <code>TF-IDF</code> และ <code>Word BiLSTM</code> จึงไม่สามารถอ่านตัวสะกดภายในคำใหม่ได้ (จะกลายเป็นค่าศูนย์หรือ <code>Unknown Token (&lt;unk&gt;)</code> ทั้งหมด)
            </p>
          )}
        </div>
      </Card>

      {/* 1b. Controlled Comparison: Without vs With Linguistic Features */}
      {featurePairs.length > 0 && (
        <Card
          title={`Controlled Experiment: Without vs With Linguistic Features (${scope.toUpperCase()} Level)`}
          icon={<Zap size={18} className="text-primary" />}
          badge={<span className="badge-tag">Controlled 2×N Comparison (+Δ Impact)</span>}
        >
          <p className="text-sm text-muted mb-4">
            เทียบโมเดลในตระกูลเดียวกันแบบ <strong>ไม่ใช้ Linguistic Features (Raw/TF-IDF)</strong> กับ <strong>ใช้ Linguistic Features</strong> เพื่อวัดว่าฟีเจอร์ทางภาษา (Vocab, Tense, Clause, Readability) ช่วยเพิ่มความแม่นยำได้จริงเท่าไหร่
          </p>
          <div className="table-responsive mb-4">
            <table className="compare-table text-xs">
              <thead>
                <tr>
                  <th>Model Family</th>
                  <th>✕ Without Features</th>
                  <th>Acc / QWK (No Feat)</th>
                  <th>✓ With Features</th>
                  <th>Acc / QWK (+Feat)</th>
                  <th>Δ Accuracy</th>
                  <th>Δ Macro F1</th>
                  <th>Δ QWK</th>
                </tr>
              </thead>
              <tbody>
                {featurePairs.map((p) => {
                  const a = scopeData[p.without].test;
                  const b = scopeData[p.with].test;
                  const dAcc = fmtDelta(a.accuracy, b.accuracy);
                  const dF1 = fmtDelta(a.macro_f1, b.macro_f1);
                  const dQwk = fmtDelta(a.qwk, b.qwk);
                  return (
                    <tr key={p.family}>
                      <td className="font-bold text-sm">{p.family}</td>
                      <td>
                        <div className="font-semibold">{modelNames[p.without]}</div>
                        <div className="text-muted">{p.without_desc}</div>
                      </td>
                      <td className="font-mono">
                        {(a.accuracy * 100).toFixed(1)}% / {(a.qwk * 100).toFixed(1)}%
                      </td>
                      <td>
                        <div className="font-semibold text-primary">{modelNames[p.with]}</div>
                        <div className="text-muted">{p.with_desc}</div>
                      </td>
                      <td className="font-mono font-bold">
                        {(b.accuracy * 100).toFixed(1)}% / {(b.qwk * 100).toFixed(1)}%
                      </td>
                      <td className={`font-mono font-bold ${dAcc.pos ? 'text-success' : 'text-danger'}`}>
                        {dAcc.text}
                      </td>
                      <td className={`font-mono font-bold ${dF1.pos ? 'text-success' : 'text-danger'}`}>
                        {dF1.text}
                      </td>
                      <td className={`font-mono font-bold ${dQwk.pos ? 'text-success' : 'text-danger'}`}>
                        {dQwk.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pairChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="family" />
                <YAxis domain={[0, 100]} unit="%" />
                <RechartsTooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Bar dataKey="Without Features (Acc)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="With Features (Acc)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Without Features (QWK)" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="With Features (QWK)" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

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
            const isBest = spec.key === devBestModel;
            return (
              <div key={spec.key} className={`model-feature-card ${isBest ? 'best' : ''}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                    <span>{spec.name}</span>
                    {renderModelBadges(spec.key)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`feat-mode-pill ${spec.usesFeatures ? 'with-feat' : 'no-feat'}`}>
                      {spec.usesFeatures ? '+Features' : 'No Features'}
                    </span>
                    <span className="badge-tag">{spec.inputType}</span>
                  </div>
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

      {/* 5. Live Side-by-Side Model Tester */}
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
            {Object.keys(liveResult.comparison || {}).map((m) => {
              const res = liveResult.comparison?.[m];
              if (!res) return null;
              return (
                <div key={m} className="live-model-box">
                  <div className="live-model-header">
                    <div>
                      <span className="font-bold text-sm">{modelNames[m] || m.toUpperCase()}</span>
                      <div>
                        <span className={`feat-mode-pill ${usesFeaturesMap[m] ? 'with-feat' : 'no-feat'}`}>
                          {usesFeaturesMap[m] ? '+Features' : 'No Features'}
                        </span>
                      </div>
                    </div>
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
