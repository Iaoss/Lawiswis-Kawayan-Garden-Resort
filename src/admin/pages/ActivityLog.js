import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

// Admin-only list of what staff did: payments, charges, walk-ins, edits,
// cancellations, status changes, refund and date-change decisions, room
// changes and staff account changes. Entries are written by the server (or
// by the staff member's own account) and can't be edited or deleted.

const MAX_ENTRIES = 500;

export const ACTION_GROUPS = [
  { id: 'payments', label: 'Payments & charges', actions: ['payment_recorded', 'charge_added', 'service_added', 'late_fee_added'] },
  { id: 'bookings', label: 'Bookings', actions: ['walk_in_created', 'booking_edited', 'status_changed', 'no_show_closed', 'overstay_flagged'] },
  { id: 'cancellations', label: 'Cancellations & refunds', actions: ['reservation_cancelled', 'approve_refund', 'reject_refund', 'review_refund'] },
  { id: 'changes', label: 'Date-change requests', actions: ['approve_modification', 'reject_modification'] },
  { id: 'rooms', label: 'Rooms', actions: ['room_created', 'room_updated', 'room_deleted', 'room_status_changed'] },
  { id: 'accounts', label: 'Staff accounts', actions: ['staff_account_created', 'staff_account_edited', 'staff_account_status', 'staff_password_reset', 'staff_access_granted', 'staff_access_removed'] },
  { id: 'resort', label: 'Resort status', actions: ['resort_status_changed'] },
];

const groupOf = action => ACTION_GROUPS.find(group => group.actions.includes(action));

const toDate = value => (value?.toDate ? value.toDate() : null);
const manilaDay = date => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export default function ActivityLog() {
  const { settings } = useSettings();
  const dark = Boolean(settings?.darkMode);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const c = {
    page: dark ? '#020b09' : '#f4f6f4',
    card: dark ? '#1c1c1c' : '#fff',
    card2: dark ? '#282827' : '#f9fafb',
    border: dark ? '#2a2a28' : '#e5e7eb',
    text: dark ? '#f0f0f0' : '#111827',
    muted: dark ? '#9ca3af' : '#6b7280',
    accent: settings?.accentColor || '#9cb56f',
  };

  useEffect(() => {
    const logQuery = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(MAX_ENTRIES));
    return onSnapshot(logQuery, snapshot => {
      setEntries(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError('');
    }, snapshotError => {
      console.error('Could not load the activity log:', snapshotError);
      setError('The activity log could not be loaded. Make sure the latest Firestore rules are published.');
      setLoading(false);
    });
  }, []);

  const staffOptions = useMemo(() => {
    const seen = new Map();
    entries.forEach(entry => {
      if (!seen.has(entry.staffUid)) seen.set(entry.staffUid, entry.staffName || entry.staffEmail || 'Unknown staff');
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter(entry => {
      const date = toDate(entry.createdAt);
      const day = date ? manilaDay(date) : '';
      if (staffFilter !== 'all' && entry.staffUid !== staffFilter) return false;
      if (roleFilter !== 'all' && entry.staffRole !== roleFilter) return false;
      if (groupFilter !== 'all' && groupOf(entry.action)?.id !== groupFilter) return false;
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      if (!term) return true;
      return [entry.summary, entry.staffName, entry.staffEmail, entry.guestName, entry.reservationId]
        .some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [entries, search, staffFilter, roleFilter, groupFilter, from, to]);

  const today = manilaDay(new Date());
  const todayCount = entries.filter(entry => {
    const date = toDate(entry.createdAt);
    return date && manilaDay(date) === today;
  }).length;
  const receptionistCount = entries.filter(entry => entry.staffRole === 'receptionist').length;

  const field = {
    border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12,
    background: c.card2, color: c.text, fontFamily: 'inherit', minWidth: 0,
  };
  const hasFilters = search || staffFilter !== 'all' || roleFilter !== 'all' || groupFilter !== 'all' || from || to;

  return (
    <PageLayout>
      <main style={{ minHeight: '100vh', padding: 20, background: c.page, color: c.text, fontFamily: "'Poppins', sans-serif" }}>
        <div style={{ maxWidth: 1150, margin: '0 auto' }}>
          <header style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 21, margin: '0 0 5px' }}>Activity Log</h1>
            <p style={{ color: c.muted, fontSize: 12, margin: 0 }}>
              Everything staff did in the system, newest first. Entries can’t be edited or deleted. Showing the latest {MAX_ENTRIES}.
            </p>
          </header>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Entries loaded', value: entries.length },
              { label: 'Today', value: todayCount },
              { label: 'By receptionists', value: receptionistCount },
              { label: 'Staff members', value: staffOptions.length },
            ].map(stat => (
              <div key={stat.label} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: c.muted }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </section>

          <section style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input aria-label="Search the activity log" placeholder="Search staff, guest, booking or action…" value={search}
              onChange={event => setSearch(event.target.value)} style={{ ...field, flex: '1 1 220px' }} />
            <select aria-label="Filter by staff member" value={staffFilter} onChange={event => setStaffFilter(event.target.value)} style={field}>
              <option value="all">All staff</option>
              {staffOptions.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
            </select>
            <select aria-label="Filter by role" value={roleFilter} onChange={event => setRoleFilter(event.target.value)} style={field}>
              <option value="all">All roles</option>
              <option value="receptionist">Receptionists</option>
              <option value="admin">Admins</option>
            </select>
            <select aria-label="Filter by type of action" value={groupFilter} onChange={event => setGroupFilter(event.target.value)} style={field}>
              <option value="all">All actions</option>
              {ACTION_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
            <label style={{ fontSize: 11, color: c.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              From <input type="date" value={from} onChange={event => setFrom(event.target.value)} style={field} />
            </label>
            <label style={{ fontSize: 11, color: c.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              To <input type="date" value={to} onChange={event => setTo(event.target.value)} style={field} />
            </label>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setStaffFilter('all'); setRoleFilter('all'); setGroupFilter('all'); setFrom(''); setTo(''); }}
                style={{ ...field, cursor: 'pointer', fontWeight: 600 }}>
                Clear
              </button>
            )}
          </section>

          {error && <div role="alert" style={{ background: dark ? '#7f1d1d' : '#fee2e2', color: dark ? '#fca5a5' : '#991b1b', padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{error}</div>}

          <section style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', fontSize: 11.5, color: c.muted, borderBottom: `1px solid ${c.border}` }}>
              Showing {filtered.length} of {entries.length}
            </div>
            {loading ? (
              <p style={{ padding: 24, margin: 0, color: c.muted, fontSize: 13 }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <p style={{ padding: 24, margin: 0, color: c.muted, fontSize: 13 }}>
                {entries.length ? 'No entries match these filters.' : 'No activity recorded yet. Entries appear here as staff record payments, change bookings, and so on.'}
              </p>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filtered.map(entry => {
                  const date = toDate(entry.createdAt);
                  const group = groupOf(entry.action);
                  return (
                    <li key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 170px) 1fr', gap: 14, padding: '12px 16px', borderTop: `1px solid ${c.border}` }}>
                      <div style={{ fontSize: 11.5, color: c.muted }}>
                        {date
                          ? date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : 'Just now'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{entry.summary}</div>
                        <div style={{ fontSize: 11.5, color: c.muted, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <span>{entry.staffName || entry.staffEmail || 'Unknown staff'}</span>
                          {entry.staffRole && <span style={{ textTransform: 'capitalize' }}>· {entry.staffRole}</span>}
                          {group && <span>· {group.label}</span>}
                          {entry.guestName && <span>· Guest: {entry.guestName}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </PageLayout>
  );
}
