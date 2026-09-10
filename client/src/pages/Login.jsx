import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import API_BASE from '../config';

const API = `${API_BASE}/api`;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const isError = status.includes('found') || status.includes('Cannot') || status.includes('password') || status.includes('Incorrect') || status.includes('Invalid') || status.includes('required');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim()) return setStatus('Username is required.');
    setLoading(true);
    setStatus('');

    try {
      const res = await fetch(`${API}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Invalid username or password.');
        setLoading(false);
        return;
      }

      login(data.user, data.token);
      navigate('/profile');
    } catch {
      setStatus('Cannot reach server. Please ensure server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary)', textTransform: 'uppercase' }}>
            MediLance Protocol
          </span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.5rem', marginBottom: '0' }}>
            Welcome back.
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Enter your credentials to access your verified identity.
          </p>
        </div>

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

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              {loading ? 'Authenticating...' : <><span>Access Identity</span><ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
