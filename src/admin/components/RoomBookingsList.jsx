import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { manilaDateKey } from '../../lib/reservationStatus';

// Who has booked one room: current and upcoming stays first, then past ones.
// Loaded once when the room's window opens (no live listener, to save reads).

const STATUS = {
  pending: ['Pending', '#fde68a', '#92400e'],
  confirmed: ['Confirmed', '#bbf7d0', '#14532d'],
  'checked-in': ['Checked in', '#bfdbfe', '#1e3a8a'],
  'checked-out': ['Checked out', '#e5e7eb', '#374151'],
};
const key = value => String(value || '').slice(0, 10);
// Moves to another portal page without reloading (the router listens for popstate).
const goTo = path => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
const nice = value => (value ? new Date(`${key(value)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function RoomBookingsList({ room, colors }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const { TEXT, MUTED, BORDER, CARD2 } = colors;

  useEffect(() => {
    let active = true;
    setList(null);
    getDocs(query(collection(db, 'reservations'), where('roomNumber', '==', room.roomNumber)))
      .then(snapshot => { if (active) setList(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); })
      .catch(() => { if (active) setError('Bookings for this room could not be loaded.'); });
    return () => { active = false; };
  }, [room.roomNumber]);

  const today = manilaDateKey();
  const live = (list || []).filter(r => !['cancelled', 'rejected'].includes(String(r.status || '').toLowerCase()));
  const upcoming = live.filter(r => (key(r.checkOut) || key(r.checkIn)) >= today && r.status !== 'checked-out')
    .sort((a, b) => key(a.checkIn).localeCompare(key(b.checkIn)));
  const past = live.filter(r => !upcoming.includes(r)).sort((a, b) => key(b.checkIn).localeCompare(key(a.checkIn)));
  const portal = window.location.pathname.startsWith('/receptionist') ? '/receptionist' : '/admin';

  const row = r => {
    const [label, bg, fg] = STATUS[r.status] || STATUS.pending;
    const inNow = key(r.checkIn) <= today && today <= (key(r.checkOut) || key(r.checkIn));
    return (
      <button key={r.id} type="button" onClick={() => goTo(`${portal}/reservations?booking=${encodeURIComponent(r.id)}`)}
        title="Open this booking in Reservations"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: CARD2, border: `1px solid ${inNow ? '#f59e0b' : BORDER}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', color: TEXT }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.companyName || r.guestName || 'Guest'}</span>
          <span style={{ display: 'block', fontSize: 11, color: MUTED }}>
            {nice(r.checkIn)}{r.checkInTime ? `, ${r.checkInTime}` : ''} → {nice(r.checkOut || r.checkIn)}{r.checkOutTime ? `, ${r.checkOutTime}` : ''}
            {inNow ? ' · here now' : ''}
          </span>
        </span>
        <span style={{ flex: '0 0 auto', background: bg, color: fg, borderRadius: 999, padding: '3px 10px', fontSize: 10.5, fontWeight: 700 }}>{label}</span>
      </button>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span><i className="ti ti-calendar-event" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Bookings for this room</span>
        {list && <span style={{ fontWeight: 500, color: MUTED }}>{upcoming.length ? `${upcoming.length} now or upcoming` : 'No upcoming bookings'}</span>}
      </div>
      {error && <div role="alert" style={{ fontSize: 11.5, color: '#dc2626' }}>{error}</div>}
      {!list && !error && <div style={{ fontSize: 11.5, color: MUTED }}>Loading bookings…</div>}
      {list && (
        <div style={{ display: 'grid', gap: 6 }}>
          {upcoming.length === 0 && <div style={{ fontSize: 11.5, color: MUTED }}>Nobody has booked this room from today on.</div>}
          {upcoming.map(row)}
          {past.length > 0 && (
            <button type="button" onClick={() => setShowPast(value => !value)}
              style={{ justifySelf: 'start', border: 0, background: 'none', color: MUTED, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
              {showPast ? 'Hide past bookings' : `Show past bookings (${past.length})`}
            </button>
          )}
          {showPast && past.map(row)}
        </div>
      )}
    </div>
  );
}
