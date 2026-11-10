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
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('analyze');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [bestModel, setBestModel] = useState(null);
  const [availableModels, setAvailableModels] = useState(null);

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

  const handleAnalyze = async (text, model = 'auto') => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Analysis failed');
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      alert('Error during analysis: ' + err.message);
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
          />
        )}

        {activeTab === 'compare' && <CompareTab />}

        {activeTab === 'visualize' && <VisualizeTab analysis={analysis} />}
      </main>
    </div>
  );
}

