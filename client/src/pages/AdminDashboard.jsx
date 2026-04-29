import React, { useState } from 'react';
import { Shield, Plus, Check, X, Trash2, LogOut, Users, ChevronDown, Pencil, Save } from 'lucide-react';

const API = 'http://localhost:3005/api/admin';

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
  const [phase, setPhase] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [adminUser, setAdminUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', fullName: '', role: 'issuer', type: 'hospital', institution: '', password: '' });
  const [createStatus, setCreateStatus] = useState({ type: '', msg: '' });
  const [actionMsg, setActionMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editStatus, setEditStatus] = useState('');

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
      setAdminUser(data.user);
      setPhase('dash');
      fetchUsers(data.user.username);
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
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }} onClick={() => { setPhase('login'); setAdminUser(null); setUsers([]); }}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      {/* Toast */}
      {actionMsg && (
        <div style={{ padding: '0.65rem 1rem', borderRadius: 7, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem' }}>
          {actionMsg}
        </div>
      )}

      {/* Stats */}
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
    </div>
  );
}
