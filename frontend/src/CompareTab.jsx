import React, { useState, useEffect } from 'react';
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
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Info,
  Play,
} from 'lucide-react';

export default function CompareTab() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('sentence'); // 'sentence' | 'document' | 'word'
  const [liveText, setLiveText] = useState('Experts have been examining the fake news phenomenon.');
  const [liveResult, setLiveResult] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedConfModel, setSelectedConfModel] = useState('rf');

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

  const scopeData = metrics[scope] || {};
  const models = ['rf', 'bilstm', 'bytelstm', 'hybrid'];
  const modelNames = {
    rf: 'Random Forest (Linguistic)',
    bilstm: 'Word BiLSTM (GloVe 300d)',
    bytelstm: 'Byte-LSTM (UTF-8 Bytes)',
    hybrid: 'Hybrid (BiLSTM + Features)',
  };

  // Bar chart data for metrics
  const barChartData = models
    .filter((m) => scopeData[m])
    .map((m) => ({
      name: m.toUpperCase(),
      Accuracy: Number(((scopeData[m]?.test?.accuracy || 0) * 100).toFixed(1)),
      'Adjacent Acc (±1)': Number(((scopeData[m]?.test?.adjacent_acc || 0) * 100).toFixed(1)),
      'Macro F1': Number(((scopeData[m]?.test?.macro_f1 || 0) * 100).toFixed(1)),
      QWK: Number(((scopeData[m]?.test?.qwk || 0) * 100).toFixed(1)),
    }));

  // Confusion matrix of selected model
  const confMatrix = scopeData[selectedConfModel]?.test?.confusion || [];
  const maxConfVal = Math.max(...confMatrix.flat(), 1);

  // Feature importance top 15
  const featImportance = scopeData.rf?.feature_importance?.slice(0, 15) || [];

  return (
    <div className="compare-container">
      {/* Scope Selector Header */}
      <div className="compare-header-row">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GitCompare size={22} className="text-primary" /> Model Evaluation & Comparison
          </h2>
          <p className="text-sm text-muted">
            Rigorous evaluation across 4 distinct architectures (Traditional ML vs Neural vs Hybrid)
          </p>
        </div>
        <div className="scope-tabs">
          {['sentence', 'document', 'word'].map((s) => (
            <button
              key={s}
              className={`scope-tab-btn ${scope === s ? 'active' : ''}`}
              onClick={() => setScope(s)}
            >
              {s.toUpperCase()} Level
            </button>
          ))}
        </div>
      </div>

      {/* Main Benchmark Comparison Table */}
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
                    <td className="text-muted">{scopeData[m]?.infer_ms?.toFixed(1)} ms</td>
                    <td className="text-muted">{scopeData[m]?.size_mb || '-'} MB</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grouped Bar Chart */}
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

      {/* Feature Importance (Proves Linguistic Features work!) */}
      {featImportance.length > 0 && (
        <Card
          title="Random Forest Top Feature Importance (Linguistic Signals)"
          icon={<Zap size={18} className="text-warning" />}
        >
          <p className="text-sm text-muted mb-3">
            แสดงฟีเจอร์ที่มีน้ำหนักสูงสุดในการตัดสินระดับ CEFR: มีทั้งสถิติคำศัพท์ (Zipf, Syllables),
            Tense (Verb forms), และความซับซ้อนของประโยค (Clause depth, Markers)
          </p>
          <div className="feat-grid">
            {featImportance.map((f, i) => (
              <div key={i} className="feat-bar-item">
                <div className="feat-label">
                  <span className="font-semibold text-xs">{f.name}</span>
                  <span className="text-xs text-muted">{(f.importance * 100).toFixed(1)}%</span>
                </div>
                <div className="feat-track">
                  <div
                    className="feat-fill"
                    style={{ width: `${(f.importance / (featImportance[0].importance || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ablation Studies Section */}
      {metrics.ablation && (
        <Card
          title="Ablation Experiments: Lemma & Named Entities Impact"
          icon={<Layers size={18} className="text-accent" />}
        >
          <div className="grid grid-cols-2 gap-6">
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
                โมเดล BiLSTM รับคำดิบ (Raw) จะคง Tense Morphology ได้ดีที่สุด
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
                      <tr key={inp} className={inp === 'raw' ? 'highlight-row' : ''}>
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
        </Card>
      )}

      {/* Live Side-by-Side Model Tester */}
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
            {models.map((m) => {
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

