import React from 'react';
import { Link } from 'react-router-dom';

export default function AuthGate() {
  return (
    <div style={{
      minHeight: '75vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem',
    }}>
      {/* Icon */}
      <div style={{
        width: '72px', height: '72px', borderRadius: '50%',
        background: 'rgba(37,99,235,0.08)',
        border: '1px solid rgba(37,99,235,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem', marginBottom: '2rem',
      }}>
        🔐
      </div>

      <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary)', textTransform: 'uppercase' }}>
        Restricted Area
      </span>

      <h1 style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.75rem', marginBottom: '0' }}>
        Identity requires<br />authentication.
      </h1>

      <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.95rem', maxWidth: '400px', lineHeight: 1.7 }}>
        Your MediLance identity stores your verification status, issued records, and audit trail. 
        Log in or create an account to access it.
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/login" className="btn" style={{ textDecoration: 'none', minWidth: '160px' }}>
          Log In →
        </Link>
        <Link to="/register" className="btn btn-outline" style={{ textDecoration: 'none', minWidth: '160px' }}>
          Create Account
        </Link>
      </div>

      {/* Demo hint */}
      <div style={{
        marginTop: '2rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '6px',
        background: 'rgba(37,99,235,0.05)',
        border: '1px solid rgba(37,99,235,0.12)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}>
        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>DEMO</span>
        {' '}— Log in as <strong style={{ color: 'var(--text)' }}>demo_admin</strong> for a pre-verified account.
      </div>
    </div>
  );
}
