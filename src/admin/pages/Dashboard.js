import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { db } from '../../firebase/firebase';
import {
  collection, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, Timestamp, query, orderBy, limit,
} from 'firebase/firestore';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const revenueData = [
  { m: 'Dec', v: 120000 }, { m: 'Jan', v: 180000 }, { m: 'Feb', v: 315060 },
  { m: 'Mar', v: 260000 }, { m: 'Apr', v: 310000 }, { m: 'May', v: 290000 },
];
const reservationsData = [
  { d: '12 Jun', booked: 70, cancelled: 20 },
  { d: '13 Jun', booked: 80, cancelled: 15 },
  { d: '14 Jun', booked: 60, cancelled: 30 },
  { d: '15 Jun', booked: 90, cancelled: 10 },
  { d: '16 Jun', booked: 75, cancelled: 25 },
  { d: '17 Jun', booked: 85, cancelled: 12 },
  { d: '18 Jun', booked: 65, cancelled: 18 },
];
const platformData = [
  { name: 'Direct Booking', value: 61, color: '#89D7B7' },
  { name: 'Booking.com',    value: 12, color: '#c8f06e' },
  { name: 'Agoda',          value: 11, color: '#60a5fa' },
  { name: 'Airbnb',         value: 9,  color: '#f472b6' },
  { name: 'Hotels.com',     value: 5,  color: '#fb923c' },
  { name: 'Others',         value: 2,  color: '#a78bfa' },
];
const ratingCategories = [
  { label: 'Facilities',  score: 4.4 },
  { label: 'Cleanliness', score: 4.7 },
  { label: 'Services',    score: 4.6 },
  { label: 'Comfort',     score: 4.8 },
  { label: 'Location',    score: 4.5 },
];

const statusColors = {
  confirmed:    ['rgba(34,197,94,0.15)',  '#4ade80'],
  'checked-in': ['rgba(96,165,250,0.15)', '#60a5fa'],
  'checked-out':['rgba(148,163,184,0.1)', '#94a3b8'],
  cancelled:    ['rgba(248,113,113,0.15)','#f87171'],
  pending:      ['rgba(251,191,36,0.15)', '#fbbf24'],
};

const cardGradients = [
  { from: '#0d9488', to: '#0891b2' },
  { from: '#7c3aed', to: '#6d28d9' },
  { from: '#ea580c', to: '#dc2626' },
  { from: '#db2777', to: '#9333ea' },
];

// Blob color sets for the animated-gradient effect behind each stat card.
const statBlobColors = [
  ['#89D7B7', '#6ee7b7', '#34d399'], // New Bookings — teal/green
  ['#60a5fa', '#93c5fd', '#3b82f6'], // Check-In — blue
  ['#fb923c', '#f87171', '#fbbf24'], // Check-Out — orange/amber
  ['#c8f06e', '#a3e635', '#84cc16'], // Total Revenue — lime
];

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

// ── Animated gradient blob background ───────────────────────────
// Measures its container, then renders a few soft blurred circles per
// `colors` entry that drift around slowly and loop forever. This is a
// plain-React/inline-style stand-in for the Tailwind/SVG version — same
// visual idea (drifting blurred color blobs behind the card content).
function useContainerSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize({ width, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function AnimatedGradient({ colors, speed = 0.06, blur = 'medium', dark }) {
  const containerRef = useRef(null);
  const { width, height } = useContainerSize(containerRef);
  const circleSize = Math.max(width, height, 120);

  const blurPx = blur === 'light' ? '30px' : blur === 'medium' ? '50px' : '80px';
  const duration = 1 / speed; // mirrors the original's `1 / speed` seconds

  // Randomize each blob's start position/size/travel path once per color
  // set, so it doesn't reshuffle (and look jittery) on every re-render.
  const blobs = useMemo(() => {
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    return colors.map(() => ({
      top: `${Math.random() * 50}%`,
      left: `${Math.random() * 50}%`,
      sizeFactor: randomInt(0.6, 1.4),
      tx: [0, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 0],
      ty: [0, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 0],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors.join(',')]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, filter: `blur(${blurPx})` }}>
        {colors.map((color, i) => (
          <motion.div
            key={i}
            animate={{ x: blobs[i].tx, y: blobs[i].ty }}
            transition={{ duration, repeat: Infinity, ease: [0.445, 0.05, 0.55, 0.95] }}
            style={{
              position: 'absolute',
              top: blobs[i].top,
              left: blobs[i].left,
              width: circleSize * blobs[i].sizeFactor,
              height: circleSize * blobs[i].sizeFactor,
              borderRadius: '9999px',
              background: color,
              opacity: dark ? 0.22 : 0.3,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Staggered text reveal, matching the reference BentoCard's container/item
// framer-motion variants.
const statContainerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const statItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function AdminDashboard() {
  const { settings, formatCurrency, formatDate } = useSettings();
  const dark = settings?.darkMode;

  const BG       = dark ? '#020b09' : '#f4f6f4';
  const CARD     = dark ? '#1c1c1c' : '#ffffff';
  const CARD2    = dark ? '#282827' : '#ffffff';
  const BORDER   = dark ? '#282827' : '#e8ebe8';
  const TEXT     = dark ? '#f0f0f0' : '#111827';
  const MUTED    = dark ? '#6b7280' : '#9ca3af';
  const LIME     = '#c8f06e';
  const TEAL     = '#89D7B7';

  const [stats, setStats] = useState({
    totalReservations: 0, checkedIn: 0, availableRooms: 0,
    totalRevenue: 0, totalRooms: 0, pendingPayments: 0, checkOuts: 0,
  });
  const [recent, setRecent]       = useState([]);
  const [searchQ, setSearchQ]     = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');

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
    const fetchData = async () => {
      const roomsSnap = await getDocs(collection(db, 'rooms'));
      const resSnap   = await getDocs(collection(db, 'reservations'));
      const paySnap   = await getDocs(collection(db, 'payments'));
      const rooms        = roomsSnap.docs.map(d => d.data());
      const reservations = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const payments     = paySnap.docs.map(d => d.data());
      const revenue      = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      setStats({
        totalReservations: reservations.length,
        checkedIn:         reservations.filter(r => r.status === 'checked-in').length,
        checkOuts:         reservations.filter(r => r.status === 'checked-out').length,
        availableRooms:    rooms.filter(r => r.status === 'vacant' || r.status === 'available').length,
        totalRooms:        rooms.length,
        totalRevenue:      revenue,
        pendingPayments:   reservations.filter(r => r.paymentStatus === 'pending').length,
      });
      setRecent([...reservations].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    };
    fetchData();
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

  const filtered = recent.filter(r => {
    const q = searchQ.toLowerCase();
    const matchQ = !q || (r.guestName || '').toLowerCase().includes(q)
      || (r.status || '').toLowerCase().includes(q)
      || String(r.roomNumber || '').includes(q);
    const matchS = statusFilter === 'All Status' || r.status === statusFilter.toLowerCase();
    return matchQ && matchS;
  });

  const occupied  = stats.checkedIn;
  const reserved  = Math.max(0, stats.totalReservations - stats.checkedIn - stats.checkOuts);
  const available = stats.availableRooms;
  const notReady  = Math.max(0, stats.totalRooms - occupied - reserved - available);
  const total     = stats.totalRooms || 1;
  const pct = v => `${Math.round((v / total) * 100)}%`;

  // ── Task actions ──────────────────────────────────────────
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
  const deleteTask = async (id) => {
    try { await deleteDoc(doc(db, 'tasks', id)); }
    catch (e) { console.error('Failed to delete task:', e); }
  };

  // ── Activity actions ──────────────────────────────────────
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
  const deleteActivity = async (id) => {
    try { await deleteDoc(doc(db, 'activities', id)); }
    catch (e) { console.error('Failed to delete activity:', e); }
  };

  // task styling based on due date
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
    return formatDate(d);
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
    recent.forEach(r => add(dateKey(r.checkIn), 'reservations'));
    return map;
  }, [tasks, activitiesList, recent]);

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
  const dayReservations = recent.filter(r => dateKey(r.checkIn) === selectedKey);

  // NOTE: these are memoized so their identity stays stable across renders.
  // Defining components inline (recreated every render) makes React treat
  // them as brand-new component types on every keystroke, which unmounts
  // and remounts everything inside <Card> — including form inputs, causing
  // them to lose focus and the whole section to visibly "reload".
  const Card = useMemo(() => function Card({ children, style = {} }) {
    return (
      <div style={{ background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, padding: '18px 20px', ...style }}>
        {children}
      </div>
    );
  }, [CARD, BORDER]);

  const SectionTitle = useMemo(() => function SectionTitle({ children, action }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>{children}</span>
        {action && <span style={{ color: MUTED, fontSize: '18px', cursor: 'pointer', letterSpacing: '2px' }}>···</span>}
      </div>
    );
  }, [TEXT, MUTED]);

  const Pill = useMemo(() => function Pill({ children, color = LIME, textColor = '#1a2e1a' }) {
    return (
      <span style={{ background: color, color: textColor, borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>
        {children}
      </span>
    );
  }, []);

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: '8px',
    border: `1px solid ${BORDER}`, fontSize: '11px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, background: dark ? '#0d1f0d' : '#fafafa', outline: 'none', boxSizing: 'border-box',
  };
  const smallBtn = (bg, color) => ({
    border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '11px',
    fontWeight: '600', cursor: 'pointer', background: bg, color,
  });

  return (
    <Layout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh' }}>

        {/* ── Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '18px' }}>
          {[
            { label: 'New Bookings',  value: stats.totalReservations, icon: 'ti-calendar-event', trend: '+8.70%', up: true },
            { label: 'Check-In',      value: stats.checkedIn,         icon: 'ti-login',           trend: '+3.56%', up: true },
            { label: 'Check-Out',     value: stats.checkOuts,         icon: 'ti-logout',          trend: '-1.06%', up: false },
            { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: 'ti-currency-peso', trend: '+5.70%', up: true },
          ].map((c, i) => (
            <div key={c.label} style={{
              position: 'relative', overflow: 'hidden',
              borderRadius: '16px', padding: '20px',
              background: dark
                ? `linear-gradient(135deg, ${cardGradients[i].from}, ${cardGradients[i].to})`
                : '#ffffff',
              border: dark ? 'none' : '1px solid #e8ebe8',
              boxShadow: dark ? `0 8px 32px ${cardGradients[i].from}44` : 'none',
            }}>
              <AnimatedGradient colors={statBlobColors[i]} speed={0.06} blur="medium" dark={dark} />

              <motion.div
                variants={statContainerVariants}
                initial="hidden"
                animate="show"
                style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
              >
                <div>
                  <motion.div variants={statItemVariants} style={{ fontSize: '11px', color: dark ? 'rgba(255,255,255,0.7)' : '#9ca3af', marginBottom: '6px' }}>{c.label}</motion.div>
                  <motion.div variants={statItemVariants} style={{ fontSize: '28px', fontWeight: '700', color: dark ? '#fff' : TEXT, lineHeight: 1 }}>{c.value}</motion.div>
                  <motion.div variants={statItemVariants} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: dark ? (c.up ? '#a7f3d0' : '#fca5a5') : (c.up ? '#16a34a' : '#dc2626'), fontSize: '11px', fontWeight: '600' }}>
                      {c.up ? '↑' : '↓'} {c.trend}
                    </span>
                    <span style={{ fontSize: '10px', color: dark ? 'rgba(255,255,255,0.5)' : '#9ca3af' }}>Last month</span>
                  </motion.div>
                </div>
                <motion.div variants={statItemVariants} style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={`ti ${c.icon}`} style={{ fontSize: '20px', color: dark ? '#fff' : TEXT }} />
                </motion.div>
              </motion.div>
            </div>
          ))}
        </div>

        {/* ── Row 2 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 280px', gap: '14px', marginBottom: '14px' }}>

          <Card>
            <SectionTitle action>Room Availability</SectionTitle>
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '36px', marginBottom: '16px', gap: '2px' }}>
              {[
                { w: pct(occupied),  bg: TEAL,      label: 'Occupied' },
                { w: pct(reserved),  bg: LIME,      label: 'Reserved' },
                { w: pct(available), bg: '#e7f7a0', label: 'Available' },
                { w: pct(notReady),  bg: '#fde68a', label: 'Not Ready' },
              ].filter(s => parseInt(s.w) > 0).map(s => (
                <div key={s.label} style={{ width: s.w, background: s.bg }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Occupied',  val: occupied,  color: TEAL },
                { label: 'Reserved',  val: reserved,  color: LIME },
                { label: 'Available', val: available,  color: '#e7f7a0' },
                { label: 'Not Ready', val: notReady,   color: '#fde68a' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '9px', color: MUTED }}>{s.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: TEXT, lineHeight: 1.1 }}>{s.val}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Revenue</span>
              <Pill color={dark ? 'rgba(200,240,110,0.15)' : LIME} textColor={dark ? LIME : '#1a2e1a'}>Last 6 Months ▾</Pill>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={TEAL} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="m" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={v => formatCurrency(v / 1000) + 'K'} />
                <Tooltip
                  formatter={v => [formatCurrency(v), 'Revenue']}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', background: CARD2, border: `1px solid ${BORDER}`, color: TEXT }} />
                <Area type="monotone" dataKey="v" stroke={TEAL} strokeWidth={2.5} fill="url(#revGrad)"
                  dot={{ r: 4, fill: TEAL, stroke: dark ? CARD : '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionTitle action>Overall Rating</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '36px', fontWeight: '800', color: TEXT, lineHeight: 1 }}>4.6</div>
                <div style={{ fontSize: '10px', color: MUTED }}>/5</div>
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Impressive</div>
                <div style={{ fontSize: '10px', color: MUTED }}>from 2546 reviews</div>
              </div>
            </div>
            {ratingCategories.map(r => (
              <div key={r.label} style={{ marginBottom: '9px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: MUTED }}>{r.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: TEXT }}>{r.score}</span>
                </div>
                <div style={{ height: '4px', background: dark ? '#1e3a1e' : '#f0f0f0', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.score / 5) * 100}%`, background: LIME, borderRadius: '2px' }} />
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* ── Row 3 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: '14px', marginBottom: '14px' }}>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Reservations</span>
              <Pill color={dark ? 'rgba(200,240,110,0.15)' : LIME} textColor={dark ? LIME : '#1a2e1a'}>Last 7 Days ▾</Pill>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              {[{ color: TEAL, label: 'Booked' }, { color: LIME, label: 'Cancelled' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.color }} />
                  <span style={{ fontSize: '10px', color: MUTED }}>{l.label}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={reservationsData} barSize={12} barGap={2} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="d" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', background: CARD2, border: `1px solid ${BORDER}`, color: TEXT }} />
                <Bar dataKey="booked"    fill={TEAL} radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" fill={LIME} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionTitle action>Booking by Platform</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <PieChart width={130} height={130}>
                <Pie data={platformData} cx={60} cy={60} innerRadius={38} outerRadius={60}
                  dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                  {platformData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {platformData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', color: MUTED }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: TEXT }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ── Tasks (functional) ── */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Tasks</span>
              <div
                onClick={() => setShowTaskForm(s => !s)}
                style={{ width: '24px', height: '24px', borderRadius: '6px', background: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '16px', color: '#1a2e1a', cursor: 'pointer' }}>
                {showTaskForm ? '×' : '+'}
              </div>
            </div>

            {showTaskForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
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
                <button type="button" onClick={handleAddTask} style={smallBtn(LIME, '#1a2e1a')}>Add Task</button>
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
                      <span style={{ fontSize: '9px', color: st.color, opacity: 0.75 }}>{formatDate(t.date)}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!t.completed}
                          onChange={() => toggleTask(t)}
                          style={{ cursor: 'pointer', accentColor: st.color }}
                        />
                        <span
                          onClick={() => deleteTask(t.id)}
                          style={{ color: st.color, opacity: 0.6, fontSize: '13px', cursor: 'pointer' }}
                          title="Delete task"
                        >
                          ✕
                        </span>
                      </div>
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
          </Card>
        </div>

        {/* ── Row 4 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '14px', marginBottom: '14px' }}>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Booking List</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: MUTED }} />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    placeholder="Search guest, status..."
                    style={{
                      paddingLeft: '28px', paddingRight: '10px', height: '32px',
                      border: `1px solid ${BORDER}`, borderRadius: '8px',
                      fontSize: '11px', fontFamily: "'Poppins', sans-serif",
                      color: TEXT, background: dark ? '#0d1f0d' : '#fafafa',
                      outline: 'none', width: '200px',
                    }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  style={{
                    height: '32px', padding: '0 10px', border: `1px solid ${BORDER}`,
                    borderRadius: '8px', fontSize: '11px', fontFamily: "'Poppins', sans-serif",
                    background: dark ? 'rgba(200,240,110,0.15)' : LIME,
                    color: dark ? LIME : '#1a2e1a', fontWeight: '600', cursor: 'pointer',
                  }}>
                  {['All Status','Confirmed','Checked-in','Checked-out','Cancelled','Pending'].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Booking ID','Guest Name','Room Type','Room Number','Duration','Check-In & Check-Out','Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: '10px', color: MUTED, fontWeight: '500', padding: '0 0 10px', borderBottom: `1px solid ${BORDER}` }}>
                      {h} {h !== 'Status' ? '↕' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(filtered.length > 0 ? filtered : recent).slice(0, 6).map((r, i) => {
                  const [bg, col] = statusColors[r.status] || ['rgba(148,163,184,0.1)', '#94a3b8'];
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : dark ? 'rgba(255,255,255,0.02)' : '#fafdf8' }}>
                      <td style={{ padding: '10px 0', fontSize: '11px', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>
                        LG-{String(r.id || i).slice(0, 5).toUpperCase()}
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '12px', fontWeight: '600', color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
                        {r.guestName || '—'}
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '11px', color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ background: dark ? 'rgba(200,240,110,0.12)' : LIME, color: dark ? LIME : '#1a2e1a', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>
                          {r.roomType || 'Standard'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '11px', color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
                        Room {r.roomNumber || '—'}
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '11px', color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
                        {r.nights || '—'} nights
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '10px', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>
                        {formatDate(r.checkIn)} – {formatDate(r.checkOut)}
                      </td>
                      <td style={{ padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ background: bg, color: col, padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: MUTED, fontSize: '12px' }}>No reservations yet.</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* ── Recent Activities (functional) ── */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Recent Activities</span>
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
                <button type="button" onClick={handleAddActivity} style={smallBtn(LIME, '#1a2e1a')}>Log Activity</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '260px', overflowY: 'auto' }}>
              {activitiesList.length === 0 && (
                <div style={{ fontSize: '11px', color: MUTED }}>No activity logged yet.</div>
              )}
              {activitiesList.slice(0, 8).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: dark ? 'rgba(110,231,183,0.1)' : '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="ti ti-activity" style={{ fontSize: '15px', color: dark ? '#6ee7b7' : '#065f46' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>{timeAgo(a.timestamp)}</div>
                      <span onClick={() => deleteActivity(a.id)} style={{ color: MUTED, fontSize: '11px', cursor: 'pointer' }} title="Delete">✕</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT }}>{a.title}</div>
                    {a.sub && <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px', lineHeight: 1.4 }}>{a.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Row 5: Calendar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '14px' }}>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: TEXT }}>Calendar</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: MUTED, fontSize: '14px', padding: '2px 6px' }}>‹</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: TEXT, minWidth: '110px', textAlign: 'center' }}>{monthLabel}</span>
                <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: MUTED, fontSize: '14px', padding: '2px 6px' }}>›</span>
              </div>
            </div>

            {/* legend */}
            <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
              {[
                { color: '#6ee7b7', label: 'Tasks' },
                { color: '#60a5fa', label: 'Activities' },
                { color: LIME, label: 'Reservations' },
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
                      position: 'relative',
                      borderRadius: '8px',
                      padding: '6px 0 8px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: isSelected
                        ? (dark ? 'rgba(200,240,110,0.18)' : LIME)
                        : ev
                          ? (dark ? 'rgba(200,240,110,0.06)' : '#f7fbee')
                          : 'transparent',
                      border: isToday ? `1px solid ${LIME}` : '1px solid transparent',
                    }}
                  >
                    <div style={{
                      fontSize: '11px', fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? (dark ? LIME : '#1a2e1a') : TEXT,
                    }}>
                      {d.getDate()}
                    </div>
                    {ev && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '3px' }}>
                        {ev.tasks > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#6ee7b7' }} />}
                        {ev.activities > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#60a5fa' }} />}
                        {ev.reservations > 0 && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: LIME }} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Day detail panel */}
          <Card>
            <SectionTitle>{selectedDay.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '340px', overflowY: 'auto' }}>

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
                  <div style={{ fontSize: '10px', fontWeight: '700', color: dark ? LIME : '#5c7a1f', marginBottom: '6px' }}>RESERVATIONS</div>
                  {dayReservations.map(r => (
                    <div key={r.id} style={{ fontSize: '11px', color: TEXT, marginBottom: '4px' }}>
                      • {r.guestName || 'Guest'} — Room {r.roomNumber || '—'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}