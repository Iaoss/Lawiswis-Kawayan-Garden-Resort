import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { staffApi } from '../lib/staffApi';
import { getRoomMaximumGuests } from '../../lib/bookingPricing';
import { CORPORATE_FEATURE_ROWS, isCorporateFeatureIncluded } from '../../lib/corporatePackages';
import { getCollectionSnapshot } from '../lib/liveCollection';

// Picks rooms for a corporate / group booking. Shows the package inclusions,
// the rooms free on the group's dates and how many guests they hold.
// "Suggest rooms" picks the fewest free rooms that fit everyone.
export default function AssignRoomsDialog({ reservation, colors, onClose, onSaved }) {
  const { CARD, CARD2, BORDER, TEXT, MUTED, ACCENT = '#9cb56f', ACCENT_TEXT = '#0a1a0a' } = colors;
  const guests = Number(reservation.totalGuests || reservation.adults || 0);
  const checkIn = String(reservation.checkIn || '').slice(0, 10);
  const checkOut = String(reservation.checkOut || reservation.checkIn || '').slice(0, 10);
  const nights = Number(reservation.nights) || 1;
  const assigned = useMemo(() => (Array.isArray(reservation.assignedRooms) ? reservation.assignedRooms : []), [reservation.assignedRooms]);
  const [rooms, setRooms] = useState([]);
  const [freeIds, setFreeIds] = useState(null);
  const [picked, setPicked] = useState(() => assigned.map(item => item.roomId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      getCollectionSnapshot('rooms'),
      fetch(`/api/room-availability?${new URLSearchParams({ startDate: checkIn, endDate: checkOut })}`).then(r => r.json()),
    ]).then(([snap, availability]) => {
      if (!active) return;
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setFreeIds(availability.availableRoomIds || []);
    }).catch(() => { if (active) { setFreeIds([]); setError('Could not load the rooms. Try again.'); } });
    return () => { active = false; };
  }, [checkIn, checkOut]);

  // Rooms this group already holds count as free for it.
  const choices = rooms
    .filter(room => assigned.some(item => item.roomId === room.id) || (freeIds || []).includes(room.id))
    .map(room => ({ room, max: getRoomMaximumGuests(room) || 0 }))
    .sort((a, b) => b.max - a.max || String(a.room.roomNumber).localeCompare(String(b.room.roomNumber), undefined, { numeric: true }));
  const capacity = choices.filter(c => picked.includes(c.room.id)).reduce((sum, c) => sum + c.max, 0);
  const inclusions = CORPORATE_FEATURE_ROWS.filter(row => isCorporateFeatureIncluded(reservation.packageId, nights, row.id));
  const wholeProperty = inclusions.some(row => row.id === 'whole-property');

  const suggest = () => {
    const next = [];
    let total = 0;
    for (const c of choices) {
      if (total >= guests) break;
      next.push(c.room.id);
      total += c.max;
    }
    setPicked(next);
  };
  const toggle = id => setPicked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await staffApi('staff-billing', { action: 'assign-corporate-rooms', reservationId: reservation.id, roomIds: picked });
      onSaved?.(result);
    } catch (saveError) {
      setError(saveError.message || 'The rooms could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const btn = { border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT, borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label="Assign rooms"
        style={{ background: CARD, color: TEXT, width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', borderRadius: 16, padding: 20, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Assign rooms · {reservation.companyName || reservation.guestName}</div>
        <div style={{ fontSize: 12, color: MUTED, margin: '2px 0 12px' }}>
          {reservation.packageName} · {guests} guests · {checkIn}{checkOut !== checkIn ? ` → ${checkOut}` : ''}
        </div>

        <div style={{ background: CARD2, borderRadius: 10, padding: 12, fontSize: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Included in this package</div>
          {inclusions.length ? inclusions.map(row => <div key={row.id}>✓ {row.label}</div>) : <div style={{ color: MUTED }}>No extra inclusions.</div>}
          <div style={{ color: MUTED, marginTop: 6 }}>
            {wholeProperty
              ? 'Whole-property rental is included: you can assign every free room.'
              : 'Rooms are optional for this package. Assign them if the group asked for accommodation; add any room charge in Billing.'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: capacity >= guests ? '#16a34a' : TEXT }}>
            {picked.length} room{picked.length === 1 ? '' : 's'} · holds {capacity} of {guests} guests
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={suggest} disabled={!choices.length} style={btn}>Suggest rooms</button>
            {wholeProperty && <button type="button" onClick={() => setPicked(choices.map(c => c.room.id))} style={btn}>All free rooms</button>}
            <button type="button" onClick={() => setPicked([])} style={btn}>Clear</button>
          </div>
        </div>

        {freeIds === null ? (
          <div style={{ fontSize: 12, color: MUTED, padding: 12 }}>Checking which rooms are free…</div>
        ) : choices.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, padding: 12 }}>No rooms are free on these dates.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {choices.map(({ room, max }) => {
              const on = picked.includes(room.id);
              return (
                <button key={room.id} type="button" onClick={() => toggle(room.id)} aria-pressed={on}
                  style={{ textAlign: 'left', border: `2px solid ${on ? ACCENT : BORDER}`, background: on ? `${ACCENT}22` : CARD2, color: TEXT, borderRadius: 10, padding: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{on ? '✓ ' : ''}Room {room.roomNumber}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{room.type} · up to {max || '?'} guests</div>
                </button>
              );
            })}
          </div>
        )}

        {error && <div role="alert" style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btn}>Cancel</button>
          <button type="button" onClick={save} disabled={busy}
            style={{ ...btn, background: ACCENT, color: ACCENT_TEXT, border: 0, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save rooms'}
          </button>
        </div>
      </section>
    </div>
  );
}
