import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Layout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { getReservationRemarks } from '../../lib/reservationRemarks';
import { getVatBreakdown } from '../../lib/bookingPricing';
import { getStayTimingDetails } from '../../lib/stayTimes';
import { money } from '../lib/money';
import { useNavigate, useLocation } from 'react-router-dom';
import { formatManilaTime, getScheduledCheckOutMs } from '../../lib/reservationStatus';

const STATUS_OPTIONS = [
  ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['checked-in', 'Checked In'],
  ['checked-out', 'Checked Out'], ['cancelled', 'Cancelled'],
];
const VALID_REVENUE_STATUSES = ['confirmed', 'checked-in', 'checked-out'];
const DONUT_COLORS = ['#86d6b4', '#9cb56f', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#facc15'];

const pad = n => String(n).padStart(2, '0');
const localKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Normalises strings, Dates and Firestore Timestamps to a local YYYY-MM-DD key ('' if invalid).
function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && value.length === 10) return value;
  let date;
  if (typeof value.toDate === 'function') date = value.toDate();
  else if (typeof value.seconds === 'number') date = new Date(value.seconds * 1000);
  else date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localKey(date);
}

function isWithinRange(value, start, end) {
  if (!start && !end) return true;
  const key = toDateKey(value);
  if (!key) return false;
  return (!start || key >= start) && (!end || key <= end);
}

const normalizeStatus = status => String(status || 'pending').toLowerCase().trim().replace(/[\s_]+/g, '-');
const getDateBooked = r => r.createdAt || r.dateBooked;
const roomLabel = r => String(r.roomName || r.roomNumber || '').trim();

export default function Reports() {
  const { settings, formatDate } = useSettings();
  const dark = settings?.darkMode;

  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f9fafb';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#1f2937';
  const SUBTEXT = dark ? '#c7c7c0' : '#4b5563';
  const MUTED   = '#9ca3af';
  const TRACK   = dark ? '#282827' : '#eef2ea';
  const HOVER_BG = dark ? '#242422' : '#f9fafb';
  const ACCENT  = settings?.accentColor || '#9cb56f';

  // Dashboard-style gradient stat tiles
  const GRADIENTS = {
    revenue:  'linear-gradient(135deg, #7be0c8 0%, #b5f0e0 100%)',
    bookings: 'linear-gradient(135deg, #a5a6f6 0%, #d9d6fb 100%)',
    checkout: 'linear-gradient(135deg, #fb923c 0%, #fdba9b 100%)',
    cancel:   'linear-gradient(135deg, #f9a8a8 0%, #fcd5d5 100%)',
    occupancy:'linear-gradient(135deg, #d6a86c 0%, #f0cfa0 100%)',
  };

  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [checkInPreset, setCheckInPreset] = useState('all');
  const [checkInStart, setCheckInStart] = useState('');
  const [checkInEnd, setCheckInEnd] = useState('');
  // Which date the range filters: when guests arrive, or when they booked.
  const [dateField, setDateField] = useState('checkIn');
  const navigate = useNavigate();
  const location = useLocation();
  const portal = location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [roomFilter, setRoomFilter] = useState('all');
  // Adds the actual check-in / check-out times to the table (and the print).
  const [showStayTimes, setShowStayTimes] = useState(false);
  const [sortBy, setSortBy] = useState('checkIn');
  const [sortDirection, setSortDirection] = useState('desc');
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    const fetch = async () => {
      const resSnap = await getDocs(collection(db, 'reservations'));
      const roomSnap = await getDocs(collection(db, 'rooms'));
      setReservations(resSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.type !== 'corporate-room'));
      setRooms(roomSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetch();
  }, []);

  const presetRange = (() => {
    const now = new Date();
    if (checkInPreset === 'today') return [toDateKey(now), toDateKey(now)];
    if (checkInPreset === 'week') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return [toDateKey(start), toDateKey(end)];
    }
    if (checkInPreset === 'month') {
      return [toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    }
    if (checkInPreset === 'custom') return [checkInStart, checkInEnd];
    return ['', ''];
  })();
  const [checkInFrom, checkInTo] = presetRange;

  const roomOptions = [...new Set([
    ...rooms.map(r => roomLabel(r)),
    ...reservations.map(r => roomLabel(r)),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const filtered = reservations.filter(r => {
    const matchesStatus = statusFilter === 'all' || normalizeStatus(r.status) === statusFilter;
    const matchesDates = isWithinRange(dateField === 'booked' ? getDateBooked(r) : r.checkIn, checkInFrom, checkInTo);
    const matchesRoom = roomFilter === 'all' || roomLabel(r) === roomFilter;
    return matchesStatus && matchesDates && matchesRoom;
  });

  // Checked-in guests whose check-out time has come (or is within 30 min).
  const readyToCheckOut = reservations
    .filter(r => normalizeStatus(r.status) === 'checked-in')
    .map(r => ({ r, due: getScheduledCheckOutMs(r) }))
    .filter(({ due }) => due && due - now <= 30 * 60000)
    .sort((a, b) => a.due - b.due);

  // Guests checked out while still owing money, with the reason staff gave.
  const unpaidCheckouts = filtered.filter(r => Number(r.checkedOutWithBalance) > 0);
  const unpaidTotal = unpaidCheckouts.reduce((sum, r) => sum + Number(r.checkedOutWithBalance || 0), 0);
  const remarkTone = tone => ({
    red: { color: dark ? '#fca5a5' : '#b91c1c' },
    amber: { color: dark ? '#fcd34d' : '#92400e' },
    green: { color: dark ? '#86efac' : '#15803d' },
  })[tone] || { color: SUBTEXT };

  const sortValue = (r, key) => {
    if (key === 'totalAmount') return Number(r.totalAmount) || 0;
    if (key === 'checkIn' || key === 'checkOut') return toDateKey(r[key]);
    if (key === 'dateBooked') return toDateKey(getDateBooked(r));
    if (key === 'roomNumber') return roomLabel(r);
    if (key === 'status') return normalizeStatus(r.status);
    if (key === 'remarks') return getReservationRemarks(r).map(item => item.label).join(' ');
    if (key === 'checkedInAt' || key === 'checkedOutAt') return Number(r[key]?.seconds || r[key]?._seconds || 0);
    if (key === 'stayLength') {
      const inS = Number(r.checkedInAt?.seconds || 0);
      const outS = Number(r.checkedOutAt?.seconds || 0);
      return inS && outS ? outS - inS : 0;
    }
    return String(r[key] ?? '').toLocaleLowerCase();
  };
  const sortedReservations = [...filtered].sort((left, right) => {
    const a = sortValue(left, sortBy);
    const b = sortValue(right, sortBy);
    const comparison = typeof a === 'number' ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const toggleSort = key => {
    if (sortBy === key) setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortDirection(['checkIn', 'checkOut', 'dateBooked'].includes(key) ? 'desc' : 'asc');
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setCheckInPreset('all');
    setCheckInStart('');
    setCheckInEnd('');
    setDateField('checkIn');
    setRoomFilter('all');
    setShowStayTimes(false);
  };

  const filterSummary = [
    `Status: ${statusFilter === 'all' ? 'All' : STATUS_OPTIONS.find(([value]) => value === statusFilter)?.[1]}`,
    `${dateField === 'booked' ? 'Date booked' : 'Check-in'}: ${checkInFrom || checkInTo ? `${checkInFrom || 'Any'} to ${checkInTo || 'Any'}` : 'All dates'}`,
    `Room: ${roomFilter === 'all' ? 'All rooms' : roomFilter}`,
    ...(showStayTimes ? ['Showing actual check-in/out times'] : []),
  ].join(' | ');

  const reservationStatusStyle = status => {
    const colors = {
      confirmed: ['#dcfce7', '#15803d'],
      cancelled: ['#fee2e2', '#b91c1c'],
      pending: ['#fef3c7', '#b45309'],
      'checked-out': ['#f3f4f6', '#4b5563'],
      'checked-in': ['#dbeafe', '#1d4ed8'],
    };
    const pair = colors[normalizeStatus(status)] || colors.pending;
    return { background: pair[0], color: pair[1] };
  };

  const totalRevenue = filtered.filter(r => VALID_REVENUE_STATUSES.includes(normalizeStatus(r.status)))
    .reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const totalReservations = filtered.length;
  const checkedOut = filtered.filter(r => normalizeStatus(r.status) === 'checked-out').length;
  const cancelledCount = filtered.filter(r => normalizeStatus(r.status) === 'cancelled').length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const vacantRooms = rooms.filter(r => r.status === 'vacant' || r.status === 'available').length;
  const cleaningRooms = rooms.filter(r => r.status === 'cleaning').length;
  const maintenanceRooms = rooms.filter(r => r.status === 'maintenance').length;
  const occupancyRate = rooms.length > 0 ? Math.round((occupiedRooms / rooms.length) * 100) : 0;

  // Room type breakdown
  const roomTypeBreakdown = {};
  filtered.forEach(r => {
    if (r.roomType) roomTypeBreakdown[r.roomType] = (roomTypeBreakdown[r.roomType] || 0) + 1;
  });
  const roomTypeEntries = Object.entries(roomTypeBreakdown).sort((a, b) => b[1] - a[1]);
  const roomTypeTotal = roomTypeEntries.reduce((s, [, c]) => s + c, 0);
  let acc = 0;
  const donutGradient = roomTypeTotal
    ? `conic-gradient(${roomTypeEntries.map(([, c], i) => {
        const from = (acc / roomTypeTotal) * 100;
        acc += c;
        const to = (acc / roomTypeTotal) * 100;
        return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}% ${to}%`;
      }).join(', ')})`
    : `conic-gradient(${TRACK} 0 100%)`;

  // Status breakdown (count + amount)
  const statusBreakdown = STATUS_OPTIONS.map(([value, label]) => {
    const rows = filtered.filter(r => normalizeStatus(r.status) === value);
    return { value, label, count: rows.length, amount: rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0) };
  });
  const statusBarColors = { pending: '#facc15', confirmed: '#86d6b4', 'checked-in': '#60a5fa', 'checked-out': '#9cb56f', cancelled: '#f87171' };

  const occupancyRows = [
    { label: 'Occupied',    value: occupiedRooms,    color: ACCENT },
    { label: 'Available',   value: vacantRooms,      color: '#e6f4a0' },
    { label: 'Cleaning',    value: cleaningRooms,    color: '#facc15' },
    { label: 'Maintenance', value: maintenanceRooms, color: '#9ca3af' },
  ];

  const summaryCards = [
    { label: 'Total Revenue',      value: `${money(totalRevenue)}`, icon: 'ti-cash',            bg: GRADIENTS.revenue,
      note: `Incl. 12% VAT ${money(getVatBreakdown(totalRevenue).vat)} · net ${money(getVatBreakdown(totalRevenue).net)}` },
    { label: 'Total Reservations', value: totalReservations,                   icon: 'ti-calendar-event',  bg: GRADIENTS.bookings },
    { label: 'Checked Out',        value: checkedOut,                          icon: 'ti-logout',          bg: GRADIENTS.checkout },
    { label: 'Cancelled',          value: cancelledCount,                      icon: 'ti-calendar-off',    bg: GRADIENTS.cancel },
    { label: 'Occupancy Rate',     value: `${occupancyRate}%`,                 icon: 'ti-building',        bg: GRADIENTS.occupancy },
  ];

  /* ── shared styles ── */
  const card = { background: CARD, borderRadius: '16px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.04)' };
  const cardTitle = { fontWeight: 700, color: TEXT, margin: 0, fontSize: '15px' };
  const pill = { background: ACCENT, color: '#fff', borderRadius: '8px', padding: '4px 12px', fontSize: '11px', fontWeight: 600 };
  const inp = {
    border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '8px 12px',
    fontSize: '13px', fontFamily: "'Poppins', sans-serif", marginTop: '4px',
    background: CARD2, color: TEXT, outline: 'none', display: 'block',
  };
  const lbl = { fontSize: '12px', color: SUBTEXT };

  return (
    <Layout>
      <style>{`
        .report-print-header { display: none; }
        @media (max-width: 1000px) { .report-two-col, .report-three-col { grid-template-columns: 1fr !important; } }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .report-print-controls, .report-screen-only, .report-sort-icon { display: none !important; }
          .report-print-root { background: #fff !important; min-height: 0 !important; padding: 0 !important; font-family: Arial, Helvetica, sans-serif !important; }
          .report-print-root, .report-print-root * { color: #111 !important; box-shadow: none !important; text-shadow: none !important; }
          .report-print-header { display: block !important; border-bottom: 2px solid #173d2a; margin-bottom: 12px; padding-bottom: 10px; }
          .report-print-root .report-print-header h1 { font-size: 18pt; margin: 0; color: #173d2a !important; }
          .report-print-header h2 { font-size: 12pt; font-weight: 600; margin: 2px 0 8px; }
          .report-print-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 8.5pt; }
          .report-print-meta span { border: 1px solid #b7c5bb; padding: 5px 8px; }
          .report-summary-grid { grid-template-columns: repeat(5, 1fr) !important; gap: 6px !important; margin-bottom: 10px !important; }
          .report-summary-card { background: #fff !important; border: 1px solid #9ca3af !important; border-radius: 0 !important; padding: 7px 9px !important; min-height: 0 !important; break-inside: avoid; }
          .report-summary-card .report-icon { display: none !important; }
          .report-summary-card .report-card-label { font-size: 8pt !important; }
          .report-summary-card .report-card-value { font-size: 14pt !important; margin-top: 2px !important; }
          .report-summary-card .report-card-note { font-size: 7pt !important; }
          .report-two-col { grid-template-columns: 1fr 1fr !important; gap: 10px !important; margin-bottom: 10px !important; }
          .report-three-col { grid-template-columns: repeat(5, 1fr) !important; gap: 10px !important; }
          .report-print-section { background: #fff !important; border: 1px solid #9ca3af !important; border-radius: 0 !important; padding: 10px 12px !important; margin-bottom: 10px !important; overflow: visible !important; }
          .report-keep { break-inside: avoid; }
          .report-print-section h3 { font-size: 11pt !important; margin-bottom: 8px !important; }
          .report-donut { width: 90px !important; height: 90px !important; }
          .report-donut-hole { width: 54px !important; height: 54px !important; background: #fff !important; }
          .report-table-wrap { overflow: visible !important; }
          .report-print-table { width: 100% !important; font-size: 8pt !important; border-collapse: collapse !important; }
          .report-print-table thead { display: table-header-group; background: none !important; }
          .report-print-table tr { break-inside: avoid; background: transparent !important; }
          .report-print-root .report-print-table th, .report-print-root .report-print-table th * { background: #173d2a !important; color: #fff !important; }
          .report-print-table th { padding: 5px 6px !important; border: 1px solid #173d2a !important; font-size: 8pt !important; }
          .report-print-table td { padding: 4px 6px !important; border: 1px solid #cbd5d0 !important; min-width: 0 !important; vertical-align: top; }
          .report-print-table tbody tr:nth-child(even) td { background: #f1f5f2 !important; }
          .report-print-table th button { cursor: default !important; }
          .report-print-table .report-status-pill { padding: 0 !important; background: none !important; font-weight: 700; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="report-print-root" style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '24px' }}>
        <header className="report-print-header">
          <h1>Lawiswis Kawayan Garden Resort</h1>
          <h2>Operational &amp; Occupancy Performance Report</h2>
          <div className="report-print-meta">
            <span><strong>Generated:</strong> {generatedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</span>
            <span><strong>Generated by:</strong> {auth.currentUser?.displayName || auth.currentUser?.email || 'Staff'}</span>
            <span style={{ gridColumn: '1 / -1' }}><strong>Filters:</strong> {filterSummary}</span>
          </div>
        </header>

        {/* Title bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div className="report-screen-only">
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: TEXT, margin: 0 }}>Reports</h2>
            <p style={{ fontSize: '12px', color: MUTED, margin: '2px 0 0' }}>HuaPro Resort Management System · {generatedAt.toLocaleDateString()}</p>
          </div>
          <button className="report-print-controls" type="button" onClick={() => window.print()}
            style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <i className="ti ti-printer" style={{ marginRight: '7px' }} />Print Detailed Report
          </button>
        </div>

        {readyToCheckOut.length > 0 && (
          <div className="report-print-controls" style={{ ...card, padding: '12px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderColor: '#f59e0b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: dark ? '#fbbf24' : '#b45309' }}>
              <i className="ti ti-door-exit" /> Guest{readyToCheckOut.length === 1 ? '' : 's'} ready to check out ({readyToCheckOut.length})
            </span>
            {readyToCheckOut.map(({ r, due }) => {
              const late = now > due;
              return (
                <button key={r.id} type="button" onClick={() => navigate(`${portal}/billing?booking=${encodeURIComponent(r.id)}&from=reports`)}
                  title="Open the bill to check this guest out"
                  style={{ background: late ? (dark ? '#3b1d1d' : '#fef2f2') : (dark ? '#3a2a0d' : '#fffbeb'), color: late ? (dark ? '#fca5a5' : '#b91c1c') : (dark ? '#fcd34d' : '#92400e'), border: `1px solid ${late ? '#f87171' : '#fbbf24'}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  {r.guestName || 'Guest'} · {roomLabel(r) || 'Room'} · {late ? 'was due' : 'due'} {formatManilaTime(due)}
                </button>
              );
            })}
          </div>
        )}

        {/* Summary tiles */}
        <div className="report-summary-grid keep-columns" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {summaryCards.map(c => (
            <div key={c.label} className="report-summary-card" style={{ background: c.bg, borderRadius: '16px', padding: '18px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: '104px' }}>
              <span className="report-icon" style={{ position: 'absolute', top: '14px', right: '14px', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <i className={`ti ${c.icon}`} style={{ fontSize: '18px' }} />
              </span>
              <p className="report-card-label" style={{ fontSize: '12px', margin: 0, opacity: 0.9 }}>{c.label}</p>
              <p className="report-card-value" style={{ fontSize: '28px', fontWeight: 700, margin: '8px 0 0', lineHeight: 1.1 }}>{c.value}</p>
              {c.note && <p className="report-card-note" style={{ fontSize: '10.5px', margin: '6px 0 0', opacity: 0.9 }}>{c.note}</p>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="report-print-controls" style={{ ...card, padding: '16px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={lbl}>Reservation Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Room / Category</label>
            <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="all">All Rooms</option>
              {roomOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Filter dates by</label>
            <select value={dateField} onChange={e => setDateField(e.target.value)} style={{ ...inp, width: '100%' }}
              title="Check-in date: when guests arrive. Date booked: when the booking was made.">
              <option value="checkIn">Check-in date (arrivals)</option>
              <option value="booked">Date booked (new bookings)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Dates</label>
            <select value={checkInPreset} onChange={e => setCheckInPreset(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {checkInPreset === 'custom' && (
            <>
              <div>
                <label style={lbl}>From</label>
                <input type="date" value={checkInStart} max={checkInEnd || undefined} onChange={e => setCheckInStart(e.target.value)} style={{ ...inp, width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>To</label>
                <input type="date" value={checkInEnd} min={checkInStart || undefined} onChange={e => setCheckInEnd(e.target.value)} style={{ ...inp, width: '100%' }} />
              </div>
            </>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: TEXT, cursor: 'pointer', padding: '10px 0' }}>
            <input type="checkbox" checked={showStayTimes} onChange={e => setShowStayTimes(e.target.checked)} />
            Show actual check-in &amp; check-out times (early/late, time at the resort)
          </label>
          <button type="button" onClick={resetFilters}
            style={{ background: CARD2, color: SUBTEXT, border: `1px solid ${BORDER}`, padding: '10px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Reset Filters
          </button>
        </div>

        {/* Row: Room availability + Reservations by room type */}
        <div className="report-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div className="report-print-section report-keep" style={{ ...card, padding: '22px' }}>
            <h3 style={{ ...cardTitle, marginBottom: '16px' }}>Room Occupancy</h3>
            <div style={{ display: 'flex', height: '36px', borderRadius: '8px', overflow: 'hidden', background: TRACK, marginBottom: '18px' }}>
              {rooms.length > 0 && occupancyRows.map(item => (
                item.value > 0 && <div key={item.label} title={`${item.label}: ${item.value}`} style={{ width: `${(item.value / rooms.length) * 100}%`, background: item.color }} />
              ))}
            </div>
            <table className="report-print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '8px', color: MUTED, fontWeight: 500 }}>Status</th><th style={{ textAlign: 'right', padding: '8px', color: MUTED, fontWeight: 500 }}>Rooms</th><th style={{ textAlign: 'right', padding: '8px', color: MUTED, fontWeight: 500 }}>Share</th></tr></thead>
              <tbody>
                {occupancyRows.map(item => (
                  <tr key={item.label}>
                    <td style={{ padding: '8px', color: SUBTEXT }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: item.color, marginRight: '8px' }} />{item.label}
                    </td>
                    <td style={{ padding: '8px', color: TEXT, textAlign: 'right', fontWeight: 600 }}>{item.value} / {rooms.length}</td>
                    <td style={{ padding: '8px', color: TEXT, textAlign: 'right', fontWeight: 600 }}>{rooms.length ? `${Math.round((item.value / rooms.length) * 100)}%` : '0%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-print-section report-keep" style={{ ...card, padding: '22px' }}>
            <h3 style={{ ...cardTitle, marginBottom: '16px' }}>Reservations by Room Type</h3>
            {roomTypeEntries.length === 0 ? (
              <p style={{ color: MUTED, fontSize: '13px' }}>No data yet.</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
                <div className="report-donut" style={{ width: '150px', height: '150px', borderRadius: '50%', background: donutGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div className="report-donut-hole" style={{ width: '90px', height: '90px', borderRadius: '50%', background: CARD, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: TEXT, lineHeight: 1 }}>{roomTypeTotal}</span>
                    <span style={{ fontSize: '10px', color: MUTED }}>reservations</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {roomTypeEntries.map(([type, count], i) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: SUBTEXT }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: DONUT_COLORS[i % DONUT_COLORS.length], marginRight: '8px' }} />{type}
                      </span>
                      <span style={{ fontWeight: 600, color: TEXT }}>{count} · {Math.round((count / roomTypeTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reservations by status */}
        <div className="report-print-section report-keep" style={{ ...card, padding: '22px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={cardTitle}>Reservations by Status</h3>
            <span className="report-print-controls" style={pill}>{totalReservations} total</span>
          </div>
          <div className="report-three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '18px' }}>
            {statusBreakdown.map(s => (
              <div key={s.value}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: SUBTEXT }}>{s.label}</span>
                  <span style={{ fontWeight: 600, color: TEXT }}>{s.count}</span>
                </div>
                <div style={{ width: '100%', background: TRACK, borderRadius: '999px', height: '8px' }}>
                  <div style={{ background: statusBarColors[s.value], height: '8px', borderRadius: '999px', width: `${totalReservations ? (s.count / totalReservations) * 100 : 0}%` }} />
                </div>
                <p style={{ fontSize: '11px', color: MUTED, margin: '6px 0 0' }}>{money(s.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Unpaid check-outs */}
        <div className="report-print-section" style={{ ...card, padding: '22px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
            <h3 style={cardTitle}>Checked Out with Unpaid Balance</h3>
            <span style={{ fontSize: '12px', color: SUBTEXT }}>
              {unpaidCheckouts.length} guest{unpaidCheckouts.length === 1 ? '' : 's'} · {money(unpaidTotal)} unpaid
            </span>
          </div>
          {unpaidCheckouts.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: MUTED }}>No guests were checked out with an unpaid balance in this period.</p>
          ) : (
            <div className="report-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="report-print-table" style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Guest', 'Check-out', 'Unpaid', 'Reason', 'Approved by'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: SUBTEXT, fontWeight: 600, fontSize: '11.5px', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unpaidCheckouts.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: TEXT }}>{r.guestName}</td>
                      <td style={{ padding: '9px 12px', color: TEXT }}>{formatDate(r.checkOut)}</td>
                      <td style={{ padding: '9px 12px', color: dark ? '#fca5a5' : '#b91c1c', fontWeight: 600 }}>{money(Number(r.checkedOutWithBalance))}</td>
                      <td style={{ padding: '9px 12px', color: TEXT }}>{r.checkedOutWithBalanceReason || 'No reason recorded'}</td>
                      <td style={{ padding: '9px 12px', color: SUBTEXT }}>{r.checkedOutWithBalanceByName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reservation table */}
        <div className="report-print-section" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <h3 style={cardTitle}>Reservation Details ({filtered.length})</h3>
          </div>
          <div className="report-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="report-print-table" style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead style={{ background: CARD2 }}>
                <tr>
                  {[
                    ['Guest', 'guestName'],
                    ['Room', 'roomNumber'],
                    ['Date Booked', 'dateBooked'],
                    ['Check-in', 'checkIn'],
                    ['Check-out', 'checkOut'],
                    ...(showStayTimes ? [['Actual check-in', 'checkedInAt'], ['Actual check-out', 'checkedOutAt'], ['Time at resort', 'stayLength']] : []),
                    ['Amount', 'totalAmount'],
                    ['Status', 'status'],
                    ['Remarks', 'remarks'],
                  ].map(([heading, key]) => (
                    <th key={heading} aria-sort={sortBy === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: 600, fontSize: '12px' }}>
                      <button type="button" onClick={() => toggleSort(key)}
                        style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', cursor: 'pointer' }}>
                        {heading}<span className="report-sort-icon">{sortBy === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={showStayTimes ? 11 : 8} style={{ textAlign: 'center', padding: '24px 0', color: MUTED }}>No reservations found matching the selected filters.</td></tr>
                ) : (
                  sortedReservations.map(r => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: TEXT }}>{r.guestName}</td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>{roomLabel(r) ? (/^\d+$/.test(roomLabel(r)) ? `Room ${roomLabel(r)}` : roomLabel(r)) : '—'}</td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>{toDateKey(getDateBooked(r)) || '—'}</td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>
                        {formatDate(r.checkIn)}
                        {r.checkInTime && <div style={{ fontSize: '11px', color: SUBTEXT, marginTop: '2px' }}>{r.checkInTime}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', color: TEXT }}>
                        {formatDate(r.checkOut)}
                        {r.checkOutTime && <div style={{ fontSize: '11px', color: SUBTEXT, marginTop: '2px' }}>{r.checkOutTime}</div>}
                      </td>
                      {showStayTimes && (() => {
                        const timing = getStayTimingDetails(r);
                        const note = part => part.text && (
                          <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600, color: part.tone === 'late' ? (dark ? '#fcd34d' : '#b45309') : (dark ? '#86efac' : '#15803d') }}>{part.text}</div>
                        );
                        return (
                          <>
                            <td style={{ padding: '12px 16px', color: TEXT, minWidth: '150px' }}>{timing.checkIn.actual || <span style={{ color: MUTED }}>Not checked in</span>}{note(timing.checkIn)}</td>
                            <td style={{ padding: '12px 16px', color: TEXT, minWidth: '150px' }}>{timing.checkOut.actual || <span style={{ color: MUTED }}>Not checked out</span>}{note(timing.checkOut)}</td>
                            <td style={{ padding: '12px 16px', color: TEXT }}>{timing.duration || '—'}</td>
                          </>
                        );
                      })()}
                      <td style={{ padding: '12px 16px', color: TEXT }}>{money(Number(r.totalAmount || 0))}</td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                        <span className="report-status-pill" style={{ ...reservationStatusStyle(r.status), padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{String(r.status || 'pending').replace(/-/g, ' ')}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '11.5px', minWidth: '220px' }}>
                        {getReservationRemarks(r).length === 0 ? <span style={{ color: MUTED }}>—</span> : getReservationRemarks(r).map(item => (
                          <div key={item.type} style={{ marginBottom: '3px', ...remarkTone(item.tone) }}>
                            <strong>{item.label}:</strong> <span style={{ color: TEXT }}>{item.text}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}