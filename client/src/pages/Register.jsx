import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3005/api';

const ROLES = ['Doctor', 'Nurse', 'Administrator', 'Researcher', 'Patient', 'Insurance Agent', 'Lab Technician'];
const TYPES = ['hospital', 'clinic', 'laboratory', 'insurance', 'individual'];

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', fullName: '', email: '', institution: '', role: '', type: 'hospital' });
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { username, fullName, email, role, type } = form;
    if (!username || !fullName || !email || !role) {
      setStatus({ type: 'error', msg: 'All fields are required.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus({ type: 'error', msg: 'Enter a valid email address.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', msg: '' });

    try {
      // Check if username already exists
      const check = await fetch(`${API}/users/${username}`);
      if (check.ok) {
        setStatus({ type: 'error', msg: 'Username already taken. Try a different one or log in.' });
        setLoading(false);
        return;
      }

      // Create profile
      const res = await fetch(`${API}/users/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, fullName, email, institution: form.institution, role, type }),
      });

      if (!res.ok) throw new Error('Registration failed');

      setStatus({ type: 'success', msg: 'Account created! Redirecting to your identity...' });
      login({ username, fullName, emailVerified: false });

      setTimeout(() => navigate('/profile'), 1200);
    } catch {
      setStatus({ type: 'error', msg: 'Cannot reach server. Is it running on port 3005?' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary)', textTransform: 'uppercase' }}>
            MediLance Protocol
          </span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.5rem', marginBottom: '0' }}>
            Create your identity.
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Register to issue records, generate QR tokens, and access batch processing.
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label htmlFor="reg-username">Username</label>
                <input
                  id="reg-username"
                  type="text"
                  placeholder="unique_handle"
                  value={form.username}
                  onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="reg-fullname">Full Name</label>
                <input
                  id="reg-fullname"
                  type="text"
                  placeholder="Dr. Jane Smith"
                  value={form.fullName}
                  onChange={e => set('fullName', e.target.value)}
                />
              </div>
            </div>

            {/* Row 2 */}
            <div>
              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                placeholder="you@institution.org"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>

            {/* Row 3: Institution */}
            <div>
              <label htmlFor="reg-institution">Institution / Clinic Name</label>
              <input
                id="reg-institution"
                type="text"
                placeholder="City General Hospital, Apollo Clinic..."
                value={form.institution}
                onChange={e => set('institution', e.target.value)}
              />
            </div>

            {/* Row 4 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label htmlFor="reg-role">Role</label>
                <select id="reg-role" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="">Select role...</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="reg-type">Institution Type</label>
                <select id="reg-type" value={form.type} onChange={e => set('type', e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            {status.msg && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                background: status.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: status.type === 'error' ? '#ef4444' : '#22c55e',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}>
                {status.msg}
              </div>
            )}

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: '0.25rem' }}>
              {loading ? 'Creating Account...' : 'Create Identity →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}
