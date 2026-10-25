import React, { useState, useEffect } from 'react';
import { auth, db, secondaryAuth } from '../../firebase/firebase';
import { collection, getDocs, updateDoc, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';
import { logStaffActivity } from '../lib/activityLog';

export default function UserManagement() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = dark ? '#9ca3af' : '#9ca3af';
  const HOVER_BG= dark ? '#242422' : '#f9fafb';

  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#15803d';
  const ERROR_BG      = dark ? '#7f1d1d' : '#fee2e2';
  const ERROR_TEXT    = dark ? '#fca5a5' : '#b91c1c';

  // Two-tone badge helper: dark = saturated bg + light text, light = tinted bg + saturated text
  const badge = (kind) => {
    const map = {
      purple: { dbg: '#2d1b4e', dtext: '#c4b5fd', lbg: '#ede9fe', ltext: '#7c3aed' },
      blue:   { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      green:  { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      red:    { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
    };
    const c = map[kind] || map.blue;
    return dark ? { background: c.dbg, color: c.dtext } : { background: c.lbg, color: c.ltext };
  };
  const badgeStyle = { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' };

  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'receptionist' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  // Row being edited: { id, name, role }.
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const myUid = auth.currentUser?.uid;

  const fetchUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      // Create the Auth account on the secondary instance (admin stays logged in)
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        form.email,
        form.password
      );
      const newUid = cred.user.uid;
      await signOut(secondaryAuth);

      // Write the profile doc with the main app (still signed in as admin)
      await setDoc(doc(db, 'users', newUid), {
        name: form.name,
        email: form.email,
        role: form.role,
        status: 'active',
      });

      logStaffActivity('staff_account_created', `Created ${form.role} account for ${form.name} (${form.email})`);
      setSuccess(`User ${form.name} created successfully!`);
      setForm({ name: '', email: '', password: '', role: 'receptionist' });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStatus = async (user) => {
    const currentStatus = user.status || 'active';
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setError(''); setSuccess('');
    try {
      await updateDoc(doc(db, 'users', user.id), { status: newStatus });
      logStaffActivity('staff_account_status', `${newStatus === 'active' ? 'Reactivated' : 'Deactivated'} the account of ${user.name || user.email}`);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Could not change the account status.');
    }
  };

  // Admins can change a staff member's name and role. The email is their
  // login, so it stays as is (create a new account for a new email).
  const saveEdit = async () => {
    const user = users.find(u => u.id === editing?.id);
    const name = editing?.name.trim() || '';
    if (!user) return;
    if (name.length < 2 || name.length > 80) { setError('Enter a name between 2 and 80 characters.'); return; }
    setSavingEdit(true); setError(''); setSuccess('');
    try {
      await updateDoc(doc(db, 'users', user.id), { name, role: editing.role });
      const changes = [];
      if (name !== user.name) changes.push(`name "${user.name || ''}" → "${name}"`);
      if (editing.role !== user.role) changes.push(`role ${user.role} → ${editing.role}`);
      if (changes.length) logStaffActivity('staff_account_edited', `Edited ${user.email}: ${changes.join(', ')}`);
      setSuccess(`The account of ${name} was updated.`);
      setEditing(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Could not save the changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const sendReset = async (user) => {
    setError(''); setSuccess('');
    try {
      await sendPasswordResetEmail(auth, user.email);
      logStaffActivity('staff_password_reset', `Sent a password reset email to ${user.email}`);
      setSuccess(`Password reset email sent to ${user.email}.`);
    } catch (err) {
      setError(err.message || 'Could not send the reset email.');
    }
  };

  /* ── shared styles ── */
  const card = { background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };
  const inp = {
    width: '100%', border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px 12px',
    fontSize: '13px', fontFamily: "'Poppins', sans-serif", marginTop: '4px',
    background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box', display: 'block',
  };
  const label = { fontSize: '12px', color: SUBTEXT };

  return (
    <Layout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, margin: 0 }}>User Management</h2>
          <button onClick={() => setShowForm(!showForm)}
            style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            + Add User
          </button>
        </div>

        {success && <div style={{ background: SUCCESS_BG, color: SUCCESS_TEXT, padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>✅ {success}</div>}
        {error && <div style={{ background: ERROR_BG, color: ERROR_TEXT, padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>❌ {error}</div>}

        {showForm && (
          <div style={{ ...card, padding: '22px', marginBottom: '22px' }}>
            <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '14px', fontSize: '14px' }}>Create New User</h3>
            <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={label}>Full Name</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  style={inp} placeholder="Juan dela Cruz" />
              </div>
              <div>
                <label style={label}>Email</label>
                <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  style={inp} placeholder="juan@resort.com" />
              </div>
              <div>
                <label style={label}>Password</label>
                <input required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  style={inp} placeholder="Min. 6 characters" />
              </div>
              <div>
                <label style={label}>Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="receptionist">Receptionist</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px' }}>
                <button type="submit"
                  style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Create User
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ background: CARD2, color: SUBTEXT, border: `1px solid ${BORDER}`, padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead style={{ background: CARD2 }}>
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>No users found.</td></tr>
              ) : (
                users.map(u => {
                  const active = (u.status || 'active') === 'active';
                  const isMe = u.id === myUid;
                  const isEditing = editing?.id === u.id;
                  const smallBtn = {
                    fontSize: '11px', padding: '6px 12px', borderRadius: '8px', fontWeight: '600',
                    cursor: 'pointer', border: `1px solid ${BORDER}`, background: CARD2, color: SUBTEXT, fontFamily: "'Poppins', sans-serif",
                  };
                  return (
                    <tr key={u.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>
                        {isEditing ? (
                          <input aria-label="Full name" value={editing.name} maxLength={80}
                            onChange={e => setEditing({ ...editing, name: e.target.value })} style={{ ...inp, marginTop: 0 }} />
                        ) : <>{u.name}{isMe && <span style={{ color: MUTED, fontWeight: 500 }}> (you)</span>}</>}
                      </td>
                      <td style={{ padding: '12px 16px', color: MUTED }}>{u.email}</td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        {isEditing && !isMe ? (
                          <select aria-label="Role" value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}
                            style={{ ...inp, marginTop: 0, cursor: 'pointer', textTransform: 'capitalize' }}>
                            <option value="receptionist">Receptionist</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span style={{ ...badgeStyle, ...badge(u.role === 'admin' ? 'purple' : 'blue') }}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ ...badgeStyle, ...badge(active ? 'green' : 'red') }}>
                          {u.status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {isEditing ? (
                            <>
                              <button type="button" onClick={saveEdit} disabled={savingEdit}
                                style={{ ...smallBtn, border: 'none', background: ACCENT, color: ACCENT_TEXT }}>
                                {savingEdit ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditing(null)} style={smallBtn}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => setEditing({ id: u.id, name: u.name || '', role: u.role || 'receptionist' })} style={smallBtn}>
                                Edit
                              </button>
                              {u.email && (
                                <button type="button" onClick={() => sendReset(u)} style={smallBtn} title="Email this person a link to set a new password">
                                  Reset password
                                </button>
                              )}
                              {/* Admins can't deactivate their own account. */}
                              {!isMe && (
                                <button type="button" onClick={() => toggleStatus(u)}
                                  style={{ ...smallBtn, border: 'none', ...(active ? badge('red') : badge('green')) }}>
                                  {active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}