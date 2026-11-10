import React, { useState } from 'react';

// สีมาตรฐาน CEFR ตามรูปภาพอ้างอิงของผู้ใช้
export const CEFR_COLORS = {
  A1: { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1', light: '#F8FAFC' },
  A2: { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', light: '#F0FDF4' },
  B1: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', light: '#EFF6FF' },
  B2: { bg: '#F3E8FF', text: '#7E22CE', border: '#D8B4FE', light: '#FAF5FF' },
  C1: { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D', light: '#FFFBEB' },
  C2: { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5', light: '#FEF2F2' },
};

export const CEFR_HEX = {
  A1: '#64748B',
  A2: '#16A34A',
  B1: '#2563EB',
  B2: '#9333EA',
  C1: '#D97706',
  C2: '#DC2626',
};

export function getLevelColor(lvl) {
  if (!lvl) return { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' };
  const base = lvl.substring(0, 2).toUpperCase();
  return CEFR_COLORS[base] || { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' };
}

export function LevelBadge({ level, score, label, size = 'md' }) {
  const display = label || (score ? `${level}.${Math.floor((score % 1) * 10)}` : level);
  const colors = getLevelColor(level);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 font-semibold rounded',
    md: 'text-sm px-2.5 py-1 font-bold rounded-md',
    lg: 'text-2xl px-4 py-2 font-extrabold rounded-lg tracking-tight',
  }[size] || 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center justify-center border transition-all ${sizeClasses}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {display}
    </span>
  );
}

export function LevelProgressBar({ title, level, score }) {
  const base = level ? level.substring(0, 2) : 'A1';
  const colors = getLevelColor(base);
  const val = score || 1.0;
  // ค่า 1.0 = A1 (0%), 6.0 = C2 (100%)
  const percent = Math.min(100, Math.max(5, ((val - 1.0) / 5.0) * 100));

  return (
    <div className="breakdown-item">
      <div className="breakdown-header">
        <span className="breakdown-title">{title}</span>
        <span className="breakdown-val" style={{ color: colors.text }}>
          {level}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${percent}%`,
            backgroundColor: CEFR_HEX[base] || '#4F46E5',
          }}
        />
      </div>
    </div>
  );
}

export function Card({ title, badge, icon, children, className = '' }) {
  return (
    <div className={`app-card ${className}`}>
      {(title || badge) && (
        <div className="card-header">
          <div className="card-title-group">
            {icon && <span className="card-icon">{icon}</span>}
            {title && <h3 className="card-title">{title}</h3>}
          </div>
          {badge && <div className="card-badge">{badge}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Tooltip({ children, content }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && (
        <span className="tooltip-box">
          {content}
        </span>
      )}
    </span>
  );
}

