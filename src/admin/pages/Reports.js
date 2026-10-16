import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';

const STATUS_OPTIONS = [
  ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['checked-in', 'Checked In'],
  ['checked-out', 'Checked Out'], ['cancelled', 'Cancelled'],
];
const VALID_REVENUE_STATUSES = ['confirmed', 'checked-in', 'checked-out'];

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
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const BG     = dark ? '#020b09' : '#f4f6f4';   // page background
  const CARD   = dark ? '#1c1c1c' : '#ffffff';   // card/table background
  const CARD2  = dark ? '#282827' : '#f9fafb';   // input/header-row background
  const BORDER = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT   = dark ? '#f0f0f0' : '#1f2937';   // primary text
  const SUBTEXT= dark ? '#c7c7c0' : '#4b5563';
  const ACCENT = settings?.accentColor || '#9cb56f';
  const MUTED  = dark ? '#9ca3af' : '#9ca3af';   // secondary text
  const TRACK  = dark ? '#282827' : '#f3f4f6';   // progress bar track
  const HOVER_BG = dark ? '#242422' : '#f9fafb';

  // Two-tone stat/text colors: dark = lighter/desaturated, light = saturated
  const GREEN = dark ? '#86efac' : '#16a34a';
  const BLUE  = dark ? '#93c5fd' : '#2563eb';
  const GRAY  = dark ? '#c7c7c0' : '#4b5563';

  const RATE_TEXT    = dark ? '#93c5fd' : '#1d4ed8';

  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [checkInPreset, setCheckInPreset] = useState('all');
  const [checkInStart, setCheckInStart] = useState('');
  const [checkInEnd, setCheckInEnd] = useState('');
  const [bookedStart, setBookedStart] = useState('');
  const [bookedEnd, setBookedEnd] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [sortBy, setSortBy] = useState('checkIn');
  const [sortDirection, setSortDirection] = useState('desc');
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    const fetch = async () => {
      const resSnap = await getDocs(collection(db, 'reservations'));
      const roomSnap = await getDocs(collection(db, 'rooms'));
      setReservations(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const matchesCheckIn = isWithinRange(r.checkIn, checkInFrom, checkInTo);
    const matchesDateBooked = isWithinRange(getDateBooked(r), bookedStart, bookedEnd);
    const matchesRoom = roomFilter === 'all' || roomLabel(r) === roomFilter;
    return matchesStatus && matchesCheckIn && matchesDateBooked && matchesRoom;
  });

  const sortValue = (r, key) => {
    if (key === 'totalAmount') return Number(r.totalAmount) || 0;
    if (key === 'checkIn' || key === 'checkOut') return toDateKey(r[key]);
    if (key === 'dateBooked') return toDateKey(getDateBooked(r));
    if (key === 'roomNumber') return roomLabel(r);
    if (key === 'status') return normalizeStatus(r.status);
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
    setBookedStart('');
    setBookedEnd('');
    setRoomFilter('all');
  };

  const filterSummary = [
    `Status: ${statusFilter === 'all' ? 'All' : STATUS_OPTIONS.find(([value]) => value === statusFilter)?.[1]}`,
    `Check-in: ${checkInFrom || checkInTo ? `${checkInFrom || 'Any'} to ${checkInTo || 'Any'}` : 'All dates'}`,
    `Booked: ${bookedStart || bookedEnd ? `${bookedStart || 'Any'} to ${bookedEnd || 'Any'}` : 'All dates'}`,
    `Room: ${roomFilter === 'all' ? 'All rooms' : roomFilter}`,
  ].join(' | ');

  const reservationStatusStyle = status => {
    const colors = {
      confirmed: ['#dcfce7', '#15803d'],
      cancelled: ['#fee2e2', '#b91c1c'],
      pending: ['#fef3c7', '#b45309'],
      'checked-out': ['#f3f4f6', '#4b5563'],
      'checked-in': ['#dbeafe', '#1d4ed8'],
    };
    const pair = colors[String(status || '').toLowerCase()] || colors.pending;
    return { background: pair[0], color: pair[1] };
  };

  const totalRevenue = filtered.filter(r => VALID_REVENUE_STATUSES.includes(normalizeStatus(r.status)))
    .reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const totalReservations = filtered.length;
  const checkedOut = filtered.filter(r => normalizeStatus(r.status) === 'checked-out').length;
  const cancelledCount = filtered.filter(r => normalizeStatus(r.status) === 'cancelled').length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const vacantRooms = rooms.filter(r => r.status === 'vacant' || r.status === 'available').length;
  const occupancyRate = rooms.length > 0 ? Math.round((occupiedRooms / rooms.length) * 100) : 0;

  // Room type breakdown
  const roomTypeBreakdown = {};
  filtered.forEach(r => {
    if (r.roomType) {
      roomTypeBreakdown[r.roomType] = (roomTypeBreakdown[r.roomType] || 0) + 1;
    }
  });

  /* ── shared styles ── */
  const card = { background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)' };
  const inp = {
    border: `1px solid ${BORDER}`, borderRadius: '8px', padding: '8px 12px',
    fontSize: '13px', fontFamily: "'Poppins', sans-serif", marginTop: '4px',
    background: CARD2, color: TEXT, outline: 'none', display: 'block',
  };

  const summaryCards = [
    { label: 'Total Revenue',       value: `₱${totalRevenue.toLocaleString()}`, color: GREEN },
    { label: 'Total Reservations',  value: totalReservations,                    color: BLUE },
    { label: 'Checked Out',         value: checkedOut,                           color: GRAY },
    { label: 'Cancelled',           value: cancelledCount,                       color: dark ? '#f87171' : '#dc2626' },
    { label: 'Occupancy Rate',      value: `${occupancyRate}%`,                  color: RATE_TEXT },
  ];

  const occupancyRows = [
    { label: 'Occupied',    value: occupiedRooms, color: dark ? '#f87171' : '#f87171' },
    { label: 'Vacant',      value: vacantRooms,   color: dark ? '#4ade80' : '#4ade80' },
    { label: 'Cleaning',    value: rooms.filter(r => r.status === 'cleaning').length,    color: dark ? '#facc15' : '#facc15' },
    { label: 'Maintenance', value: rooms.filter(r => r.status === 'maintenance').length, color: dark ? '#9ca3af' : '#9ca3af' },
  ];

  return (
    <Layout>
      <style>{`
        .report-print-header { display: none; }
        @page { size: auto; margin: 15mm; }
        @media print {
          .report-print-controls, .portal-sidebar, .sidebar, nav { display: none !important; }
          .report-print-root { background: #fff !important; color: #111 !important; min-height: 0 !important; padding: 0 !important; }
          .report-print-header { display: block !important; border-bottom: 2px solid #173d2a; margin-bottom: 18px; padding-bottom: 12px; color: #111; }
          .report-print-header h1 { font-size: 20pt; margin: 0; color: #173d2a; }
          .report-print-header h2 { font-size: 13pt; font-weight: 600; margin: 4px 0 10px; }
          .report-print-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 8.5pt; }
          .report-print-meta span { border: 1px solid #b7c5bb; padding: 6px 8px; }
          .report-summary-grid { grid-template-columns: repeat(5, 1fr) !important; gap: 8px !important; margin-bottom: 16px !important; }
          .report-summary-card { background: #fff !important; border: 1px solid #222 !important; border-radius: 0 !important; box-shadow: none !important; padding: 10px !important; }
          .report-summary-card p { color: #111 !important; }
          .report-summary-card p:last-child { font-size: 16pt !important; }
          .report-print-section { background: #fff !important; border: 1px solid #222 !important; border-radius: 0 !important; box-shadow: none !important; break-inside: avoid; }
          .report-print-section h3 { color: #111 !important; }
          .report-print-table { width: 100% !important; font-size: 8.5pt !important; }
          .report-print-table th { background: #173d2a !important; color: #fff !important; padding: 7px !important; }
          .report-print-table td { color: #111 !important; padding: 6px 7px !important; border-color: #cbd5d0 !important; }
          .report-print-table tbody tr:nth-child(even) { background: #f1f5f2 !important; }
          .report-print-table th button { cursor: default !important; }
          .report-screen-only { display: none !important; }
        }
      `}</style>
      <div className="report-print-root" style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <header className="report-print-header">
          <h1>Lawiswis Kawayan Garden Resort</h1>
          <h2>Operational &amp; Occupancy Performance Report</h2>
          <div className="report-print-meta">
            <span><strong>Generated:</strong> {generatedAt.toLocaleString()}</span>
            <span><strong>Generated by:</strong> Admin</span>
            <span style={{ gridColumn: '1 / -1' }}><strong>Filters:</strong> {filterSummary}</span>
          </div>
        </header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
          <h2 className="report-screen-only" style={{ fontSize: '22px', fontWeight: '700', color: TEXT, margin: 0 }}>Reports</h2>
          <button className="report-print-controls" type="button" onClick={() => window.print()}
            style={{ background: ACCENT, color: '#0a1a0a', border: 'none', borderRadius: '8px', padding: '9px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <i className="ti ti-printer" style={{ marginRight: '7px' }} />Print Detailed Report
          </button>
        </div>

        {/* Filters */}
        <div className="report-print-controls" style={{ ...card, padding: '16px', marginBottom: '22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>Reservation Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>Room / Category</label>
            <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inp, width: '100%' }}>
              <option value="all">All Rooms</option>
              {roomOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>Check-in Range</label>
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
                <label style={{ fontSize: '12px', color: SUBTEXT }}>Check-in From</label>
                <input type="date" value={checkInStart} max={checkInEnd || undefined} onChange={e => setCheckInStart(e.target.value)} style={{ ...inp, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: SUBTEXT }}>Check-in To</label>
                <input type="date" value={checkInEnd} min={checkInStart || undefined} onChange={e => setCheckInEnd(e.target.value)} style={{ ...inp, width: '100%' }} />
              </div>
            </>
          )}
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>Date Booked From</label>
            <input type="date" value={bookedStart} max={bookedEnd || undefined} onChange={e => setBookedStart(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>Date Booked To</label>
            <input type="date" value={bookedEnd} min={bookedStart || undefined} onChange={e => setBookedEnd(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <button type="button" onClick={resetFilters}
            style={{ background: CARD2, color: SUBTEXT, border: `1px solid ${BORDER}`, padding: '9px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Reset Filters
          </button>
        </div>

        {/* Summary Cards */}
        <div className="report-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px', marginBottom: '22px' }}>
          {summaryCards.map(c => (
            <div key={c.label} className="report-summary-card" style={{ ...card, padding: '16px' }}>
              <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>{c.label}</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: c.color, margin: '4px 0 0' }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '22px' }}>
          {/* Room Occupancy */}
          <div className="report-print-section" style={{ ...card, padding: '22px' }}>
            <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '14px', fontSize: '14px' }}>Room Occupancy Breakdown</h3>
            <table className="report-print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '8px' }}>Status</th><th style={{ textAlign: 'right', padding: '8px' }}>Rooms</th><th style={{ textAlign: 'right', padding: '8px' }}>Share</th></tr></thead>
              <tbody>
              {occupancyRows.map(item => (
                <tr key={item.label}>
                  <td style={{ padding: '8px', color: SUBTEXT }}>{item.label}</td>
                  <td style={{ padding: '8px', color: TEXT, textAlign: 'right', fontWeight: 600 }}>{item.value} / {rooms.length}</td>
                  <td style={{ padding: '8px', color: item.color, textAlign: 'right', fontWeight: 600 }}>{rooms.length ? `${Math.round((item.value / rooms.length) * 100)}%` : '0%'}</td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>

          {/* Reservations by Room Type */}
          <div className="report-print-section" style={{ ...card, padding: '22px' }}>
            <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '14px', fontSize: '14px' }}>Reservations by Room Type</h3>
            {Object.keys(roomTypeBreakdown).length === 0 ? (
              <p style={{ color: MUTED, fontSize: '13px' }}>No data yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(roomTypeBreakdown).map(([type, count]) => (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: SUBTEXT }}>{type}</span>
                      <span style={{ fontWeight: '600', color: TEXT }}>{count}</span>
                    </div>
                    <div style={{ width: '100%', background: TRACK, borderRadius: '999px', height: '8px' }}>
                      <div style={{ background: BLUE, height: '8px', borderRadius: '999px', width: `${totalReservations ? (count / totalReservations) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reservation Table */}
        <div className="report-print-section" style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: CARD2, borderBottom: `1px solid ${BORDER}` }}>
            <h3 style={{ fontWeight: '600', color: SUBTEXT, fontSize: '13px', margin: 0 }}>Reservation Details ({filtered.length})</h3>
          </div>
          <table className="report-print-table" style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead style={{ background: CARD2 }}>
              <tr>
                {[
                  ['Guest', 'guestName'],
                  ['Room', 'roomNumber'],
                  ['Date Booked', 'dateBooked'],
                  ['Check-in', 'checkIn'],
                  ['Check-out', 'checkOut'],
                  ['Amount', 'totalAmount'],
                  ['Status', 'status'],
                ].map(([heading, key]) => (
                  <th key={heading} aria-sort={sortBy === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                    <button type="button" onClick={() => toggleSort(key)}
                      style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', cursor: 'pointer' }}>
                      {heading}{sortBy === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px 0', color: MUTED }}>No reservations found matching the selected filters.</td></tr>
              ) : (
                sortedReservations.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>{r.guestName}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{roomLabel(r) ? (/^\d+$/.test(roomLabel(r)) ? `Room ${roomLabel(r)}` : roomLabel(r)) : '—'}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{toDateKey(getDateBooked(r)) || '—'}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkIn}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkOut}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                      <span style={{ ...reservationStatusStyle(r.status), padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{String(r.status || 'pending').replace(/-/g, ' ')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}