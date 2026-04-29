import React, { useState, useEffect } from 'react';
import { User, Shield, Activity, Clock, Mail, CheckCircle2, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_BASE from '../config';

export default function Profile() {
  // AuthContext is the single source of truth for who is logged in
  const { user: authUser, login } = useAuth();
  const username = authUser?.username || '';

  const [profile, setProfile] = useState(() => {
    // Seed immediately from authUser so the page is never blank on first login.
    // fetchProfile() will overwrite this with full server data once it resolves.
    if (authUser?.username) {
      return {
        username: authUser.username,
        fullName: authUser.fullName || '',
        emailVerified: authUser.emailVerified || false,
        role: authUser.role || '',
        type: authUser.type || '',
        institution: authUser.institution || '',
      };
    }
    return null;
  });
  const [history, setHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    username: username,
    fullName: '',
    role: 'issuer',
    type: 'individual',
    institution: '',
    email: ''
  });

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username]);

  const fetchProfile = async (currentUsername) => {
    const uname = currentUsername || username;
    if (!uname || uname === 'undefined' || uname === ':username') return;
    try {
      const res = await fetch(`${API_BASE}/api/users/${uname}`);
      if (!res.ok) return; // 404 = Local Mode or new user, keep cached profile
      const data = await res.json();
      localStorage.setItem('profile', JSON.stringify(data.user));
      setProfile(data.user);
      setHistory(data.history || []);
      setFormData({
        username: data.user.username,
        fullName: data.user.fullName,
        role: data.user.role,
        type: data.user.type,
        institution: data.user.institution || '',
        email: data.user.email
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/users/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        // Sync AuthContext so Navbar + profile stay in sync
        login({ username: formData.username, fullName: formData.fullName, emailVerified: false });
        setProfile(data.user);
        setHistory([]);
        setIsEditing(false);
      } else {
        alert(data.error || 'Setup failed');
      }
    } catch (err) {
      alert('Setup failed. Is the server running?');
    }
  };

  const sendOtp = async () => {
    setVerifying(true);
    try {
      // Auto-sync: ensure profile exists in server DB before sending OTP.
      // This handles the case where the server restarted and lost its local state,
      // while the browser still has the profile cached in localStorage.
      const cachedProfile = profile || JSON.parse(localStorage.getItem('profile') || '{}');
      if (cachedProfile.username) {
        await fetch(`${API_BASE}/api/users/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cachedProfile.username,
            fullName: cachedProfile.fullName,
            role: cachedProfile.role,
            type: cachedProfile.type,
            institution: cachedProfile.institution || '',
            email: cachedProfile.email
          })
        });
      }

      const res = await fetch(`${API_BASE}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        setShowOtpModal(true);
        setError('');
      } else {
        const data = await res.json();
        alert(data.error || "Failed to send email. Ensure .env is configured.");
      }
    } catch (err) {
      alert("Backend connection failed");
    } finally {
      setVerifying(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, otp })
      });
      const data = await res.json();
      if (res.ok) {
        setShowOtpModal(false);
        fetchProfile();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  if (isEditing) {
    return (
      <div className="max-w-xl mx-auto space-y-8">
        {!profile && (
          <header>
            <h1>MediLance Identity</h1>
            <p style={{ color: 'var(--text-muted)' }}>Establish your cryptographic presence on the network.</p>
          </header>
        )}
        
        {profile && (
           <div onClick={() => setIsEditing(false)} className="nav-link flex items-center gap-2 cursor-pointer" style={{ width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>
            <ArrowLeft size={14} /> Back to Profile
          </div>
        )}

        <div className="card">
          <h2 className="mb-8">Setup Identity</h2>
          <form onSubmit={handleSetup} className="space-y-6">
            <div className="form-group">
              <div className="form-full">
                <label>Institution / Clinic Name</label>
                <input
                  value={formData.institution}
                  onChange={(e) => setFormData({...formData, institution: e.target.value})}
                  placeholder="City General Hospital, Apollo Clinic..."
                />
              </div>
              <div className="form-full">
                <label>Full Name</label>
                <input
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  placeholder="Dr. Jane Doe / City Hospital" required
                />
              </div>
              <div>
                <label>Username</label>
                <input 
                  value={formData.username} 
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  placeholder="jane_doe" required
                  disabled={!!profile}
                />
              </div>
              <div>
                <label>Email Address</label>
                <input 
                  type="email"
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="jane@hospital.com" required
                />
              </div>
              <div>
                <label>Role</label>
                <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                  <option value="issuer">Issuer (Provider)</option>
                  <option value="verifier">Verifier (Insurer)</option>
                  <option value="both">Dual-Role</option>
                </select>
              </div>
              <div>
                <label>Account Type</label>
                <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                  <option value="individual">Individual</option>
                  <option value="organization">Organization</option>
                </select>
              </div>
            </div>
            <button className="btn w-full py-4 mt-4">Initialize Profile</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link to="/" className="nav-link flex items-center gap-2" style={{ width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>
      
      <div className="card flex items-start gap-8">
        <div className="p-6 bg-primary/5 border border-primary/10 rounded-full text-primary">
          <User size={48} />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <div>
              <h1>{profile?.fullName}</h1>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                @{profile?.username} • <span className="capitalize">{profile?.role}</span>
              </p>
            </div>
            <button onClick={() => setIsEditing(true)} className="btn btn-outline p-2 text-[10px] tracking-widest uppercase font-bold">Edit Identity</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', width: '100%', marginTop: '2.5rem' }}>
            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', padding: '1.5rem' }}>
              <h3>Joined</h3>
              <p className="font-bold text-lg">{profile?.doj ? new Date(profile.doj).toLocaleDateString() : 'N/A'}</p>
            </div>
            
            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', padding: '1.5rem' }}>
              <h3>Email Status</h3>
              <div className="flex flex-col gap-3">
                {profile?.emailVerified ? (
                  <p className="font-bold text-sm text-green-500 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Verified
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <p className="font-bold text-sm text-red-500 m-0">Unverified</p>
                    <button onClick={sendOtp} disabled={verifying} className="btn btn-outline py-2 px-4 text-[10px] font-bold uppercase tracking-widest w-full">
                      {verifying ? 'Sending...' : 'Verify Identity'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', padding: '1.5rem' }}>
              <h3>Entity</h3>
              <div>
                {profile?.institution && (
                  <p className="font-bold text-lg m-0" style={{ marginBottom: '0.15rem' }}>{profile.institution}</p>
                )}
                <p className="capitalize m-0" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{profile?.type}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h3>Recent Activity</h3>
          <div className="space-y-4">
            {history.length > 0 ? history.map((action, i) => {
              const actionLabels = {
                issued: 'Basic Issuance',
                mint_issued: 'Mint Issuance',
                verified: 'Verification',
                bulk_issued: 'Bulk Issuance',
              };
              const label = actionLabels[action.actionType] || action.actionType;
              const isSuccess = action.status === 'success';
              return (
                <div key={i} className="card p-4 flex items-center justify-between text-sm" style={{ gap: '1rem' }}>
                  <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
                    <div style={{
                      padding: '0.5rem',
                      borderRadius: '6px',
                      background: isSuccess ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: isSuccess ? '#22c55e' : '#ef4444',
                      flexShrink: 0,
                    }}>
                      {action.actionType === 'verified' ? <Shield size={16} /> : <Activity size={16} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                        {label}{action.details?.patientName ? ` — ${action.details.patientName}` : ''}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                        <Clock size={11} /> {new Date(action.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: isSuccess ? '#22c55e' : '#ef4444',
                    }}>
                      {isSuccess ? 'Success' : 'Failed'}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-muted)', opacity: 0.55 }}>
                      {(action.details?.dataHash || action.details?.fileHash || '').substring(0, 10) || '—'}
                    </span>
                  </div>
                </div>
              );
            }) : (
              <div style={{ padding: '2rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No network activity detected.</p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <h3>Security Profile</h3>
          <div className="card space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-gray-400" />
                <span className="text-sm font-medium">Biometric / 2FA</span>
              </div>
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Roadmap</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-gray-400" />
                <span className="text-sm font-medium">Protocol Anchor</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Active</span>
              </div>
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-primary leading-relaxed font-medium">
                Identity anchored via SHA-256. All interactions are immutable and logged for real-time fraud monitoring.
              </p>
            </div>
          </div>
        </section>
      </div>

      {showOtpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="card max-w-sm w-full space-y-6">
            <header className="text-center">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={24} />
              </div>
              <h2 className="text-lg">Verify Email</h2>
              <p className="text-xs text-gray-400 mt-2">Enter the 6-digit code sent to your email.</p>
            </header>

            <form onSubmit={verifyOtp} className="space-y-4">
              <input 
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                className="text-center text-2xl tracking-[10px] font-black py-4"
                maxLength={6}
                required
              />
              {error && <p className="text-[10px] text-red-500 text-center font-bold">{error}</p>}
              <button className="btn w-full py-4 flex items-center justify-center gap-2" disabled={verifying}>
                {verifying && <Loader2 className="animate-spin" size={16} />}
                {verifying ? 'Verifying...' : 'Confirm Code'}
              </button>
            </form>
            
            <button onClick={() => setShowOtpModal(false)} className="text-[10px] uppercase font-black text-gray-400 w-full text-center hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
