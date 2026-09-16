import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase/firebase';
import {
  collection, getDocs, onSnapshot, addDoc, updateDoc,
  doc, Timestamp, query, orderBy, limit,
} from 'firebase/firestore';
import ReceptionistLayout from '../components/ReceptionistLayout';
import { useSettings } from '../components/SettingsContext';
import { AnimatedGradient } from '../../components/ui/animated-gradient-card';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── date helpers ──────────────────────────────────────────────
function toJSDate(val) {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}
function dateKey(val) {
  const d = toJSDate(val);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a, b) {
  return dateKey(a) === dateKey(b) && dateKey(a) !== null;
}

export default function ReceptionistDashboard() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors Reservations.js / PageLayout palette) ──
  const CARD_BG   = dark ? '#1c1c1c' : '#ffffff';
  const BORDER    = dark ? '#2a2a28' : '#e5e7eb';
  const ROWLINE   = dark ? '#242422' : '#f9fafb';
  const TEXT      = dark ? '#f0f0f0' : '#111827';
  const MUTED     = dark ? '#9ca3af' : '#9ca3af';
  const ACCENT    = settings?.accentColor || '#d4f550';
  const ACCENT_TEXT = dark ? '#0a1a0a' : '#111';
  const DARK_CHIP = dark ? '#0a1a0a' : '#1a2420';

  // Keep receptionist stat cards aligned with the admin dashboard palette.
  const STAT_BLOB_COLORS = [
  ['#dff8ee', '#b6ecd5', '#8cdec0'], // New Bookings — mint
  ['#e8f2ff', '#bfdcff', '#9fc8f8'], // Check-In — blue
  ['#fff5e9', '#ffe4ca', '#ffd2b0'], // Check-Out — peach
  ['#f3f8e3', '#dff0b6', '#c9e38e'],
  ];
  const STAT_CARD_BACKGROUNDS = ['#effbf5', '#eef6ff', '#fff8f0', '#f6fbe9'];

  const [stats, setStats] = useState({ todayArrivals: 0, todayDepartures: 0, checkedIn: 0, pendingPayments: 0, availableRooms: 0, totalRooms: 0 });
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [allReservations, setAllReservations] = useState([]);

  // ── Tasks (live) ──────────────────────────────────────────
  const [tasks, setTasks] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');

  // ── Activities (live) ────────────────────────────────────
  const [activitiesList, setActivitiesList] = useState([]);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivitySub, setNewActivitySub] = useState('');

  // ── Calendar ──────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  useEffect(() => {
    const fetch = async () => {
      const roomsSnap = await getDocs(collection(db, 'rooms'));
      const resSnap = await getDocs(collection(db, 'reservations'));
      const rooms = roomsSnap.docs.map(d => d.data());
      const reservations = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const today = new Date().toISOString().split('T')[0];
      const todayArrivals = reservations.filter(r => r.checkIn === today);
      const todayDepartures = reservations.filter(r => r.checkOut === today);
      setArrivals(todayArrivals);
      setDepartures(todayDepartures);
      setAllReservations(reservations);
      setStats({
        todayArrivals: todayArrivals.length,
        todayDepartures: todayDepartures.length,
        checkedIn: reservations.filter(r => r.status === 'checked-in').length,
        pendingPayments: reservations.filter(r => r.paymentStatus === 'pending').length,
        availableRooms: rooms.filter(r => r.status === 'vacant' || r.status === 'available').length,
        totalRooms: rooms.length,
      });
    };
    fetch();
  }, []);

  // live tasks
  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('tasks listener error:', err));
    return unsub;
  }, []);

  // live activities
  useEffect(() => {
    const q = query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      setActivitiesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('activities listener error:', err));
    return unsub;
  }, []);

  // ── Task actions (receptionist: create/complete, no delete) ──
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const dateVal = newTaskDate ? new Date(`${newTaskDate}T00:00:00`) : new Date();
    try {
      await addDoc(collection(db, 'tasks'), {
        title: newTaskTitle.trim(),
        date: Timestamp.fromDate(dateVal),
        completed: false,
        createdAt: Timestamp.now(),
      });
      setNewTaskTitle('');
      setNewTaskDate('');
      setShowTaskForm(false);
    } catch (e) {
      console.error('Failed to add task:', e);
    }
  };
  const toggleTask = async (t) => {
    try { await updateDoc(doc(db, 'tasks', t.id), { completed: !t.completed }); }
    catch (e) { console.error('Failed to update task:', e); }
  };

  // ── Activity actions (receptionist: log only, no delete) ────
  const handleAddActivity = async () => {
    if (!newActivityTitle.trim()) return;
    try {
      await addDoc(collection(db, 'activities'), {
        title: newActivityTitle.trim(),
        sub: newActivitySub.trim(),
        timestamp: Timestamp.now(),
      });
      setNewActivityTitle('');
      setNewActivitySub('');
      setShowActivityForm(false);
    } catch (e) {
      console.error('Failed to add activity:', e);
    }
  };

  const getTaskStyle = (t) => {
    if (t.completed) return { bg: dark ? 'rgba(148,163,184,0.08)' : '#f3f4f6', color: MUTED };
    const dt = toJSDate(t.date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = dt ? Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - today) / 86400000) : null;
    if (diffDays !== null && diffDays < 0) return { bg: dark ? 'rgba(248,113,113,0.1)' : 'rgba(254,226,226,0.6)', color: '#f87171' };
    if (diffDays === 0) return { bg: dark ? 'rgba(254,249,195,0.1)' : 'rgba(254,249,195,0.6)', color: '#fbbf24' };
    return { bg: dark ? 'rgba(209,250,229,0.1)' : 'rgba(209,250,229,0.5)', color: '#6ee7b7' };
  };

  const timeAgo = (ts) => {
    const d = toJSDate(ts);
    if (!d) return '';
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  // ── Calendar data ─────────────────────────────────────────
  const eventMap = useMemo(() => {
    const map = {};
    const add = (key, type) => {
      if (!key) return;
      if (!map[key]) map[key] = { tasks: 0, activities: 0, reservations: 0 };
      map[key][type]++;
    };
    tasks.forEach(t => add(dateKey(t.date), 'tasks'));
    activitiesList.forEach(a => add(dateKey(a.timestamp), 'activities'));
    allReservations.forEach(r => add(dateKey(r.checkIn), 'reservations'));
    return map;
  }, [tasks, activitiesList, allReservations]);

  const calCells = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [calMonth]);

  const monthLabel = calMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const changeMonth = (delta) => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1));

  const selectedKey = dateKey(selectedDay);
  const dayTasks = tasks.filter(t => dateKey(t.date) === selectedKey);
  const dayActivities = activitiesList.filter(a => dateKey(a.timestamp) === selectedKey);
  const dayReservations = allReservations.filter(r => dateKey(r.checkIn) === selectedKey);

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: '8px',
    border: `1px solid ${BORDER}`, fontSize: '11px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, background: dark ? '#0d1f0d' : '#fafafa', outline: 'none', boxSizing: 'border-box',
  };
  const smallBtn = (bg, color) => ({
    border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '11px',
    fontWeight: '600', cursor: 'pointer', background: bg, color, fontFamily: "'Poppins', sans-serif",
  });

  const S = {
    card: { background: CARD_BG, borderRadius: '16px', padding: '20px', border: `1px solid ${BORDER}`, fontFamily: "'Poppins', sans-serif" },
    th: { textAlign: 'left', fontSize: '11px', color: MUTED, fontWeight: '500', paddingBottom: '10px', borderBottom: `1px solid ${BORDER}`, fontFamily: "'Poppins', sans-serif" },
    td: { padding: '10px 0', fontSize: '12px', color: TEXT, borderBottom: `1px solid ${ROWLINE}`, fontFamily: "'Poppins', sans-serif" },
  };

  const cards = [
    { label: "Today's Arrivals", value: stats.todayArrivals, icon: 'ti-plane-arrival', bg: ACCENT, color: ACCENT_TEXT },
    { label: "Today's Departures", value: stats.todayDepartures, icon: 'ti-plane-departure', bg: DARK_CHIP, color: ACCENT },
    { label: 'Currently Checked In', value: stats.checkedIn, icon: 'ti-home-check', bg: dark ? '#1e3a5f' : '#dbeafe', color: dark ? '#93c5fd' : '#1d4ed8' },
    { label: 'Pending Payments', value: stats.pendingPayments, icon: 'ti-clock', bg: dark ? '#7f1d1d' : '#fee2e2', color: dark ? '#fca5a5' : '#dc2626' },
    { label: 'Available Rooms', value: `${stats.availableRooms}/${stats.totalRooms}`, icon: 'ti-bed', bg: dark ? '#14532d' : '#dcfce7', color: dark ? '#86efac' : '#16a34a' },
  ];

  return (
    <ReceptionistLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif" }}>
        {/* Date */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: MUTED }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '14px', marginBottom: '24px' }}>
          {cards.map((c, index) => (
            <div
              key={c.label}
              style={{
                position: 'relative', overflow: 'hidden', minHeight: '164px',
                borderRadius: '16px', padding: '20px',
                // Match the admin dashboard screenshot: fixed light pastel cards.
                background: STAT_CARD_BACKGROUNDS[index % 4],
                border: '1px solid #e6ebe7',
                boxShadow: '0 2px 8px rgba(30, 50, 40, 0.03)',
              }}
            >
              <AnimatedGradient
                colors={STAT_BLOB_COLORS[index % 4]}
                blur="medium"
                className="absolute inset-0"
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: TEXT, lineHeight: 1 }}>{c.value}</div>
                <div style={{ marginTop: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${c.icon}`} style={{ fontSize: '20px', color: TEXT }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Today's Arrivals */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Today's Arrivals</div>
              <button type="button" onClick={() => window.location.href = '/receptionist/reservations'}
                style={{ background: ACCENT, border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: ACCENT_TEXT }}>
                View all
              </button>
            </div>
            {arrivals.length === 0 ? (
              <div style={{ textAlign: 'center', color: MUTED, padding: '30px', fontSize: '12px' }}>No arrivals today</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Guest</th>
                    <th style={S.th}>Room</th>
                    <th style={S.th}>Guests</th>
                    <th style={S.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...S.td, fontWeight: '500' }}>{r.guestName}</td>
                      <td style={S.td}>Room {r.roomNumber}</td>
                      <td style={S.td}>{Number(r.adults || 1) + Number(r.children || 0)} pax</td>
                      <td style={S.td}>
                        <span style={{ background: dark ? '#14532d' : '#dcfce7', color: dark ? '#86efac' : '#16a34a', padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '600' }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Today's Departures */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Today's Departures</div>
              <button type="button" onClick={() => window.location.href = '/receptionist/billing'}
                style={{ background: DARK_CHIP, color: ACCENT, border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                Billing
              </button>
            </div>
            {departures.length === 0 ? (
              <div style={{ textAlign: 'center', color: MUTED, padding: '30px', fontSize: '12px' }}>No departures today</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Guest</th>
                    <th style={S.th}>Room</th>
                    <th style={S.th}>Balance</th>
                    <th style={S.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {departures.map(r => {
                    const balance = Number(r.totalAmount || 0) - Number(r.amountPaid || 0);
                    const unpaidColor = dark ? '#fca5a5' : '#dc2626';
                    const clearedColor = dark ? '#86efac' : '#16a34a';
                    return (
                      <tr key={r.id}>
                        <td style={{ ...S.td, fontWeight: '500' }}>{r.guestName}</td>
                        <td style={S.td}>Room {r.roomNumber}</td>
                        <td style={{ ...S.td, color: balance > 0 ? unpaidColor : clearedColor, fontWeight: '600' }}>
                          ₱{balance.toLocaleString()}
                        </td>
                        <td style={S.td}>
                          <span style={{
                            background: balance > 0 ? (dark ? '#7f1d1d' : '#fee2e2') : (dark ? '#14532d' : '#dcfce7'),
                            color: balance > 0 ? unpaidColor : clearedColor,
                            padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '600',
                          }}>
                            {balance > 0 ? 'Unpaid' : 'Cleared'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ ...S.card, marginTop: '16px' }}>
          <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '16px' }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'New Walk-in', path: '/receptionist/walkin', icon: 'ti-walk', bg: ACCENT, color: ACCENT_TEXT },
              { label: 'Room Status', path: '/receptionist/rooms', icon: 'ti-bed', bg: DARK_CHIP, color: ACCENT },
              { label: 'Process Payment', path: '/receptionist/billing', icon: 'ti-credit-card', bg: dark ? '#1e3a5f' : '#dbeafe', color: dark ? '#93c5fd' : '#1d4ed8' },
              { label: 'View Messages', path: '/receptionist/messages', icon: 'ti-message', bg: dark ? '#2d1b4e' : '#f3e8ff', color: dark ? '#c4b5fd' : '#7c3aed' },
            ].map(a => (
              <button type="button" key={a.label} onClick={() => window.location.href = a.path}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${BORDER}`, background: CARD_BG, cursor: 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.15s' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: '18px', color: a.color }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '500', color: TEXT }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Tasks + Activities ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>

          {/* Tasks */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Tasks</div>
              <div
                onClick={() => setShowTaskForm(s => !s)}
                style={{ width: '26px', height: '26px', borderRadius: '7px', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '16px', color: ACCENT_TEXT, cursor: 'pointer' }}>
                {showTaskForm ? '×' : '+'}
              </div>
            </div>

            {showTaskForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); } }}
                  placeholder="Task title..."
                  style={inputStyle}
                />
                <input
                  type="date"
                  value={newTaskDate}
                  onChange={e => setNewTaskDate(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                  style={inputStyle}
                />
                <button type="button" onClick={handleAddTask} style={smallBtn(ACCENT, ACCENT_TEXT)}>Add Task</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {tasks.length === 0 && !showTaskForm && (
                <div style={{ fontSize: '11px', color: MUTED, padding: '8px 0' }}>No tasks yet. Tap + to add one.</div>
              )}
              {tasks.map(t => {
                const st = getTaskStyle(t);
                return (
                  <div key={t.id} style={{ background: st.bg, border: `1px solid ${st.color}22`, borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: st.color, opacity: 0.75 }}>
                        {toJSDate(t.date)?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) || ''}
                      </span>
                      <input
                        type="checkbox"
                        checked={!!t.completed}
                        onChange={() => toggleTask(t)}
                        style={{ cursor: 'pointer', accentColor: st.color }}
                      />
                    </div>
                    <div style={{
                      fontSize: '11px', fontWeight: '600', color: st.color, marginTop: '4px', lineHeight: 1.3,
                      textDecoration: t.completed ? 'line-through' : 'none',
                    }}>
                      {t.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activities */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Recent Activities</div>
              <span
                onClick={() => setShowActivityForm(s => !s)}
                style={{ color: MUTED, fontSize: '18px', cursor: 'pointer', letterSpacing: '2px' }}
              >
                {showActivityForm ? '×' : '···'}
              </span>
            </div>

            {showActivityForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <input
                  value={newActivityTitle}
                  onChange={e => setNewActivityTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddActivity(); } }}
                  placeholder="Activity title..."
                  style={inputStyle}
                />
                <input
                  value={newActivitySub}
                  onChange={e => setNewActivitySub(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddActivity(); } }}
                  placeholder="Details (optional)..."
                  style={inputStyle}
                />
                <button type="button" onClick={handleAddActivity} style={smallBtn(ACCENT, ACCENT_TEXT)}>Log Activity</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto' }}>
              {activitiesList.length === 0 && (
                <div style={{ fontSize: '11px', color: MUTED }}>No activity logged yet.</div>
              )}
              {activitiesList.slice(0, 8).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: dark ? 'rgba(110,231,183,0.1)' : '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-activity" style={{ fontSize: '14px', color: dark ? '#6ee7b7' : '#065f46' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>{timeAgo(a.timestamp)}</div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT }}>{a.title}</div>
                    {a.sub && <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px', lineHeight: 1.4 }}>{a.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Calendar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', marginTop: '16px' }}>

          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Calendar</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: MUTED, fontSize: '14px', padding: '2px 6px' }}>‹</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: TEXT, minWidth: '110px', textAlign: 'center' }}>{monthLabel}</span>
                <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: MUTED, fontSize: '14px', padding: '2px 6px' }}>›</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
              {[
                { color: '#6ee7b7', label: 'Tasks' },
                { color: '#60a5fa', label: 'Activities' },
                { color: ACCENT, label: 'Reservations' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: l.color }} />
                  <span style={{ fontSize: '10px', color: MUTED }}>{l.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '4px' }}>
              {WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: '9px', color: MUTED, fontWeight: '600', padding: '2px 0' }}>{w}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>
              {calCells.map((d, i) => {
                if (!d) return <div key={i} />;
                const key = dateKey(d);
                const ev = eventMap[key];
                const isSelected = sameDay(d, selectedDay);
                const isToday = sameDay(d, new Date());
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDay(d)}
                    style={{
                      position: 'relative', borderRadius: '8px', padding: '6px 0 8px',
                      textAlign: 'center', cursor: 'pointer',
                      background: isSelected
                        ? (dark ? 'rgba(212,245,80,0.18)' : ACCENT)
                        : ev
                          ? (dark ? 'rgba(212,245,80,0.06)' : '#f9fbf2')
                          : 'transparent',
                      border: isToday ? `1px solid ${ACCENT}` : '1px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: isSelected ? '700' : '500', color: isSelected ? ACCENT_TEXT : TEXT }}>
                      {d.getDate()}
                    </div>
                    {ev && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '3px' }}>
                        {ev.tasks > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#6ee7b7' }} />}
                        {ev.activities > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#60a5fa' }} />}
                        {ev.reservations > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: ACCENT }} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          <div style={S.card}>
            <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '14px' }}>
              {selectedDay.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '320px', overflowY: 'auto' }}>

              {dayTasks.length === 0 && dayActivities.length === 0 && dayReservations.length === 0 && (
                <div style={{ fontSize: '11px', color: MUTED }}>Nothing on this day.</div>
              )}

              {dayTasks.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#6ee7b7', marginBottom: '6px' }}>TASKS</div>
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ fontSize: '11px', color: TEXT, marginBottom: '4px', textDecoration: t.completed ? 'line-through' : 'none' }}>
                      • {t.title}
                    </div>
                  ))}
                </div>
              )}

              {dayActivities.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#60a5fa', marginBottom: '6px' }}>ACTIVITIES</div>
                  {dayActivities.map(a => (
                    <div key={a.id} style={{ fontSize: '11px', color: TEXT, marginBottom: '4px' }}>• {a.title}</div>
                  ))}
                </div>
              )}

              {dayReservations.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: dark ? ACCENT : '#7a8f1f', marginBottom: '6px' }}>RESERVATIONS</div>
                  {dayReservations.map(r => (
                    <div key={r.id} style={{ fontSize: '11px', color: TEXT, marginBottom: '4px' }}>
                      • {r.guestName || 'Guest'} — Room {r.roomNumber || '—'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ReceptionistLayout>
  );
}