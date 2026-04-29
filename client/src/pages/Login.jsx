import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3005/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const isError = status.includes('found') || status.includes('Cannot') || status.includes('password') || status.includes('Incorrect');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim()) return setStatus('Username is required.');
    setLoading(true);
    setStatus('');

    try {
      const headers = { 'x-password': form.password || '' };
      const res = await fetch(`${API}/users/${form.username.trim()}`, { headers });
      if (res.status === 401) {
        setStatus('Incorrect password.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setStatus('No account found with that username. Contact your administrator to get access.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      login(data.user);
      navigate('/profile');
    } catch {
      setStatus('Cannot reach server. Is it running on port 3005?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary)', textTransform: 'uppercase' }}>
            MediLance Protocol
          </span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.5rem', marginBottom: '0' }}>
            Welcome back.
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Enter your credentials to access your identity.
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                type="text"
                placeholder="e.g. dr_smith"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                placeholder="Your account password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
            </div>

            {status && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: '6px',
                background: isError ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: isError ? '#ef4444' : '#22c55e',
                fontSize: '0.82rem', fontWeight: 600,
              }}>
                {status}
              </div>
            )}

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: '0.25rem' }}>
              {loading ? 'Checking...' : 'Access Identity →'}
            </button>
          </form>
        </div>

        {/* Demo hint */}
        <div style={{
          marginTop: '1.5rem', padding: '1rem', borderRadius: '6px',
          background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)',
          fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center',
        }}>
          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>DEMO MODE</span> — Use username{' '}
          <button
            onClick={() => setForm({ username: 'jury', password: '' })}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
          >
            jury
          </button>{' '}
          (no password required for legacy accounts).
        </div>
      </div>
    </div>
  );
}
