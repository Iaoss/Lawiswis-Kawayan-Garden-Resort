import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useSettings } from '../components/SettingsContext';

export default function Reports() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  const BG     = dark ? '#020b09' : '#f4f6f4';   // page background
  const CARD   = dark ? '#1c1c1c' : '#ffffff';   // card/table background
  const CARD2  = dark ? '#282827' : '#f9fafb';   // input/header-row background
  const BORDER = dark ? '#2a2a28' : '#e5e7eb';
  const TEXT   = dark ? '#f0f0f0' : '#1f2937';   // primary text
  const SUBTEXT= dark ? '#c7c7c0' : '#4b5563';
  const MUTED  = dark ? '#9ca3af' : '#9ca3af';   // secondary text
  const TRACK  = dark ? '#282827' : '#f3f4f6';   // progress bar track
  const HOVER_BG = dark ? '#242422' : '#f9fafb';

  // Two-tone stat/text colors: dark = lighter/desaturated, light = saturated
  const GREEN = dark ? '#86efac' : '#16a34a';
  const BLUE  = dark ? '#93c5fd' : '#2563eb';
  const RED   = dark ? '#fca5a5' : '#dc2626';
  const GRAY  = dark ? '#c7c7c0' : '#4b5563';

  const STATUS_BG   = dark ? '#1e3a5f' : '#dbeafe';
  const STATUS_TEXT = dark ? '#93c5fd' : '#1d4ed8';
  const RATE_BG      = dark ? '#1e3a5f' : '#eff6ff';
  const RATE_TEXT    = dark ? '#93c5fd' : '#1d4ed8';

  const [reservations, setReservations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const resSnap = await getDocs(collection(db, 'reservations'));
      const roomSnap = await getDocs(collection(db, 'rooms'));
      setReservations(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRooms(roomSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetch();
  }, []);

  const filtered = reservations.filter(r => {
    if (!dateFrom && !dateTo) return true;
    const checkIn = new Date(r.checkIn);
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    if (from && checkIn < from) return false;
    if (to && checkIn > to) return false;
    return true;
  });

  const totalRevenue = filtered.filter(r => r.paymentStatus === 'paid')
    .reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalReservations = filtered.length;
  const checkedOut = filtered.filter(r => r.status === 'checked-out').length;
  const cancelled = filtered.filter(r => r.status === 'cancelled').length;
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
    { label: 'Cancelled',           value: cancelled,                            color: RED },
  ];

  const occupancyRows = [
    { label: 'Occupied',    value: occupiedRooms, color: dark ? '#f87171' : '#f87171' },
    { label: 'Vacant',      value: vacantRooms,   color: dark ? '#4ade80' : '#4ade80' },
    { label: 'Cleaning',    value: rooms.filter(r => r.status === 'cleaning').length,    color: dark ? '#facc15' : '#facc15' },
    { label: 'Maintenance', value: rooms.filter(r => r.status === 'maintenance').length, color: dark ? '#9ca3af' : '#9ca3af' },
  ];

  return (
    <Layout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '22px' }}>Reports</h2>

        {/* Date Filter */}
        <div style={{ ...card, padding: '16px', marginBottom: '22px', display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: SUBTEXT }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
          </div>
          <button onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ background: CARD2, color: SUBTEXT, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            Clear
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '22px' }}>
          {summaryCards.map(c => (
            <div key={c.label} style={{ ...card, padding: '16px' }}>
              <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>{c.label}</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: c.color, margin: '4px 0 0' }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '22px' }}>
          {/* Room Occupancy */}
          <div style={{ ...card, padding: '22px' }}>
            <h3 style={{ fontWeight: '600', color: TEXT, marginBottom: '14px', fontSize: '14px' }}>Room Occupancy</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {occupancyRows.map(item => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: SUBTEXT }}>{item.label}</span>
                    <span style={{ fontWeight: '600', color: TEXT }}>{item.value} / {rooms.length}</span>
                  </div>
                  <div style={{ width: '100%', background: TRACK, borderRadius: '999px', height: '8px' }}>
                    <div style={{ background: item.color, height: '8px', borderRadius: '999px', width: rooms.length > 0 ? `${(item.value / rooms.length) * 100}%` : '0%' }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '8px', background: RATE_BG, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>Occupancy Rate</p>
                <p style={{ fontSize: '28px', fontWeight: '700', color: RATE_TEXT, margin: '2px 0 0' }}>{occupancyRate}%</p>
              </div>
            </div>
          </div>

          {/* Reservations by Room Type */}
          <div style={{ ...card, padding: '22px' }}>
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
                      <div style={{ background: BLUE, height: '8px', borderRadius: '999px', width: `${(count / totalReservations) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reservation Table */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: CARD2, borderBottom: `1px solid ${BORDER}` }}>
            <h3 style={{ fontWeight: '600', color: SUBTEXT, fontSize: '13px', margin: 0 }}>Reservation Details ({filtered.length})</h3>
          </div>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead style={{ background: CARD2 }}>
              <tr>
                {['Guest', 'Room', 'Check-in', 'Check-out', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px 0', color: MUTED }}>No data found.</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>{r.guestName}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>Room {r.roomNumber}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkIn}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkOut}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                      <span style={{ background: STATUS_BG, color: STATUS_TEXT, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>{r.status}</span>
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