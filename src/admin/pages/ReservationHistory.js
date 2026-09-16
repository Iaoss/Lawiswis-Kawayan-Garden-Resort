import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';

export default function ReservationHistory() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
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

  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDocs(collection(db, 'reservations'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReservations(data);
    };
    fetch();
  }, []);

  const filtered = reservations.filter(r => {
    const matchSearch =
      r.guestName?.toLowerCase().includes(search.toLowerCase()) ||
      r.roomNumber?.includes(search) ||
      r.phone?.includes(search);
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  });

  // Badge colors: dark = saturated bg + light text, light = tinted bg + saturated text
  const badge = (kind) => {
    const map = {
      blue:   { dbg: '#1e3a5f', dtext: '#93c5fd', lbg: '#dbeafe', ltext: '#1d4ed8' },
      green:  { dbg: '#14532d', dtext: '#86efac', lbg: '#dcfce7', ltext: '#15803d' },
      gray:   { dbg: '#282827', dtext: '#9ca3af', lbg: '#f3f4f6', ltext: '#4b5563' },
      red:    { dbg: '#7f1d1d', dtext: '#fca5a5', lbg: '#fee2e2', ltext: '#b91c1c' },
      yellow: { dbg: '#78350f', dtext: '#fde68a', lbg: '#fef3c7', ltext: '#b45309' },
      purple: { dbg: '#2d1b4e', dtext: '#c4b5fd', lbg: '#ede9fe', ltext: '#7c3aed' },
    };
    const c = map[kind] || map.gray;
    return dark ? { background: c.dbg, color: c.dtext } : { background: c.lbg, color: c.ltext };
  };

  const statusBadgeKind = (status) => {
    if (status === 'confirmed')    return 'blue';
    if (status === 'checked-in')   return 'green';
    if (status === 'checked-out')  return 'gray';
    if (status === 'cancelled')    return 'red';
    if (status === 'pending')      return 'yellow';
    return 'gray';
  };

  const paymentBadgeKind = (status) => {
    if (status === 'paid')    return 'green';
    if (status === 'partial') return 'yellow';
    return 'red';
  };

  const badgeStyle = { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' };

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: TEXT, marginBottom: '22px' }}>Reservation History</h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by guest, room, or phone..."
            style={{
              border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '9px 14px',
              fontSize: '13px', fontFamily: "'Poppins', sans-serif", width: '288px',
              background: CARD2, color: TEXT, outline: 'none', boxSizing: 'border-box',
            }} />
          {['all', 'pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                padding: '9px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '600',
                textTransform: 'capitalize', cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                border: filter === s ? 'none' : `1px solid ${BORDER}`,
                background: filter === s ? ACCENT : CARD,
                color: filter === s ? ACCENT_TEXT : SUBTEXT,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (filter !== s) e.currentTarget.style.background = HOVER_BG; }}
              onMouseLeave={e => { if (filter !== s) e.currentTarget.style.background = CARD; }}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead style={{ background: CARD2 }}>
              <tr>
                {['Guest', 'Room', 'Type', 'Check-in', 'Check-out', 'Total', 'Payment', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: SUBTEXT, fontWeight: '600', fontSize: '12px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>No reservations found.</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = HOVER_BG}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontWeight: '600', color: TEXT, margin: 0 }}>{r.guestName}</p>
                      <p style={{ fontSize: '11px', color: MUTED, margin: '2px 0 0' }}>{r.phone}</p>
                    </td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>
                      <p style={{ margin: 0 }}>Room {r.roomNumber}</p>
                      <p style={{ fontSize: '11px', color: MUTED, margin: '2px 0 0' }}>{r.roomType}</p>
                    </td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                      <span style={{ ...badgeStyle, ...badge('purple') }}>{r.type}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkIn}</td>
                    <td style={{ padding: '12px 16px', color: TEXT }}>{r.checkOut}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: TEXT }}>₱{Number(r.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                      <span style={{ ...badgeStyle, ...badge(paymentBadgeKind(r.paymentStatus)) }}>
                        {r.paymentStatus || 'pending'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                      <span style={{ ...badgeStyle, ...badge(statusBadgeKind(r.status)) }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}