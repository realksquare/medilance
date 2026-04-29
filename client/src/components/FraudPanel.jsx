import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Info, Zap } from 'lucide-react';

const GRADE_CONFIG = {
  A: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', label: 'Trusted' },
  B: { color: '#84cc16', bg: 'rgba(132,204,22,0.08)', border: 'rgba(132,204,22,0.2)', label: 'Low Risk' },
  C: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Moderate Risk' },
  D: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'High Risk' },
};

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', Icon: ShieldX },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', Icon: ShieldAlert },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', Icon: AlertTriangle },
  low:      { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', Icon: Info },
};

function ScoreRing({ score, grade }) {
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG.D;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke={cfg.color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: cfg.color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, color: cfg.color, letterSpacing: '0.06em' }}>{grade}</span>
        </div>
      </div>
      <div>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Integrity Index</p>
        <p style={{ fontSize: '1rem', fontWeight: 800, color: cfg.color }}>{cfg.label}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          {score}/100 · Grade {grade}
        </p>
      </div>
    </div>
  );
}

export default function FraudPanel({ fraud }) {
  if (!fraud) return null;
  const { score, grade, flags } = fraud;
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG.D;
  const hasFlags = flags && flags.length > 0;

  return (
    <div style={{
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      background: cfg.bg,
      overflow: 'hidden',
      marginTop: '1.25rem',
    }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: hasFlags ? `1px solid ${cfg.border}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <ScoreRing score={score} grade={grade} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Zap size={13} color={cfg.color} />
          <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: cfg.color }}>
            Phase 2 · Fraud Intelligence
          </span>
        </div>
      </div>

      {/* Flags */}
      {hasFlags && (
        <div style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {flags.map((flag, i) => {
            const sev = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.low;
            const { Icon } = sev;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.65rem 0.875rem', borderRadius: 7,
                background: sev.bg, border: `1px solid ${sev.border}`,
              }}>
                <Icon size={15} color={sev.color} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: sev.color, marginBottom: '0.2rem' }}>
                    {flag.type.replace(/_/g, ' ')}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.5 }}>
                    {flag.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!hasFlags && (
        <div style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={15} color="#22c55e" />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No fraud signals detected. All checks passed.</p>
        </div>
      )}
    </div>
  );
}
