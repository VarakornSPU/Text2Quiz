import React, { useState, useEffect } from 'react';
import AnalyzeTab from './AnalyzeTab';
import CompareTab from './CompareTab';
import VisualizeTab from './VisualizeTab';
import {
  Sparkles,
  BookOpen,
  GitCompare,
  BarChart3,
  BrainCircuit,
  AlertCircle,
  X,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('analyze');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [bestModel, setBestModel] = useState(null);
  const [availableModels, setAvailableModels] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [globalToast, setGlobalToast] = useState(null);

  // Check health and run initial analysis on startup
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setBackendReady(true);
        if (data.best_model) {
          setBestModel(data.best_model);
        }
        if (Array.isArray(data.available_models)) {
          setAvailableModels(data.available_models);
        }
      })
      .catch((err) => {
        console.warn('Backend not yet ready:', err);
      });
  }, []);

  const showToast = (message) => {
    setGlobalToast(message);
    setTimeout(() => {
      setGlobalToast((cur) => (cur === message ? null : cur));
    }, 6000);
  };

  const handleAnalyze = async (text, modelConfig = 'auto') => {
    setLoading(true);
    setAnalysisError(null);
    try {
      const payload =
        typeof modelConfig === 'string'
          ? { text, model: modelConfig }
          : {
              text,
              model: modelConfig.model || 'auto',
              doc_model: modelConfig.docModel || modelConfig.doc_model,
              sentence_model: modelConfig.sentenceModel || modelConfig.sentence_model,
              word_model: modelConfig.wordModel || modelConfig.word_model,
            };
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Analysis failed');
      }
      const data = await res.json();
      setAnalysis(data);
      setAnalysisError(null);
    } catch (err) {
      setAnalysisError(err.message);
      showToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-group">
          <div className="brand-icon">
            <BrainCircuit size={26} />
          </div>
          <div>
            <h1 className="brand-title">Text2Quiz</h1>
            <p className="brand-tagline">
              CEFR Level Linguistic Analyzer & Automated Quiz Generator
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'analyze' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyze')}
          >
            <BookOpen size={16} /> Analyze & Quiz
          </button>
          <button
            className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            <GitCompare size={16} /> Model Comparison
          </button>
          <button
            className={`tab-btn ${activeTab === 'visualize' ? 'active' : ''}`}
            onClick={() => setActiveTab('visualize')}
          >
            <BarChart3 size={16} /> Data Visualization
          </button>
        </nav>
      </header>

      {/* Main Tab Content */}
      <main>
        {activeTab === 'analyze' && (
          <AnalyzeTab
            onAnalyze={handleAnalyze}
            analysis={analysis}
            loading={loading}
            bestModel={bestModel}
            availableModels={availableModels}
            analysisError={analysisError}
            onClearError={() => setAnalysisError(null)}
          />
        )}

        {activeTab === 'compare' && <CompareTab />}

        {activeTab === 'visualize' && <VisualizeTab />}
      </main>

      {/* Global Toast Notification */}
      {globalToast && (
        <div className="global-toast-error">
          <AlertCircle size={18} className="flex-shrink-0 text-red-400" />
          <span className="toast-message">{globalToast}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setGlobalToast(null)}
            title="ปิดการแจ้งเตือน"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

