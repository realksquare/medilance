import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate('/');
  };

  const toggleMenu = () => setIsOpen(!isOpen);

  const navLinkStyle = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px' };

  return (
    <nav className="nav">
      <div className="container">
        <div className="nav-content">
          <div className="nav-left">
            <Link to="/" className="logo">MEDILANCE</Link>
            <div className="nav-links desktop-links">
              <Link to="/" className="nav-link" style={{ ...navLinkStyle, color: location.pathname === '/' ? 'var(--primary)' : 'var(--text)' }}>HOME</Link>
              <Link to="/create" className="nav-link" style={{ ...navLinkStyle, color: location.pathname === '/create' ? 'var(--primary)' : 'var(--text)' }}>ISSUE</Link>
              <Link to="/bulk" className="nav-link" style={{ ...navLinkStyle, color: location.pathname === '/bulk' ? 'var(--primary)' : 'var(--text)' }}>BULK</Link>
              <Link to="/verify" className="nav-link" style={{ ...navLinkStyle, color: location.pathname === '/verify' ? 'var(--primary)' : 'var(--text)' }}>VERIFY</Link>
              {user && ['verifier', 'dual'].includes(user.role) && (
                <Link to="/anomalies" className="nav-link" style={{ ...navLinkStyle, color: location.pathname === '/anomalies' ? 'var(--primary)' : 'var(--text)' }}>ANOMALIES</Link>
              )}
            </div>
          </div>

          <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setIsDark(!isDark)}
              className="nav-mode-label"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', cursor: 'pointer', padding: '10px' }}
            >
              {isDark ? 'LANCE MODE: ON' : 'LANCE MODE: OFF'}
            </button>

            {user ? (
              /* Logged-in state */
              <>
                <Link to={user.isMasterAdmin ? "/admin" : "/profile"} className="nav-link nav-username" style={navLinkStyle}>
                  {user.username.toUpperCase()}
                </Link>
                <button
                  onClick={handleLogout}
                  className="nav-logout-btn"
                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', cursor: 'pointer', padding: '6px 10px', borderRadius: '4px' }}
                >
                  LOGOUT
                </button>
              </>
            ) : (
              /* Guest state - hidden on mobile, shown in mobile menu instead */
              <span className="desktop-links">
                <Link to="/login" className="nav-link" style={navLinkStyle}>USER LOGIN</Link>
                <Link to="/admin" className="nav-link" style={{ ...navLinkStyle, opacity: 0.55 }}>MASTER LOGIN</Link>
              </span>
            )}

            <button className="mobile-toggle" onClick={toggleMenu} style={{ background: 'none', border: 'none', color: 'var(--text)', padding: '10px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' }}>
              {isOpen ? 'CLOSE' : 'MENU'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="mobile-menu" style={{
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: '72px', left: 0, right: 0, bottom: 0,
          background: 'var(--bg)', padding: '3rem 1.5rem', gap: '2rem', zIndex: 2000,
        }}>
          <Link to="/" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, color: location.pathname === '/' ? 'var(--primary)' : 'var(--text)' }}>HOME</Link>
          <Link to="/create" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, color: location.pathname === '/create' ? 'var(--primary)' : 'var(--text)' }}>ISSUE RECORD</Link>
          <Link to="/bulk" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, color: location.pathname === '/bulk' ? 'var(--primary)' : 'var(--text)' }}>BATCH PROCESSING</Link>
          <Link to="/verify" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, color: location.pathname === '/verify' ? 'var(--primary)' : 'var(--text)' }}>VERIFY RECORD</Link>
          {user && ['verifier', 'dual'].includes(user.role) && (
            <Link to="/anomalies" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, color: location.pathname === '/anomalies' ? 'var(--primary)' : 'var(--text)' }}>ANOMALIES MANAGER</Link>
          )}

          {user ? (
            <>
              <Link to={user.isMasterAdmin ? "/admin" : "/profile"} onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {user.isMasterAdmin ? `MASTER ADMIN (${user.username})` : `MY IDENTITY (${user.username})`}
              </Link>
              <button onClick={handleLogout} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, background: 'none', border: 'none', color: '#ef4444', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                LOGOUT
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700 }}>USER LOGIN</Link>
              <Link to="/admin" onClick={toggleMenu} className="nav-link" style={{ fontSize: '1.25rem', fontWeight: 700, opacity: 0.55 }}>MASTER LOGIN</Link>
            </>
          )}

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
            <button
              onClick={() => { setIsDark(!isDark); toggleMenu(); }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', fontWeight: 900, letterSpacing: '1px' }}
            >
              TOGGLE LANCE MODE
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
