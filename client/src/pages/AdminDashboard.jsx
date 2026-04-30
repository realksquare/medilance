import React, { useState, useEffect } from 'react';
import { Shield, Plus, Check, X, Trash2, LogOut, Users, ChevronDown, Pencil, Save, BarChart2, AlertTriangle, TrendingDown, FileText, Settings, Ghost, Calendar, ChevronsUp, Zap, CheckCircle2, Star, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import API_BASE from '../config';

const API = `${API_BASE}/api/admin`;

const SYSTEM_ROLES = [
  { value: 'issuer', label: 'Issuer - can issue and create records' },
  { value: 'verifier', label: 'Verifier - can verify records only' },
  { value: 'dual', label: 'Dual - can both issue and verify' },
];
const TYPES = ['hospital', 'clinic', 'laboratory', 'insurance', 'individual'];

function RoleBadge({ role }) {
  const colors = {
    issuer: { bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.25)', color: 'var(--primary)' },
    verifier: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)', color: '#8b5cf6' },
    dual: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', color: '#22c55e' },
  };
  const s = colors[role] || colors.issuer;
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.2rem 0.55rem', borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {role}
    </span>
  );
}

function StatusBadge({ verified, activationDate }) {
  const active = !!activationDate;
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '0.2rem 0.55rem', borderRadius: 99,
      background: active ? 'rgba(34,197,94,0.1)' : verified ? 'rgba(250,204,21,0.1)' : 'rgba(100,116,139,0.1)',
      color: active ? '#22c55e' : verified ? '#facc15' : 'var(--text-muted)',
      border: `1px solid ${active ? 'rgba(34,197,94,0.25)' : verified ? 'rgba(250,204,21,0.25)' : 'rgba(100,116,139,0.2)'}`,
    }}>
      {active ? 'Active' : verified ? 'Verified' : 'Pending'}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDashboard() {
  const { user, login, logout } = useAuth();
  const adminUser = user?.isMasterAdmin ? user : null;
  const phase = adminUser ? 'dash' : 'login';

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', fullName: '', role: 'issuer', type: 'hospital', institution: '', password: '' });
  const [createStatus, setCreateStatus] = useState({ type: '', msg: '' });
  const [actionMsg, setActionMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editStatus, setEditStatus] = useState('');

  // ── Phase 3: Analytics & Records & Settings ──
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'analytics' | 'records' | 'settings'
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [ghostData, setGhostData] = useState(null);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState(null);

  // ── Phase 4.1: Express Approval ──
  const [expressData, setExpressData] = useState(null);
  const [expressLoading, setExpressLoading] = useState(false);
  const [expandedExpress, setExpandedExpress] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [expandedRecord, setExpandedRecord] = useState(null);

  const [settingsForm, setSettingsForm] = useState({ fullName: '', institution: '' });
  const [settingsStatus, setSettingsStatus] = useState({ type: '', msg: '' });

  const toast = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const fetchUsers = async (uname) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API}/users`, { headers: { 'x-admin-user': uname } });
      const data = await res.json();
      setUsers(data.users || []);
    } catch { setUsers([]); }
    finally { setLoadingUsers(false); }
  };

  const fetchAnalytics = async (uname) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/provider-risk`, {
        headers: { 'x-admin-user': uname },
      });
      const data = await res.json();
      setAnalytics(data);
    } catch { setAnalytics(null); }
    finally { setAnalyticsLoading(false); }
  };

  const fetchRecords = async (uname) => {
    setLoadingRecords(true);
    try {
      const res = await fetch(`${API}/records`, { headers: { 'x-admin-user': uname } });
      const data = await res.json();
      setRecords(data.records || []);
    } catch { setRecords([]); }
    finally { setLoadingRecords(false); }
  };

  const fetchGhost = async (uname) => {
    setGhostLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/ghost-procedures`, {
        headers: { 'x-admin-user': uname },
      });
      const data = await res.json();
      setGhostData(data);
    } catch { setGhostData(null); }
    finally { setGhostLoading(false); }
  };

  const fetchExpress = async (uname) => {
    setExpressLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/express-approval`, {
        headers: { 'x-admin-user': uname },
      });
      const data = await res.json();
      setExpressData(data);
    } catch { setExpressData(null); }
    finally { setExpressLoading(false); }
  };

  const copyHash = (hash, id) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(id);
      setTimeout(() => setCopiedHash(null), 2000);
    });
  };

  useEffect(() => {
    if (adminUser) {
      fetchUsers(adminUser.username);
      fetchAnalytics(adminUser.username);
      fetchRecords(adminUser.username);
      fetchGhost(adminUser.username);
      fetchExpress(adminUser.username);
      setSettingsForm({ fullName: adminUser.fullName || '', institution: adminUser.institution || '' });
    }
  }, [adminUser?.username]);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const deleteRecords = async () => {
    if (!selectedRecords.size) return;
    try {
      const ids = Array.from(selectedRecords);
      await fetch(`${API}/records/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-user': adminUser.username },
        body: JSON.stringify({ ids }),
      });
      toast(`${selectedRecords.size} records deleted.`);
      setSelectedRecords(new Set());
      setExpandedRecord(null);
      setShowConfirmDelete(false);
      fetchRecords(adminUser.username);
    } catch { toast('Error deleting records.'); }
  };

  const updateSettings = async (e) => {
    e.preventDefault();
    setSettingsStatus({ type: '', msg: '' });
    try {
      const res = await fetch(`${API}/update-master`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-user': adminUser.username },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) { setSettingsStatus({ type: 'error', msg: data.error || 'Update failed' }); return; }
      setSettingsStatus({ type: 'success', msg: 'Settings updated successfully.' });
      login(data.user);
    } catch { setSettingsStatus({ type: 'error', msg: 'Server error.' }); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Login failed'); return; }
      login(data.user);
    } catch { setLoginError('Cannot reach server. Is it running on port 3005?'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateStatus({ type: '', msg: '' });
    const payload = { ...createForm, institution: createForm.institution || adminUser?.institution || '' };
    if (!payload.password || payload.password.length < 6) {
      setCreateStatus({ type: 'error', msg: 'Password must be at least 6 characters.' });
      return;
    }
    try {
      const res = await fetch(`${API}/create-user`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-user': adminUser.username },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setCreateStatus({ type: 'error', msg: data.error }); return; }
      setCreateStatus({ type: 'success', msg: `Account created. Username: ${createForm.username} - share the password you set with the user.` });
      setCreateForm({ username: '', fullName: '', role: 'issuer', type: 'hospital', institution: '', password: '' });
      fetchUsers(adminUser.username);
    } catch { setCreateStatus({ type: 'error', msg: 'Server error.' }); }
  };

  const startEdit = (u) => {
    setEditingId(u.username);
    setEditForm({ originalUsername: u.username, username: u.username, fullName: u.fullName, role: u.role, type: u.type, institution: u.institution || '', newPassword: '' });
    setEditStatus('');
  };

  const saveEdit = async () => {
    setEditStatus('');
    try {
      const res = await fetch(`${API}/update-user`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-user': adminUser.username },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditStatus(data.error || 'Update failed'); return; }
      setEditingId(null);
      toast('User updated successfully.');
      fetchUsers(adminUser.username);
    } catch { setEditStatus('Server error.'); }
  };

  const toggleVerify = async (username, current) => {
    try {
      await fetch(`${API}/verify-user`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-user': adminUser.username },
        body: JSON.stringify({ username, verified: !current }),
      });
      toast(`${username} ${!current ? 'marked as verified' : 'unverified'}.`);
      fetchUsers(adminUser.username);
    } catch { }
  };

  const deleteUser = async (username) => {
    if (!window.confirm(`Remove "${username}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/user/${username}`, { method: 'DELETE', headers: { 'x-admin-user': adminUser.username } });
      toast(`${username} removed.`);
      fetchUsers(adminUser.username);
    } catch { }
  };

  /* ── Login Screen ── */
  if (phase === 'login') {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1.5rem' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Shield size={22} color="var(--primary)" />
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary)', textTransform: 'uppercase' }}>MediLance Protocol</span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.4rem' }}>Master Admin Login</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>Institutional management portal. Contact the MediLance team to get access.</p>
          </div>
          <div className="card" style={{ padding: '2rem' }}>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="admin-username">Admin Username</label>
                <input id="admin-username" type="text" value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} placeholder="master_admin" autoFocus required />
              </div>
              <div>
                <label htmlFor="admin-password">Password</label>
                <input id="admin-password" type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••••" required />
              </div>
              {loginError && (
                <div style={{ padding: '0.7rem 1rem', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
                  {loginError}
                </div>
              )}
              <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.25rem' }}>Enter Dashboard →</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard ── */
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--primary)', textTransform: 'uppercase' }}>Master Administrator</span>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', marginTop: '0.2rem' }}>{adminUser?.institution || 'Admin Dashboard'}</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Logged in as {adminUser?.username}</p>
        </div>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }} onClick={() => { logout(); setUsers([]); setRecords([]); }}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      {/* Toast */}
      {actionMsg && (
        <div style={{ padding: '0.65rem 1rem', borderRadius: 7, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem' }}>
          {actionMsg}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0', overflowX: 'auto' }}>
        {[
          { id: 'users', label: 'User Management', icon: <Users size={14} /> },
          { id: 'analytics', label: 'Provider Analytics', icon: <BarChart2 size={14} /> },
          { id: 'ghost', label: 'Ghost Filters', icon: <Ghost size={14} />, badge: ghostData?.clusters?.length || null },
          { id: 'express', label: 'Express Approval', icon: <Zap size={14} />, badge: expressData?.total || null, badgeColor: '#22c55e' },
          { id: 'records', label: 'All Records', icon: <FileText size={14} /> },
          { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
            marginBottom: '-1px', transition: 'color 0.15s', whiteSpace: 'nowrap', position: 'relative'
          }}>
            {tab.icon} {tab.label}
            {tab.badge > 0 && (
              <span style={{ fontSize: '0.55rem', fontWeight: 900, background: tab.badgeColor || '#ef4444', color: '#fff', borderRadius: 99, padding: '0.1rem 0.35rem', marginLeft: '0.2rem' }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Total Accounts', value: users.length },
              { label: 'Active', value: users.filter(u => u.activationDate).length },
              { label: 'Admin Verified', value: users.filter(u => u.adminVerified).length },
              { label: 'Pending', value: users.filter(u => !u.adminVerified).length },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{s.label}</p>
                <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary)', marginTop: '0.25rem' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Create Account Panel */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <button onClick={() => setShowCreate(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: 0 }}>
              <Plus size={18} color="var(--primary)" />
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>Create New Account</span>
              <ChevronDown size={16} color="var(--text-muted)" style={{ marginLeft: 'auto', transform: showCreate ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {showCreate && (
              <form onSubmit={handleCreate} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label>Username <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(login credential)</span></label>
                    <input
                      value={createForm.username}
                      onChange={e => setCreateForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                      placeholder="e.g. dr_krishna" required
                    />
                  </div>
                  <div>
                    <label>Full Name</label>
                    <input value={createForm.fullName} onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Dr. Krish" required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label>System Role</label>
                    <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
                      {SYSTEM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Entity Type</label>
                    <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}>
                      {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label>Institution / Company <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(defaults to your institution)</span></label>
                  <input value={createForm.institution} onChange={e => setCreateForm(f => ({ ...f, institution: e.target.value }))} placeholder={adminUser?.institution || 'City General Hospital'} />
                </div>
                <div>
                  <label>Initial Password <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span></label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters - share this with the user"
                    autoComplete="new-password"
                  />
                </div>
                {createStatus.msg && (
                  <div style={{ padding: '0.7rem 1rem', borderRadius: 6, background: createStatus.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${createStatus.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, color: createStatus.type === 'error' ? '#ef4444' : '#22c55e', fontSize: '0.82rem', fontWeight: 600 }}>
                    {createStatus.msg}
                  </div>
                )}
                <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>Create Account</button>
              </form>
            )}
          </div>

          {/* Managed Accounts List */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Users size={18} color="var(--primary)" />
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Managed Accounts</span>
            </div>
            {loadingUsers ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
            ) : users.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 10 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No accounts yet. Create one above.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {users.map(u => (
                  <div key={u.username} style={{ borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {/* Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.fullName}</p>
                          <RoleBadge role={u.role} />
                          <StatusBadge verified={u.adminVerified} activationDate={u.activationDate} />
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          @{u.username} · {u.institution || u.type}
                          {u.activationDate ? ` · Activated ${fmtDate(u.activationDate)}` : ` · Created ${fmtDate(u.doj)}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        <button onClick={() => editingId === u.username ? setEditingId(null) : startEdit(u)} title="Edit credentials" style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid var(--border)', background: editingId === u.username ? 'rgba(37,99,235,0.1)' : 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => toggleVerify(u.username, u.adminVerified)} title={u.adminVerified ? 'Remove verification' : 'Mark as verified'} style={{ padding: '0.4rem 0.65rem', borderRadius: 6, border: `1px solid ${u.adminVerified ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: u.adminVerified ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)', color: u.adminVerified ? '#ef4444' : '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 700 }}>
                          {u.adminVerified ? <><X size={12} /> Unverify</> : <><Check size={12} /> Verify</>}
                        </button>
                        <button onClick={() => deleteUser(u.username)} title="Remove user" style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {/* Inline Edit Panel */}
                    {editingId === u.username && (
                      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'rgba(37,99,235,0.03)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--primary)' }}>Edit Credentials</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                          <div><label style={{ fontSize: '0.72rem' }}>Username</label><input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))} /></div>
                          <div><label style={{ fontSize: '0.72rem' }}>Full Name</label><input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} /></div>
                          <div>
                            <label style={{ fontSize: '0.72rem' }}>System Role</label>
                            <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                              {SYSTEM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.72rem' }}>Entity Type</label>
                            <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                          </div>
                          <div><label style={{ fontSize: '0.72rem' }}>Institution</label><input value={editForm.institution} onChange={e => setEditForm(f => ({ ...f, institution: e.target.value }))} /></div>
                          <div>
                            <label style={{ fontSize: '0.72rem' }}>Reset Password <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                            <input type="password" value={editForm.newPassword || ''} onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="New password (min. 6 chars)" autoComplete="new-password" />
                          </div>
                        </div>
                        {editStatus && <p style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>{editStatus}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn" style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={saveEdit}>
                            <Save size={13} /> Save Changes
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Provider Analytics Tab ── */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0 }}>Provider Risk Leaderboard</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Ranked by Integrity Index - most suspicious providers listed first.
              </p>
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => fetchAnalytics(adminUser.username)}>
              <BarChart2 size={13} /> Refresh
            </button>
          </div>

          {analyticsLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Computing risk scores across all records...
            </div>
          )}

          {!analyticsLoading && analytics && analytics.providers.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No records issued yet. Analytics will appear once providers start issuing records.</p>
            </div>
          )}

          {!analyticsLoading && analytics && analytics.providers.map((p, i) => {
            const gradeColor = p.trustGrade === 'A' ? '#22c55e' : p.trustGrade === 'B' ? '#3b82f6' : p.trustGrade === 'C' ? '#f59e0b' : '#ef4444';
            const scoreBarColor = p.avgScore >= 90 ? '#22c55e' : p.avgScore >= 75 ? '#3b82f6' : p.avgScore >= 55 ? '#f59e0b' : '#ef4444';
            return (
              <div key={p.username} className="card" style={{ padding: '1.25rem', marginBottom: '0.75rem' }}>
                {/* Row 1: Identity + Grade */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--text-muted)', minWidth: '1.5rem' }}>#{i + 1}</span>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{p.institution || p.username}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.1rem' }}>@{p.username} • {p.totalRecords} record{p.totalRecords !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {/* Grade Badge */}
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: gradeColor, letterSpacing: '-0.04em' }}>{p.trustGrade}</span>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: scoreBarColor, letterSpacing: '-0.04em' }}>{p.avgScore}</p>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Integrity</p>
                    </div>
                  </div>
                </div>

                {/* Score Bar */}
                <div style={{ margin: '0.85rem 0', background: 'var(--surface)', borderRadius: 99, height: 6 }}>
                  <div style={{ width: `${p.avgScore}%`, height: '100%', borderRadius: 99, background: scoreBarColor, transition: 'width 0.4s ease' }} />
                </div>

                {/* Row 2: Stats + Top Flags */}
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444', margin: 0 }}>{p.criticalCount}</p>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Critical</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f97316', margin: 0 }}>{p.highCount}</p>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>High</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b', margin: 0 }}>{p.mediumCount}</p>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Medium</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: p.anomalyRate > 30 ? '#ef4444' : 'var(--text)', margin: 0 }}>{p.anomalyRate}%</p>
                      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Anomaly Rate</p>
                    </div>
                  </div>

                  {p.topFlags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginLeft: 'auto' }}>
                      {p.topFlags.map(f => (
                        <span key={f.type} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.2rem 0.55rem', borderRadius: 99, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                          {f.type.replace(/_/g, ' ')} ×{f.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {analytics?.generatedAt && (
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>
              Last computed: {new Date(analytics.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* ── Ghost Procedure Filters Tab ── */}
      {activeTab === 'ghost' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Ghost size={18} color="#8b5cf6" /> Ghost Procedure Filters
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Statistically improbable billing patterns flagged per patient - duplicate scans, incompatible same-day combos, multi-issuer networks.
              </p>
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => fetchGhost(adminUser.username)}>
              <Ghost size={13} /> Refresh
            </button>
          </div>

          {/* Summary bar */}
          {!ghostLoading && ghostData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Patients Scanned', value: ghostData.scanned || 0, color: 'var(--primary)' },
                { label: 'Flagged Clusters', value: ghostData.clusters?.length || 0, color: '#ef4444' },
                { label: 'Critical', value: ghostData.clusters?.filter(c => c.riskLevel === 'CRITICAL').length || 0, color: '#ef4444' },
                { label: 'High Risk', value: ghostData.clusters?.filter(c => c.riskLevel === 'HIGH').length || 0, color: '#f97316' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '1.1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, margin: 0, marginTop: '0.2rem' }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {ghostLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Scanning patient records for ghost procedure patterns...</div>
          )}

          {!ghostLoading && ghostData?.clusters?.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 12 }}>
              <Ghost size={32} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No suspicious patterns detected. All patient records appear statistically normal.</p>
            </div>
          )}

          {!ghostLoading && ghostData?.clusters?.map((cluster, i) => {
            const riskColors = { CRITICAL: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' }, HIGH: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', color: '#f97316' }, MEDIUM: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' } };
            const rc = riskColors[cluster.riskLevel] || riskColors.MEDIUM;
            const isExpanded = expandedCluster === i;
            return (
              <div key={i} className="card" style={{ marginBottom: '0.75rem', border: `1px solid ${rc.border}`, background: rc.bg, padding: 0, overflow: 'hidden' }}>
                {/* Header row */}
                <button onClick={() => setExpandedCluster(isExpanded ? null : i)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 99, background: rc.color, flexShrink: 0 }}>
                    {cluster.riskLevel === 'CRITICAL' ? <ChevronsUp size={16} color="#fff" /> : cluster.riskLevel === 'HIGH' ? <Zap size={16} color="#fff" /> : <AlertTriangle size={16} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0, color: 'var(--text)' }}>{cluster.patientName}</p>
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.15rem 0.5rem', borderRadius: 99, background: rc.color, color: '#fff' }}>{cluster.riskLevel}</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', padding: '0.15rem 0.5rem', borderRadius: 99, border: '1px solid var(--border)' }}>{cluster.flags.length} flag{cluster.flags.length !== 1 ? 's' : ''}</span>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.15rem' }}>Reg #{cluster.registerNumber} · {cluster.totalRecords} records · {cluster.issuers.length} issuer{cluster.issuers.length !== 1 ? 's' : ''}: {cluster.issuers.join(', ')}</p>
                  </div>
                  <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${rc.border}`, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Flags list */}
                    <div>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Detected Signals</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {cluster.flags.map((flag, fi) => {
                          const fColors = { critical: { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.25)', color: '#ef4444' }, high: { bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.25)', color: '#f97316' }, medium: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b' } };
                          const fc = fColors[flag.severity] || fColors.medium;
                          return (
                            <div key={fi} style={{ padding: '0.65rem 0.9rem', borderRadius: 8, background: fc.bg, border: `1px solid ${fc.border}`, display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                              <AlertTriangle size={13} color={fc.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                              <div>
                                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: fc.color, marginRight: '0.4rem' }}>{flag.type.replace(/_/g, ' ')}</span>
                                {flag.date && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}><Calendar size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />{flag.date}</span>}
                                <p style={{ fontSize: '0.8rem', color: 'var(--text)', margin: 0, marginTop: '0.2rem' }}>{flag.message}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Record timeline */}
                    <div>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Record Timeline</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {cluster.records.map((r, ri) => (
                          <div key={ri} style={{ padding: '0.7rem 0.9rem', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>{r.recordType}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{r.issueDate}</span>
                            </div>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>@{r.issuerUsername} · {r.doctorName}</p>
                            {r.medCosts && <p style={{ fontSize: '0.7rem', color: 'var(--primary)', margin: 0, marginTop: '0.2rem', fontWeight: 700 }}>₹{Number(r.medCosts).toLocaleString('en-IN')}</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}

          {ghostData?.generatedAt && (
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>Last scanned: {new Date(ghostData.generatedAt).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* ── Phase 4.1: Express Approval Tab ── */}
      {activeTab === 'express' && (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Zap size={18} color="#22c55e" /> Express Approval Queue
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Records with 95+ Integrity Score and within-percentile billing - pre-qualified for automatic payout.
              </p>
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => fetchExpress(adminUser.username)}>
              <Zap size={13} /> Refresh
            </button>
          </div>

          {/* Summary stats */}
          {!expressLoading && expressData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Approved', value: expressData.total || 0, color: '#22c55e' },
                { label: 'Platinum', value: expressData.breakdown?.platinum || 0, color: '#a855f7' },
                { label: 'Gold', value: expressData.breakdown?.gold || 0, color: '#f59e0b' },
                { label: 'Fast-Track', value: expressData.breakdown?.fast || 0, color: '#3b82f6' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '1.1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>
                    {s.label}
                  </p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, margin: 0, marginTop: '0.2rem' }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {expressLoading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Computing integrity scores for all records...</div>
          )}

          {!expressLoading && expressData?.approved?.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 12 }}>
              <Zap size={32} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No records currently meet the 95+ integrity threshold. Approve more verified records or reduce anomaly flags.</p>
            </div>
          )}

          {!expressLoading && expressData?.approved?.map((rec, i) => {
            const tierStyles = {
              PLATINUM: { bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.3)', color: '#a855f7', label: 'Platinum', scoreBg: '#a855f7' },
              GOLD: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b', label: 'Gold', scoreBg: '#f59e0b' },
              FAST: { bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.3)', color: '#3b82f6', label: 'Fast-Track', scoreBg: '#3b82f6' },
            };
            const ts = tierStyles[rec.approvalTier] || tierStyles.FAST;
            const isExpanded = expandedExpress === i;
            const hashId = rec.dataHash ? String(rec._id) : i;
            return (
              <div key={i} className="card" style={{ marginBottom: '0.75rem', border: `1px solid ${ts.border}`, background: ts.bg, padding: 0, overflow: 'hidden' }}>
                {/* Header row */}
                <button onClick={() => setExpandedExpress(isExpanded ? null : i)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
                  {/* Score pill */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 52, height: 52, borderRadius: 10, background: ts.scoreBg, flexShrink: 0 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{rec.integrityScore}</span>
                    <span style={{ fontSize: '0.5rem', fontWeight: 800, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0, color: 'var(--text)' }}>{rec.patientName}</p>
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.15rem 0.5rem', borderRadius: 99, background: ts.color, color: '#fff' }}>{ts.label}</span>
                      {rec.flagCount === 0 && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', padding: '0.15rem 0.5rem', borderRadius: 99 }}>Zero Flags</span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.15rem' }}>
                      Reg #{rec.registerNumber} · {rec.recordType} · {rec.issuerInstitution}
                      {rec.medCosts ? ` · ₹${Number(rec.medCosts).toLocaleString('en-IN')}` : ''}
                      {rec.billingRatio !== null ? ` (${rec.billingRatio}× avg)` : ''}
                    </p>
                  </div>
                  <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${ts.border}`, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Approval green box */}
                    <div style={{ padding: '1rem', borderRadius: 8, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22c55e', marginBottom: '0.5rem' }}>Why This Record Qualifies</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {rec.fastTrackReason.map((r, ri) => (
                            <p key={ri} style={{ fontSize: '0.8rem', color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>• {r}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Record fields grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem 1.5rem' }}>
                      {[
                        ['Patient', rec.patientName],
                        ['Reg Number', rec.registerNumber],
                        ['Record Type', rec.recordType],
                        ['Issue Date', rec.issueDate],
                        ['Issuer', rec.issuerInstitution],
                        ['Medical Costs', rec.medCosts ? `₹${Number(rec.medCosts).toLocaleString('en-IN')}` : '—'],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>{label}</p>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', margin: 0, marginTop: '0.15rem' }}>{val || '—'}</p>
                        </div>
                      ))}
                      {rec.diagnosis && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>Diagnosis</p>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', margin: 0, marginTop: '0.15rem' }}>{rec.diagnosis}</p>
                        </div>
                      )}
                    </div>

                    {/* Hash + copy action */}
                    {rec.dataHash && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Record Hash</span>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.dataHash}</span>
                        <button onClick={() => copyHash(rec.dataHash, hashId)} title="Copy hash" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedHash === hashId ? '#22c55e' : 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          {copiedHash === hashId ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}

                    {/* Approve action strip */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: 7, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.78rem', fontWeight: 800 }}>
                        <CheckCircle2 size={14} /> AUTO-APPROVED · Score {rec.integrityScore}/100
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>This record has passed all MediLance integrity checks and qualifies for immediate payout processing.</p>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}

          {expressData?.generatedAt && (
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.75rem', textAlign: 'right' }}>Last computed: {new Date(expressData.generatedAt).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* ── All Records Tab ── */}
      {activeTab === 'records' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0 }}>All Issued Records</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Complete list of all records generated in the system.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => fetchRecords(adminUser.username)}>
                Refresh
              </button>
              {selectedRecords.size > 0 && (
                <button className="btn" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ef4444', borderColor: '#ef4444' }} onClick={() => setShowConfirmDelete(true)}>
                  <Trash2 size={13} /> Delete {selectedRecords.size}
                </button>
              )}
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showConfirmDelete && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div className="card" style={{ padding: '2rem', maxWidth: 400, width: '90%', textAlign: 'center' }}>
                <AlertTriangle size={32} color="#ef4444" style={{ marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Confirm Deletion</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  Are you sure you want to permanently delete {selectedRecords.size} record(s)? This action cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setShowConfirmDelete(false)}>Cancel</button>
                  <button className="btn" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={deleteRecords}>Yes, Delete</button>
                </div>
              </div>
            </div>
          )}

          {loadingRecords ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading records...
            </div>
          ) : records.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No records found.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {records.map(rec => {
                const isSelected = selectedRecords.has(rec._id);
                const isExpanded = expandedRecord === rec._id;
                return (
                  <div key={rec._id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1rem', background: isSelected ? 'rgba(37,99,235,0.05)' : 'var(--bg)', cursor: 'pointer' }}
                      onClick={() => setExpandedRecord(isExpanded ? null : rec._id)}>
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => {
                          const newSet = new Set(selectedRecords);
                          if (e.target.checked) newSet.add(rec._id); else newSet.delete(rec._id);
                          setSelectedRecords(newSet);
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{rec.patientName}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{rec.registerNumber} • Issued by @{rec.issuerUsername}</p>
                        </div>
                        <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', background: 'rgba(100,116,139,0.03)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Date of Birth</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.dob}</p></div>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gender</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.gender}</p></div>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Blood Group</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.bloodGroup}</p></div>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Record Type</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.recordType}</p></div>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Doctor</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.doctorName}</p></div>
                        <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Issue Date</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.issueDate}</p></div>
                        <div style={{ gridColumn: '1 / -1' }}><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Diagnosis</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rec.diagnosis}</p></div>
                        {rec.medCosts && <div><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Medical Costs</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>₹{rec.medCosts}</p></div>}
                        {rec.mode === 'mint' && <div style={{ gridColumn: '1 / -1' }}><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Mint File</p><p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>Attached Mint File</p></div>}
                        <div style={{ gridColumn: '1 / -1' }}><p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Created At</p><p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{new Date(rec.createdAt).toLocaleString()}</p></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0, marginBottom: '1.25rem' }}>Master Admin Settings</h2>
          <form onSubmit={updateSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label>Full Name</label>
              <input value={settingsForm.fullName} onChange={e => setSettingsForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Admin Name" required />
            </div>
            <div>
              <label>Institution / Company</label>
              <input value={settingsForm.institution} onChange={e => setSettingsForm(f => ({ ...f, institution: e.target.value }))} placeholder="Organization Name" required />
            </div>
            {settingsStatus.msg && (
              <div style={{ padding: '0.7rem 1rem', borderRadius: 6, background: settingsStatus.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${settingsStatus.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, color: settingsStatus.type === 'error' ? '#ef4444' : '#22c55e', fontSize: '0.82rem', fontWeight: 600 }}>
                {settingsStatus.msg}
              </div>
            )}
            <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>Save Settings</button>
          </form>
        </div>
      )}
    </div>
  );
}
