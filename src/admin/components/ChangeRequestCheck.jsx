import React, { useEffect, useMemo, useState } from 'react';
import { findClosedPeriod, formatClosedRange } from '../../lib/closedDates';
import { canMoveToRoom } from '../../lib/roomChange';
import { bookingsOnRoom, dayOf, isRoomOutOfService as blocked, loadRooms } from '../lib/roomOccupancy';

// On a guest's change request: is the booked room free on the new dates,
// is the resort open then, and (for closure moves) which other rooms of the
// same size or bigger are free if it isn't.
export default function ChangeRequestCheck({ reservation, request, reservations, colors, newRoomId, onPickRoom }) {
  const { TEXT, MUTED, CARD2, BORDER2 } = colors;
  const [rooms, setRooms] = useState(null);
  const [closedDates, setClosedDates] = useState([]);

  useEffect(() => {
    let active = true;
    loadRooms().then(list => { if (active) setRooms(list); }).catch(() => { if (active) setRooms([]); });
    fetch('/api/resort-availability').then(r => r.json())
      .then(data => { if (active) setClosedDates(Array.isArray(data.closedDates) ? data.closedDates : []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const checkIn = dayOf(request.requestedCheckIn);
  const checkOut = dayOf(request.requestedCheckOut || request.requestedCheckIn);
  const room = useMemo(() => (rooms || []).find(r => r.id === reservation.roomId)
    || { id: reservation.roomId, roomNumber: reservation.roomNumber }, [rooms, reservation.roomId, reservation.roomNumber]);
  const taken = useMemo(() => bookingsOnRoom(reservations, room, checkIn, checkOut, reservation.id), [reservations, room, checkIn, checkOut, reservation.id]);
  const closed = findClosedPeriod(closedDates, checkIn, checkOut);
  const alternatives = useMemo(() => (taken.length && rooms
    ? rooms.filter(other => other.id !== room.id && !blocked(other.status) && canMoveToRoom(room, other)
      && !bookingsOnRoom(reservations, other, checkIn, checkOut, reservation.id).length)
    : []), [taken.length, rooms, room, reservations, checkIn, checkOut, reservation.id]);

  if (!reservation.roomId) return null;
  const line = (ok, text) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: ok ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span><span>{text}</span>
    </div>
  );

  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER2}`, borderRadius: 10, padding: 10, margin: '0 0 10px', fontSize: 12, color: TEXT, display: 'grid', gap: 5 }}>
      <div style={{ fontWeight: 700 }}>Check before approving</div>
      {rooms === null ? <div style={{ color: MUTED }}>Checking the room…</div> : (
        <>
          {taken.length
            ? line(false, `Room ${room.roomNumber || ''} is booked on the new dates (${taken.map(o => `${o.guestName || 'guest'} #${o.id.slice(0, 8).toUpperCase()}`).join(', ')}).`)
            : line(true, `Room ${room.roomNumber || ''} is free on the new dates.`)}
          {closed
            ? line(false, `The resort is closed ${formatClosedRange(closed)}${closed.reason ? ` (${closed.reason})` : ''}.`)
            : line(true, 'The resort is open on the new dates.')}
          {taken.length > 0 && request.closureMove && (
            alternatives.length ? (
              <label style={{ display: 'grid', gap: 4, color: MUTED, fontSize: 11, marginTop: 4 }}>
                Approve in another free room (same size or bigger, same price):
                <select value={newRoomId || ''} onChange={e => onPickRoom(e.target.value)}
                  style={{ background: colors.CARD, color: TEXT, border: `1px solid ${BORDER2}`, borderRadius: 7, padding: 7, fontFamily: 'inherit' }}>
                  <option value="">Choose a room…</option>
                  {alternatives.map(other => <option key={other.id} value={other.id}>Room {other.roomNumber} · {other.type || 'room'}</option>)}
                </select>
              </label>
            ) : <div style={{ color: MUTED }}>No other room of the same size is free then.</div>
          )}
          <div style={{ color: MUTED, fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
            Reject if the room is taken and no other room fits, the resort is closed then, or there’s another reason (for example a private event).
            Write the reason: it’s emailed to the guest{request.closureMove ? ', with the closest free dates at the same price so they can pick again' : ''}.
          </div>
        </>
      )}
    </div>
  );
}

export function changeRequestBlocked({ reservation, request, reservations, newRoomId }) {
  if (!reservation.roomId || newRoomId) return false;
  const room = { id: reservation.roomId, roomNumber: reservation.roomNumber };
  return bookingsOnRoom(reservations, room, dayOf(request.requestedCheckIn), dayOf(request.requestedCheckOut || request.requestedCheckIn), reservation.id).length > 0;
}
