import React, { useEffect, useMemo, useState } from 'react';
import { auth, db, secondaryAuth } from '../../firebase/firebase';
import {
  Timestamp, collection, deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';
import { logStaffActivity } from '../lib/activityLog';
import { appConfirm } from '../../components/ui/app-dialog';
import { staffApi } from '../lib/staffApi';
import {
  ACCESS_DURATIONS, ACCESS_FEATURES, STAFF_ROLES_DOC, describeExpiry, getAccessFeature, getActiveGrants, getGrantExpiry,
  getRoleError, listRoles, normalizeRole, planRoleAccess, roleLabel,
} from '../../lib/staffAccess';

// Staff accounts: create, edit name and role, reset password, deactivate,
// delete, and give receptionists extra access to admin features for a set
// time or until it's removed. Admins can also save custom roles (a name plus
// a set of features) and give them to staff; see src/lib/staffAccess.js.

const EMPTY_ROLE = { id: '', name: '', description: '', features: [] };
const newRoleId = () => `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Role picker values: 'admin', 'receptionist' or 'custom:<roleId>'.
const roleValueOf = u => (u?.role === 'receptionist' && u.customRoleId ? `custom:${u.customRoleId}` : (u?.role || 'receptionist'));

const EMPTY_FORM = { name: '', email: '', password: '', role: 'receptionist' };
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Admins' },
  { id: 'receptionist', label: 'Receptionists' },
  { id: 'access', label: 'With extra access' },
  { id: 'inactive', label: 'Deactivated' },
];
const GROUPS = ['Pages', 'Actions'];

const initialsOf = name => String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
const localInputValue = date => {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatWhen = ms => new Date(ms).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const isActive = u => (u.status || 'active') === 'active';

export default function UserManagement() {
  const { settings } = useSettings();
  const dark = Boolean(settings?.darkMode);
  const c = {
    accent: settings?.accentColor || '#9cb56f',
    accentText: '#0a1a0a',
    page: dark ? '#020b09' : '#f4f6f4',
    card: dark ? '#1c1c1c' : '#ffffff',
    card2: dark ? '#262624' : '#f7f8f7',
    border: dark ? '#2f2f2c' : '#e5e7eb',
    text: dark ? '#f0f0f0' : '#1f2937',
    sub: dark ? '#c7c7c0' : '#4b5563',
    muted: '#9ca3af',
    overlay: dark ? 'rgba(0,0,0,0.65)' : 'rgba(17,24,39,0.45)',
  };
  const tone = kind => ({
    purple: dark ? { background: '#2d1b4e', color: '#c4b5fd' } : { background: '#ede9fe', color: '#6d28d9' },
    blue: dark ? { background: '#1e3a5f', color: '#93c5fd' } : { background: '#dbeafe', color: '#1d4ed8' },
    green: dark ? { background: '#14532d', color: '#86efac' } : { background: '#dcfce7', color: '#15803d' },
    red: dark ? { background: '#7f1d1d', color: '#fca5a5' } : { background: '#fee2e2', color: '#b91c1c' },
    amber: dark ? { background: '#4a3410', color: '#fcd34d' } : { background: '#fef3c7', color: '#92400e' },
  })[kind];

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [now, setNow] = useState(() => Date.now());

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(null); // { id, name, role }
  const [saving, setSaving] = useState(false);

  // Access panel: the receptionist it's open for, plus the form.
  const [accessFor, setAccessFor] = useState(null);
  const [accessForm, setAccessForm] = useState({ features: [], duration: 'shift', until: '', note: '' });
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');

  // Custom roles.
  const [roles, setRoles] = useState([]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(null); // EMPTY_ROLE shape while editing
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState('');

  const myUid = auth.currentUser?.uid;
  const me = users.find(u => u.id === myUid);

  useEffect(() => onSnapshot(collection(db, 'users'), snapshot => {
    setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }, error => {
    console.error('Could not load staff accounts:', error);
    setNotice({ type: 'error', text: 'Staff accounts could not be loaded.' });
    setLoading(false);
  }), []);

  useEffect(() => onSnapshot(doc(db, ...STAFF_ROLES_DOC),
    snapshot => setRoles(listRoles(snapshot.data())),
    error => console.error('Could not load staff roles:', error)), []);

  // Keeps "time left" labels and expiries current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const grantsOf = u => (u.role === 'receptionist' ? getActiveGrants(u, now) : []);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    receptionists: users.filter(u => u.role === 'receptionist').length,
    withAccess: users.filter(u => u.role === 'receptionist' && getActiveGrants(u, now).length > 0).length,
    inactive: users.filter(u => !isActive(u)).length,
  }), [users, now]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users
      .filter(u => {
        if (filter === 'admin' && u.role !== 'admin') return false;
        if (filter === 'receptionist' && u.role !== 'receptionist') return false;
        if (filter === 'inactive' && isActive(u)) return false;
        if (filter === 'access' && !(u.role === 'receptionist' && getActiveGrants(u, now).length)) return false;
        return !term || [u.name, u.email, u.role, u.customRoleName].some(v => String(v || '').toLowerCase().includes(term));
      })
      .sort((a, b) => (a.id === myUid ? -1 : b.id === myUid ? 1 : 0)
        || Number(isActive(b)) - Number(isActive(a))
        || String(a.name || '').localeCompare(String(b.name || '')));
  }, [users, search, filter, now, myUid]);

  const say = (type, text) => setNotice({ type, text });

  // ── Roles ──────────────────────────────────────────────────
  const roleById = id => roles.find(role => role.id === id) || null;
  const membersOf = roleId => users.filter(u => u.role === 'receptionist' && u.customRoleId === roleId);

  // Firestore field changes that give `user` the picked role (value from
  // the role picker), with the role's features as permanent access.
  const roleChanges = (user, value) => {
    const custom = value.startsWith('custom:') ? roleById(value.slice(7)) : null;
    const role = custom ? 'receptionist' : value;
    const changes = { role };
    if (role === 'admin') {
      // Admins have every feature, so extra access is cleared.
      if (user?.access) changes.access = deleteField();
    } else {
      const plan = planRoleAccess(user, custom);
      plan.remove.forEach(id => { changes[`access.${id}`] = deleteField(); });
      plan.add.forEach(id => {
        changes[`access.${id}`] = {
          grantedAt: serverTimestamp(),
          grantedBy: myUid || '',
          grantedByName: me?.name || auth.currentUser?.email || 'Admin',
          expiresAt: null,
          note: `Part of the ${custom.name} role`,
          fromRole: custom.id,
        };
      });
    }
    if (custom) {
      changes.customRoleId = custom.id;
      changes.customRoleName = custom.name;
    } else if (user?.customRoleId) {
      changes.customRoleId = deleteField();
      changes.customRoleName = deleteField();
    }
    return { changes, label: custom ? custom.name : role, custom };
  };

  const saveRole = async () => {
    if (!roleForm) return;
    const role = normalizeRole(roleForm.id || newRoleId(), roleForm);
    const error = getRoleError(role, roles);
    if (error) { setRoleError(error); return; }
    setRoleBusy(true);
    setRoleError('');
    try {
      await setDoc(doc(db, ...STAFF_ROLES_DOC), {
        roles: { [role.id]: { name: role.name, description: role.description, features: role.features, updatedAt: serverTimestamp(), updatedByName: me?.name || auth.currentUser?.email || 'Admin' } },
      }, { merge: true });
      // Everyone with this role gets the new feature list straight away.
      const members = membersOf(role.id);
      if (members.length) {
        const batch = writeBatch(db);
        members.forEach(member => {
          const plan = planRoleAccess(member, role);
          const changes = { customRoleName: role.name };
          plan.remove.forEach(id => { changes[`access.${id}`] = deleteField(); });
          plan.add.forEach(id => {
            changes[`access.${id}`] = { grantedAt: serverTimestamp(), grantedBy: myUid || '', grantedByName: me?.name || 'Admin', expiresAt: null, note: `Part of the ${role.name} role`, fromRole: role.id };
          });
          batch.update(doc(db, 'users', member.id), changes);
        });
        await batch.commit();
      }
      const labels = role.features.map(id => getAccessFeature(id)?.label).join(', ');
      logStaffActivity('staff_role_saved', `${roleForm.id ? 'Updated' : 'Created'} the ${role.name} role: ${labels}${members.length ? ` (${members.length} staff updated)` : ''}`);
      say('success', `The ${role.name} role was saved${members.length ? ` and ${members.length} staff member${members.length === 1 ? '' : 's'} updated` : ''}.`);
      setRoleForm(null);
    } catch (saveError) {
      setRoleError(saveError.message || 'Could not save the role.');
    } finally {
      setRoleBusy(false);
    }
  };

  const deleteRole = async role => {
    const members = membersOf(role.id);
    const ok = await appConfirm(
      members.length
        ? `${members.length} staff member${members.length === 1 ? ' has' : 's have'} this role. They become plain receptionists and lose its features.`
        : 'Nobody has this role yet.',
      { title: `Delete the ${role.name} role?`, tone: 'warning', confirmLabel: 'Delete role' },
    );
    if (!ok) return;
    setRoleBusy(true);
    setRoleError('');
    try {
      const batch = writeBatch(db);
      members.forEach(member => {
        const changes = { customRoleId: deleteField(), customRoleName: deleteField() };
        planRoleAccess(member, null).remove.forEach(id => { changes[`access.${id}`] = deleteField(); });
        batch.update(doc(db, 'users', member.id), changes);
      });
      batch.set(doc(db, ...STAFF_ROLES_DOC), { roles: { [role.id]: deleteField() } }, { merge: true });
      await batch.commit();
      logStaffActivity('staff_role_deleted', `Deleted the ${role.name} role${members.length ? ` (${members.length} staff moved to Receptionist)` : ''}`);
      say('success', `The ${role.name} role was deleted.`);
      if (roleForm?.id === role.id) setRoleForm(null);
    } catch (deleteError) {
      setRoleError(deleteError.message || 'Could not delete the role.');
    } finally {
      setRoleBusy(false);
    }
  };

  const toggleRoleFeature = id => setRoleForm(current => ({
    ...current,
    features: current.features.includes(id) ? current.features.filter(f => f !== id) : [...current.features, id],
  }));

  // ── Account actions ────────────────────────────────────────
  const handleCreate = async event => {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) { say('error', 'Enter the staff member’s full name.'); return; }
    if (form.password.length < 6) { say('error', 'The password needs at least 6 characters.'); return; }
    setCreating(true);
    setNotice(null);
    try {
      // The account is created on a second Firebase instance so the admin stays signed in.
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await signOut(secondaryAuth);
      const { changes, label } = roleChanges(null, form.role);
      await setDoc(doc(db, 'users', cred.user.uid), { name, email: form.email.trim(), role: changes.role, status: 'active' });
      if (form.role.startsWith('custom:')) await updateDoc(doc(db, 'users', cred.user.uid), changes);
      logStaffActivity('staff_account_created', `Created ${label} account for ${name} (${form.email.trim()})`);
      say('success', `${name}’s account was created. They can now log in with ${form.email.trim()}.`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (error) {
      say('error', error.code === 'auth/email-already-in-use' ? 'That email already has an account.' : (error.message || 'Could not create the account.'));
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async () => {
    const user = users.find(u => u.id === editing?.id);
    const name = editing?.name.trim() || '';
    if (!user) return;
    if (name.length < 2 || name.length > 80) { say('error', 'Enter a name between 2 and 80 characters.'); return; }
    setSaving(true);
    setNotice(null);
    try {
      const roleChanged = editing.role !== roleValueOf(user);
      const { changes: roleFields, label } = roleChanges(user, editing.role);
      const changes = { name, ...(roleChanged ? roleFields : {}) };
      await updateDoc(doc(db, 'users', user.id), changes);
      const summary = [];
      if (name !== user.name) summary.push(`name "${user.name || ''}" → "${name}"`);
      if (roleChanged) summary.push(`role ${roleLabel(user)} → ${label}`);
      if (summary.length) logStaffActivity('staff_account_edited', `Edited ${user.email}: ${summary.join(', ')}`);
      say('success', `${name}’s account was updated.`);
      setEditing(null);
    } catch (error) {
      say('error', error.message || 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async user => {
    setNotice(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      logStaffActivity('staff_password_reset', `Sent a password reset email to ${user.email}`);
      say('success', `Password reset email sent to ${user.email}.`);
    } catch (error) {
      say('error', error.message || 'Could not send the reset email.');
    }
  };

  const toggleStatus = async user => {
    const deactivate = isActive(user);
    if (deactivate) {
      const ok = await appConfirm(`${user.name || user.email} won’t be able to use the staff portal until you reactivate the account. Their past records stay.`, {
        title: 'Deactivate this account?', tone: 'warning', confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    setNotice(null);
    try {
      await updateDoc(doc(db, 'users', user.id), { status: deactivate ? 'inactive' : 'active' });
      logStaffActivity('staff_account_status', `${deactivate ? 'Deactivated' : 'Reactivated'} the account of ${user.name || user.email}`);
      say('success', `${user.name || user.email} was ${deactivate ? 'deactivated' : 'reactivated'}.`);
    } catch (error) {
      say('error', error.message || 'Could not change the account status.');
    }
  };

  const deleteAccount = async user => {
    const ok = await appConfirm(
      `${user.name || user.email} will no longer be able to log in, and the account is removed for good. Bookings, payments and the Activity Log keep their name. If they may come back, deactivate the account instead.`,
      { title: 'Delete this account?', tone: 'danger', confirmLabel: 'Delete account' },
    );
    if (!ok) return;
    setNotice(null);
    try {
      const result = await staffApi('staff-users', { action: 'delete-user', uid: user.id });
      say('success', `${result.name || user.name || user.email}’s account was deleted.`);
    } catch (error) {
      say('error', error.message || 'Could not delete the account.');
    }
  };

  // ── Extra access ───────────────────────────────────────────
  const openAccess = user => {
    setAccessFor(user.id);
    setAccessError('');
    setAccessForm({ features: [], duration: 'shift', until: localInputValue(new Date(Date.now() + 24 * 3600000)), note: '' });
  };
  const accessUser = users.find(u => u.id === accessFor) || null;

  const toggleFeature = id => setAccessForm(current => ({
    ...current,
    features: current.features.includes(id) ? current.features.filter(f => f !== id) : [...current.features, id],
  }));

  const grantAccess = async () => {
    if (!accessUser) return;
    if (!accessForm.features.length) { setAccessError('Choose at least one feature.'); return; }
    const expiry = getGrantExpiry(accessForm.duration, accessForm.until);
    if (expiry.error) { setAccessError(expiry.error); return; }
    setAccessBusy(true);
    setAccessError('');
    try {
      const grant = {
        grantedAt: serverTimestamp(),
        grantedBy: myUid || '',
        grantedByName: me?.name || auth.currentUser?.email || 'Admin',
        expiresAt: expiry.expiresAt ? Timestamp.fromDate(expiry.expiresAt) : null,
        note: accessForm.note.trim().slice(0, 200),
      };
      const updates = {};
      accessForm.features.forEach(id => { updates[`access.${id}`] = grant; });
      // Expired grants are tidied up at the same time.
      Object.entries(accessUser.access || {}).forEach(([id, old]) => {
        if (!accessForm.features.includes(id) && !getActiveGrants({ role: 'receptionist', access: { [id]: old } }).length) {
          updates[`access.${id}`] = deleteField();
        }
      });
      await updateDoc(doc(db, 'users', accessUser.id), updates);
      const labels = accessForm.features.map(id => getAccessFeature(id)?.label).join(', ');
      const until = expiry.expiresAt ? `until ${formatWhen(expiry.expiresAt.getTime())}` : 'until removed';
      logStaffActivity('staff_access_granted', `Gave ${accessUser.name || accessUser.email} access to ${labels} ${until}${grant.note ? ` (${grant.note})` : ''}`);
      say('success', `${accessUser.name || accessUser.email} now has access to ${labels} ${until}.`);
      setAccessForm(current => ({ ...current, features: [], note: '' }));
    } catch (error) {
      setAccessError(error.message || 'Could not save the access.');
    } finally {
      setAccessBusy(false);
    }
  };

  const removeAccess = async (user, featureIds) => {
    if (!featureIds.length) return;
    setAccessBusy(true);
    setAccessError('');
    try {
      const updates = {};
      featureIds.forEach(id => { updates[`access.${id}`] = deleteField(); });
      await updateDoc(doc(db, 'users', user.id), updates);
      const labels = featureIds.map(id => getAccessFeature(id)?.label || id).join(', ');
      logStaffActivity('staff_access_removed', `Removed ${user.name || user.email}’s access to ${labels}`);
      say('success', `Removed ${user.name || user.email}’s access to ${labels}.`);
    } catch (error) {
      setAccessError(error.message || 'Could not remove the access.');
    } finally {
      setAccessBusy(false);
    }
  };

  // ── Shared styles ──────────────────────────────────────────
  const font = "'Poppins', sans-serif";
  const card = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)' };
  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: font, background: c.card2, color: c.text, outline: 'none' };
  const label = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 600, color: c.sub };
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px', borderRadius: 9, fontWeight: 600, cursor: 'pointer', border: `1px solid ${c.border}`, background: c.card2, color: c.sub, fontFamily: font };
  const primary = { ...btn, border: 'none', background: c.accent, color: c.accentText };
  const pill = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' };

  // Called as a function (not <Modal />) so typing in its inputs keeps focus.
  const modal = ({ title, subtitle, onClose, width = 520 }, body) => (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: c.overlay, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label={title}
        style={{ ...card, width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: 22, fontFamily: font, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: c.text }}>{title}</h3>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: c.muted, overflowWrap: 'anywhere' }}>{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...btn, padding: '4px 10px', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        {body}
      </section>
    </div>
  );

  const editingUser = users.find(u => u.id === editing?.id) || null;
  const accessGrants = accessUser ? getActiveGrants(accessUser, now) : [];

  return (
    <Layout>
      <div style={{ fontFamily: font, background: c.page, minHeight: '100vh', padding: 20, color: c.text }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>User Management</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: c.muted }}>
                Staff accounts, roles, and extra access to admin features for receptionists.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setRolesOpen(true); setRoleForm(null); setRoleError(''); }} style={{ ...btn, padding: '10px 16px', fontSize: 13, borderRadius: 10 }}>
                <i className="ti ti-id-badge-2" aria-hidden="true" /> Roles{roles.length ? ` (${roles.length})` : ''}
              </button>
              <button type="button" onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }} style={{ ...primary, padding: '10px 18px', fontSize: 13, borderRadius: 10 }}>
                + Add staff
              </button>
            </div>
          </header>

          {notice && (
            <div role={notice.type === 'error' ? 'alert' : 'status'}
              style={{ ...tone(notice.type === 'error' ? 'red' : 'green'), padding: '11px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{notice.text}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 15 }}>×</button>
            </div>
          )}

          {/* Stats */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Staff accounts', value: stats.total, icon: 'ti-users' },
              { label: 'Admins', value: stats.admins, icon: 'ti-shield-check' },
              { label: 'Receptionists', value: stats.receptionists, icon: 'ti-user' },
              { label: 'With extra access', value: stats.withAccess, icon: 'ti-key' },
              { label: 'Deactivated', value: stats.inactive, icon: 'ti-user-off' },
            ].map(stat => (
              <div key={stat.label} style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: c.card2, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <i className={`ti ${stat.icon}`} style={{ fontSize: 18, color: c.accent }} aria-hidden="true" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: c.muted }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </section>

          {/* Toolbar */}
          <section style={{ ...card, padding: 12, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="Search staff" placeholder="Search name, email or role…" value={search}
              onChange={event => setSearch(event.target.value)} style={{ ...input, flex: '1 1 220px', width: 'auto', minWidth: 0 }} />
            <div role="tablist" aria-label="Filter staff" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map(item => (
                <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}
                  style={filter === item.id ? { ...primary, borderRadius: 999 } : { ...btn, borderRadius: 999 }}>
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {/* Staff cards */}
          {loading ? (
            <p style={{ color: c.muted, fontSize: 13 }}>Loading…</p>
          ) : visible.length === 0 ? (
            <div style={{ ...card, padding: 28, textAlign: 'center', color: c.muted, fontSize: 13 }}>No staff match this search.</div>
          ) : (
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              {visible.map(u => {
                const active = isActive(u);
                const isMe = u.id === myUid;
                const grants = grantsOf(u);
                return (
                  <article key={u.id} style={{ ...card, padding: 16, display: 'grid', gap: 12, alignContent: 'start', opacity: active ? 1 : 0.72, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                      <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, ...(u.role === 'admin' ? tone('purple') : tone('blue')) }}>
                        {initialsOf(u.name || u.email)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.name || 'Unnamed'}{isMe && <span style={{ color: c.muted, fontWeight: 500 }}> (you)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ ...pill, ...(u.role === 'admin' ? tone('purple') : tone('blue')) }}>{roleLabel(u)}</span>
                      {u.customRoleName && <span style={{ ...pill, background: c.card2, color: c.muted }}>Receptionist + role access</span>}
                      <span style={{ ...pill, ...(active ? tone('green') : tone('red')) }}>{active ? 'Active' : 'Deactivated'}</span>
                    </div>

                    {u.role === 'receptionist' && (
                      <div style={{ background: c.card2, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginBottom: grants.length ? 8 : 0 }}>
                          {grants.length ? (u.customRoleName ? `${u.customRoleName} access` : 'Extra access') : 'No extra access: standard receptionist pages only'}
                        </div>
                        {grants.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {grants.map(g => (
                              <span key={g.id} title={g.grant.note || undefined} style={{ ...pill, ...(g.expiresMs ? tone('amber') : tone('green')) }}>
                                <i className={`ti ${g.grant.fromRole ? 'ti-id-badge-2' : 'ti-key'}`} aria-hidden="true" /> {g.label} · {g.grant.fromRole ? 'role' : describeExpiry(g.expiresMs, now)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {u.role === 'admin' && <div style={{ fontSize: 11.5, color: c.muted }}>Admins can use every feature.</div>}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
                      <button type="button" style={btn} onClick={() => setEditing({ id: u.id, name: u.name || '', role: roleValueOf(u) })}>
                        <i className="ti ti-pencil" aria-hidden="true" /> Edit
                      </button>
                      {u.role === 'receptionist' && active && (
                        <button type="button" style={{ ...btn, ...tone('amber'), border: 'none' }} onClick={() => openAccess(u)}>
                          <i className="ti ti-key" aria-hidden="true" /> Access
                        </button>
                      )}
                      {u.email && (
                        <button type="button" style={btn} onClick={() => sendReset(u)} title="Email a link to set a new password">
                          <i className="ti ti-lock" aria-hidden="true" /> Reset password
                        </button>
                      )}
                      {!isMe && (
                        <button type="button" style={{ ...btn, ...(active ? tone('amber') : tone('green')), border: 'none' }} onClick={() => toggleStatus(u)}>
                          {active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                      {!isMe && (
                        <button type="button" style={{ ...btn, ...tone('red'), border: 'none' }} onClick={() => deleteAccount(u)} title="Delete this account for good">
                          <i className="ti ti-trash" aria-hidden="true" /> Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>

        {/* Create account */}
        {showCreate && modal({ title: 'Add staff account', subtitle: 'They log in with this email and password.', onClose: () => setShowCreate(false) }, (
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <label style={label}>Full name
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={input} placeholder="Juan dela Cruz" maxLength={80} />
            </label>
            <label style={label}>Email
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} placeholder="juan@resort.com" />
            </label>
            <label style={label}>Password
              <input required type="password" minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={input} placeholder="At least 6 characters" />
            </label>
            <label style={label}>Role
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                <option value="receptionist">Receptionist</option>
                <option value="admin">Admin</option>
                {roles.length > 0 && (
                  <optgroup label="Custom roles">
                    {roles.map(role => <option key={role.id} value={`custom:${role.id}`}>{role.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {(() => {
              const picked = String(form.role).startsWith('custom:') ? roleById(String(form.role).slice(7)) : null;
              return picked ? (
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: c.muted }}>
                  {picked.name} can use the receptionist pages plus: {picked.features.map(id => getAccessFeature(id)?.label).join(', ')}.
                </p>
              ) : null;
            })()}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" disabled={creating} style={{ ...primary, padding: '9px 18px' }}>{creating ? 'Creating…' : 'Create account'}</button>
            </div>
          </form>
        ))}

        {/* Edit account */}
        {editingUser && modal({ title: 'Edit account', subtitle: editingUser.email, onClose: () => setEditing(null), width: 440 }, (
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={label}>Full name
              <input value={editing.name} maxLength={80} onChange={e => setEditing({ ...editing, name: e.target.value })} style={input} />
            </label>
            <label style={label}>Role
              <select value={editing.role} disabled={editingUser.id === myUid} onChange={e => setEditing({ ...editing, role: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                <option value="receptionist">Receptionist</option>
                <option value="admin">Admin</option>
                {roles.length > 0 && (
                  <optgroup label="Custom roles">
                    {roles.map(role => <option key={role.id} value={`custom:${role.id}`}>{role.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {(() => {
              const picked = String(editing.role).startsWith('custom:') ? roleById(String(editing.role).slice(7)) : null;
              return picked ? (
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: c.muted }}>
                  {picked.name} can use the receptionist pages plus: {picked.features.map(id => getAccessFeature(id)?.label).join(', ')}.
                </p>
              ) : null;
            })()}
            {editingUser.id === myUid && <p style={{ margin: 0, fontSize: 11.5, color: c.muted }}>You can’t change your own role.</p>}
            <p style={{ margin: 0, fontSize: 11.5, color: c.muted }}>The email is the login, so it can’t be changed here. For a new email, create a new account and deactivate this one.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" disabled={saving} onClick={saveEdit} style={{ ...primary, padding: '9px 18px' }}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        ))}

        {/* Extra access */}
        {accessUser && modal({
          title: `Access for ${accessUser.name || accessUser.email}`,
          subtitle: 'Let this receptionist use admin features for a set time, or until you remove it.',
          onClose: () => setAccessFor(null),
          width: 660,
        }, (
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                <strong style={{ fontSize: 13 }}>Current access</strong>
                {accessGrants.length > 1 && (
                  <button type="button" disabled={accessBusy} style={{ ...btn, ...tone('red'), border: 'none' }} onClick={() => removeAccess(accessUser, accessGrants.filter(g => !g.grant.fromRole).map(g => g.id))}>Remove all</button>
                )}
              </div>
              {accessGrants.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: c.muted }}>None. They can only use the standard receptionist pages.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {accessGrants.map(g => (
                    <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: c.card2, borderRadius: 10, padding: '9px 12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</div>
                        <div style={{ fontSize: 11, color: c.muted }}>
                          {g.expiresMs ? `Until ${formatWhen(g.expiresMs)} · ${describeExpiry(g.expiresMs, now)}` : 'Until removed'}
                          {g.grant.grantedByName ? ` · given by ${g.grant.grantedByName}` : ''}
                          {g.grant.note ? ` · “${g.grant.note}”` : ''}
                        </div>
                      </div>
                      {g.grant.fromRole
                        ? <span style={{ fontSize: 11, color: c.muted, whiteSpace: 'nowrap' }}>From the role</span>
                        : <button type="button" disabled={accessBusy} style={btn} onClick={() => removeAccess(accessUser, [g.id])}>Remove</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16, display: 'grid', gap: 14 }}>
              <strong style={{ fontSize: 13 }}>Give access</strong>
              {GROUPS.map(group => (
                <fieldset key={group} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                  <legend style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, padding: 0 }}>{group}</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 8 }}>
                    {ACCESS_FEATURES.filter(f => f.group === group).map(feature => {
                      const checked = accessForm.features.includes(feature.id);
                      const has = accessGrants.some(g => g.id === feature.id);
                      const viaRole = accessGrants.some(g => g.id === feature.id && g.grant.fromRole);
                      return (
                        <label key={feature.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 10, cursor: viaRole ? 'default' : 'pointer', opacity: viaRole ? 0.65 : 1, border: `1px solid ${checked ? c.accent : c.border}`, background: checked ? (dark ? 'rgba(156,181,111,0.12)' : '#f3f8ec') : c.card }}>
                          <input type="checkbox" checked={checked || viaRole} disabled={viaRole} onChange={() => toggleFeature(feature.id)} style={{ marginTop: 3, accentColor: c.accent }} />
                          <span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: c.text }}>{feature.label}</span>
                            {has && <span style={{ ...pill, ...tone('green'), marginLeft: 6, padding: '1px 7px', fontSize: 10 }}>{viaRole ? 'in role' : 'has it'}</span>}
                            <span style={{ display: 'block', fontSize: 11, color: c.muted, marginTop: 2 }}>{feature.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <label style={label}>How long
                  <select value={accessForm.duration} onChange={e => setAccessForm({ ...accessForm, duration: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                    {ACCESS_DURATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
                {accessForm.duration === 'custom' && (
                  <label style={label}>Ends on
                    <input type="datetime-local" value={accessForm.until} min={localInputValue(new Date())} onChange={e => setAccessForm({ ...accessForm, until: e.target.value })} style={input} />
                  </label>
                )}
                <label style={{ ...label, gridColumn: '1 / -1' }}>Reason (optional)
                  <input value={accessForm.note} maxLength={200} onChange={e => setAccessForm({ ...accessForm, note: e.target.value })} style={input} placeholder="e.g. Covering for the manager on leave" />
                </label>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: c.muted, lineHeight: 1.6 }}>
                Access ends automatically at the chosen time. Choosing a feature they already have replaces its end time. Every grant and removal is saved in the Activity Log. User management, room prices and settings stay admin-only.
              </p>
              {accessError && <div role="alert" style={{ ...tone('red'), padding: '9px 12px', borderRadius: 9, fontSize: 12 }}>{accessError}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" style={btn} onClick={() => setAccessFor(null)}>Done</button>
                <button type="button" disabled={accessBusy || !accessForm.features.length} onClick={grantAccess} style={{ ...primary, padding: '9px 18px', opacity: accessForm.features.length ? 1 : 0.6 }}>
                  {accessBusy ? 'Saving…' : `Give access${accessForm.features.length ? ` (${accessForm.features.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Custom roles */}
        {rolesOpen && modal({
          title: 'Roles',
          subtitle: 'Save a set of features as a role, then give it to staff. They keep the receptionist pages and get the role’s features until you change their role.',
          onClose: () => { setRolesOpen(false); setRoleForm(null); },
          width: 680,
        }, (
          <div style={{ display: 'grid', gap: 16 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              <li style={{ background: c.card2, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: c.muted }}>
                <strong style={{ color: c.text }}>Admin</strong> · every feature, including user management, room prices and settings (built in).
              </li>
              <li style={{ background: c.card2, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: c.muted }}>
                <strong style={{ color: c.text }}>Receptionist</strong> · front desk pages only (built in).
              </li>
              {roles.map(role => (
                <li key={role.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: `1px solid ${roleForm?.id === role.id ? c.accent : c.border}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{role.name} <span style={{ fontWeight: 500, color: c.muted, fontSize: 11 }}>· {membersOf(role.id).length} staff</span></div>
                    {role.description && <div style={{ fontSize: 11.5, color: c.muted }}>{role.description}</div>}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                      {role.features.map(id => <span key={id} style={{ ...pill, ...tone('blue'), padding: '1px 8px', fontSize: 10.5 }}>{getAccessFeature(id)?.label}</span>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" style={btn} disabled={roleBusy} onClick={() => { setRoleForm({ ...role }); setRoleError(''); }}><i className="ti ti-pencil" aria-hidden="true" /> Edit</button>
                    <button type="button" style={{ ...btn, ...tone('red'), border: 'none' }} disabled={roleBusy} onClick={() => deleteRole(role)} aria-label={`Delete the ${role.name} role`}><i className="ti ti-trash" aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>

            {!roleForm ? (
              <div>
                <button type="button" style={primary} onClick={() => { setRoleForm({ ...EMPTY_ROLE }); setRoleError(''); }}>+ New role</button>
              </div>
            ) : (
              <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16, display: 'grid', gap: 14 }}>
                <strong style={{ fontSize: 13 }}>{roleForm.id ? `Edit ${roles.find(r => r.id === roleForm.id)?.name || 'role'}` : 'New role'}</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <label style={label}>Role name
                    <input value={roleForm.name} maxLength={40} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} style={input} placeholder="e.g. Cashier" />
                  </label>
                  <label style={label}>Description (optional)
                    <input value={roleForm.description} maxLength={160} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} style={input} placeholder="e.g. Handles payments and reports" />
                  </label>
                </div>
                {GROUPS.map(group => (
                  <fieldset key={group} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    <legend style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, padding: 0 }}>{group} this role can use</legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 8 }}>
                      {ACCESS_FEATURES.filter(f => f.group === group).map(feature => {
                        const checked = roleForm.features.includes(feature.id);
                        return (
                          <label key={feature.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${checked ? c.accent : c.border}`, background: checked ? (dark ? 'rgba(156,181,111,0.12)' : '#f3f8ec') : c.card }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRoleFeature(feature.id)} style={{ marginTop: 3, accentColor: c.accent }} />
                            <span>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: c.text }}>{feature.label}</span>
                              <span style={{ display: 'block', fontSize: 11, color: c.muted, marginTop: 2 }}>{feature.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                <p style={{ margin: 0, fontSize: 11.5, color: c.muted, lineHeight: 1.6 }}>
                  Changes apply to everyone with this role right away. User management, room prices and settings stay admin-only.
                </p>
                {roleError && <div role="alert" style={{ ...tone('red'), padding: '9px 12px', borderRadius: 9, fontSize: 12 }}>{roleError}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" style={btn} onClick={() => { setRoleForm(null); setRoleError(''); }}>Cancel</button>
                  <button type="button" disabled={roleBusy} onClick={saveRole} style={{ ...primary, padding: '9px 18px' }}>{roleBusy ? 'Saving…' : 'Save role'}</button>
                </div>
              </div>
            )}
            {!roleForm && roleError && <div role="alert" style={{ ...tone('red'), padding: '9px 12px', borderRadius: 9, fontSize: 12 }}>{roleError}</div>}
          </div>
        ))}
      </div>
    </Layout>
  );
}
