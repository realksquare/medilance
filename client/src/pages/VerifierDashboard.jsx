import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Check, X, Flag, RefreshCw, ChevronRight,
  AlertTriangle, Clock, User, FileText, Stethoscope, Calendar,
  Building2, Hash, ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FraudPanel from '../components/FraudPanel';

const API = 'http://localhost:3005/api/verifier';

const SCORE_STYLE = (score) => {
  if (score < 55) return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', label: 'Critical' };
  if (score < 75) return { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', label: 'High Risk' };
  return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'Moderate' };
};

const ACTION_CONFIG = {
  accepted: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', label: 'Accept Claim' },
  flagged:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'Flag for Review' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'Reject Claim' },
};

function ScoreBadge({ score }) {
  const s = SCORE_STYLE(score);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 48, height: 48, borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0,
    }}>
      <span style={{ fontSize: '1rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: '0.45rem', fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', margin: 0, marginTop: '0.15rem' }}>{value}</p>
    </div>
  );
}

export default function VerifierDashboard() {
  const { user } = useAuth();

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [selected, setSelected] = useState(null);

  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState({ type: '', text: '' });

  const [filter, setFilter] = useState('all');

  const fetchQueue = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setSelected(null);
    setAction(null);
    setReason('');
    setSubmitMsg({ type: '', text: '' });
    setQueueError('');
    try {
      const res = await fetch(`${API}/queue`, {
        headers: { 'x-username': user.username },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setQueue(data.queue || []);
    } catch (err) {
      setQueue([]);
      setQueueError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const selectRecord = (rec) => {
    setSelected(rec);
    setAction(null);
    setReason('');
    setSubmitMsg({ type: '', text: '' });
  };

  const submitDecision = async () => {
    if (!action || !selected) return;
    if ((action === 'flagged' || action === 'rejected') && !reason.trim()) {
      setSubmitMsg({ type: 'error', text: 'A reason is required for flagging or rejecting a claim.' });
      return;
    }
    setSubmitting(true);
    setSubmitMsg({ type: '', text: '' });
    try {
      const res = await fetch(`${API}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-username': user.username },
        body: JSON.stringify({ recordId: String(selected._id), action, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Decision failed.');
      setSubmitMsg({ type: 'success', text: `Record marked as "${action}". Removing from queue.` });
      setTimeout(() => {
        setQueue(prev => prev.filter(r => String(r._id) !== String(selected._id)));
        setSelected(null);
        setAction(null);
        setReason('');
        setSubmitMsg({ type: '', text: '' });
      }, 1200);
    } catch (err) {
      setSubmitMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Role guard
  if (!user) {
    return (
      <div style={{ maxWidth: 500, margin: '4rem auto', textAlign: 'center', padding: '2rem' }}>
        <ShieldAlert size={40} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Login Required</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>You must be logged in with a verifier account to access this dashboard.</p>
        <Link to="/login" className="btn" style={{ display: 'inline-flex', marginTop: '1.5rem', textDecoration: 'none' }}>Go to Login</Link>
      </div>
    );
  }

  if (!['verifier', 'dual'].includes(user.role)) {
    return (
      <div style={{ maxWidth: 500, margin: '4rem auto', textAlign: 'center', padding: '2rem' }}>
        <ShieldAlert size={40} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Your account role is <strong>{user.role}</strong>. Only verifier or dual-role accounts can access the Anomalies Manager.
        </p>
        <Link to="/" className="btn btn-outline" style={{ display: 'inline-flex', marginTop: '1.5rem', textDecoration: 'none' }}>Back to Home</Link>
      </div>
    );
  }

  const filtered = filter === 'all' ? queue
    : filter === 'critical' ? queue.filter(r => r.integrityScore < 55)
    : filter === 'high'     ? queue.filter(r => r.integrityScore >= 55 && r.integrityScore < 75)
    : queue.filter(r => r.integrityScore >= 75);

  const critCount = queue.filter(r => r.integrityScore < 55).length;
  const highCount = queue.filter(r => r.integrityScore >= 55 && r.integrityScore < 75).length;
  const modCount  = queue.filter(r => r.integrityScore >= 75).length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <Link to="/" className="nav-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          <ArrowLeft size={12} /> Home
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--primary)', textTransform: 'uppercase' }}>Anomalies Manager</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.2rem' }}>Claims Risk Queue</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Logged in as <strong>{user.username}</strong> - {user.fullName || user.institution || 'Agent'}
            </p>
          </div>
          <button
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}
            onClick={fetchQueue}
            disabled={loading}
          >
            <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            {loading ? 'Loading...' : 'Refresh Queue'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'In Queue', value: queue.length, color: 'var(--primary)' },
          { label: 'Critical', value: critCount, color: '#ef4444' },
          { label: 'High Risk', value: highCount, color: '#f97316' },
          { label: 'Moderate', value: modCount, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: '1.7rem', fontWeight: 900, color: s.color, margin: 0, marginTop: '0.15rem' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {[
          { id: 'all', label: `All (${queue.length})` },
          { id: 'critical', label: `Critical (${critCount})` },
          { id: 'high', label: `High Risk (${highCount})` },
          { id: 'moderate', label: `Moderate (${modCount})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => { setFilter(tab.id); setSelected(null); }}
            style={{
              padding: '0.5rem 0.9rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: filter === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: filter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main split layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>

        {/* LEFT: Queue list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Scoring records...
            </div>
          )}

          {!loading && queueError && (
            <div style={{ padding: '1rem 1.25rem', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Error loading queue: {queueError}
            </div>
          )}

          {!loading && !queueError && filtered.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 10 }}>
              <ShieldAlert size={28} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No records in this risk category.</p>
            </div>
          )}

          {!loading && filtered.map((rec) => {
            const s = SCORE_STYLE(rec.integrityScore);
            const isActive = selected && String(selected._id) === String(rec._id);
            return (
              <button
                key={String(rec._id)}
                onClick={() => selectRecord(rec)}
                style={{
                  width: '100%', textAlign: 'left', background: isActive ? 'rgba(37,99,235,0.06)' : 'var(--surface)',
                  border: `1px solid ${isActive ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '0.875rem 1rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'border-color 0.15s',
                }}
              >
                <ScoreBadge score={rec.integrityScore} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.88rem', margin: 0, color: 'var(--text)' }}>{rec.patientName}</p>
                    <span style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.1rem 0.4rem', borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                      {s.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.15rem' }}>
                    {rec.recordType} - {rec.issuerInstitution}
                  </p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.1rem' }}>
                    {rec.flags.length} flag{rec.flags.length !== 1 ? 's' : ''} detected
                  </p>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>

        {/* RIGHT: Detail + Action pane */}
        {selected && (() => {
          const s = SCORE_STYLE(selected.integrityScore);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Record header card */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{selected.integrityScore}</span>
                    <span style={{ fontSize: '0.48rem', fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>score</span>
                  </div>
                  <div>
                    <p style={{ fontWeight: 900, fontSize: '1.05rem', margin: 0 }}>{selected.patientName}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.15rem' }}>
                      {selected.grade}-grade - {s.label} - {selected.flags.length} fraud signal{selected.flags.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem 1.5rem' }}>
                  <DetailRow label="Register Number" value={selected.registerNumber} />
                  <DetailRow label="Date of Birth" value={selected.dob} />
                  <DetailRow label="Gender" value={selected.gender} />
                  <DetailRow label="Blood Group" value={selected.bloodGroup} />
                  <DetailRow label="Record Type" value={selected.recordType} />
                  <DetailRow label="Consulting Doctor" value={selected.doctorName} />
                  <DetailRow label="Issue Date" value={selected.issueDate} />
                  <DetailRow label="Issuer" value={selected.issuerInstitution} />
                  {selected.medCosts && (
                    <DetailRow label="Medical Costs" value={`Rs. ${Number(selected.medCosts).toLocaleString('en-IN')}`} />
                  )}
                  {selected.diagnosis && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <DetailRow label="Diagnosis" value={selected.diagnosis} />
                    </div>
                  )}
                  {selected.dataHash && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Record Hash</p>
                      <p style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--primary)', margin: 0, marginTop: '0.15rem', wordBreak: 'break-all' }}>{selected.dataHash}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Fraud Intelligence Panel - reused as-is */}
              <FraudPanel fraud={{ score: selected.integrityScore, grade: selected.grade, flags: selected.flags }} />

              {/* Action panel */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '1rem' }}>Agent Decision</p>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  {Object.entries(ACTION_CONFIG).map(([key, cfg]) => {
                    const icons = {
                      accepted: <Check size={14} />,
                      flagged:  <Flag size={14} />,
                      rejected: <X size={14} />,
                    };
                    return (
                      <button
                        key={key}
                        onClick={() => setAction(key)}
                        style={{
                          flex: 1, minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                          padding: '0.65rem 0.75rem', borderRadius: 7, fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
                          border: `1px solid ${action === key ? cfg.color : 'var(--border)'}`,
                          background: action === key ? cfg.bg : 'transparent',
                          color: action === key ? cfg.color : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {icons[key]} {cfg.label}
                      </button>
                    );
                  })}
                </div>

                {/* Reason textarea - shown for all; required for flag/reject */}
                {action && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                      {action === 'accepted' ? 'Notes (optional)' : 'Reason (required)'}
                    </label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder={
                        action === 'accepted' ? 'Add notes for record-keeping...'
                        : action === 'flagged' ? 'Describe what documentation is needed...'
                        : 'Explain the basis for rejection...'
                      }
                      rows={3}
                      style={{
                        width: '100%', resize: 'vertical', padding: '0.65rem 0.875rem',
                        borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Status message */}
                {submitMsg.text && (
                  <div style={{
                    padding: '0.65rem 0.875rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.82rem', fontWeight: 600,
                    background: submitMsg.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                    border: `1px solid ${submitMsg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                    color: submitMsg.type === 'error' ? '#ef4444' : '#22c55e',
                  }}>
                    {submitMsg.text}
                  </div>
                )}

                <button
                  className="btn"
                  style={{ width: '100%', opacity: (!action || submitting) ? 0.5 : 1 }}
                  disabled={!action || submitting}
                  onClick={submitDecision}
                >
                  {submitting ? 'Submitting...' : action ? `Confirm - ${ACTION_CONFIG[action].label}` : 'Select an action above'}
                </button>
              </div>

            </div>
          );
        })()}
      </div>
    </div>
  );
}
