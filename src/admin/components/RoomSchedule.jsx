import React, { useEffect, useMemo, useState } from 'react';
import { loadRooms, isRoomOutOfService } from '../lib/roomOccupancy';
import { manilaDateKey } from '../../lib/reservationStatus';

// Room schedule: every room as a row and the next days as columns, so staff
// can see at a glance when each room is taken. Each day is split into
// morning (before 12 noon) and afternoon/evening, so a 3 PM check-in starts
// in the second half of its day and a 12 PM check-out ends in the first half.
// Click a booking to open its details.
const HIDDEN_STATUSES = ['cancelled', 'rejected'];
const STATUS_STYLE = {
  pending: { bg: '#fde68a', fg: '#78350f', label: 'Pending' },
  confirmed: { bg: '#bbf7d0', fg: '#14532d', label: 'Confirmed' },
  'checked-in': { bg: '#93c5fd', fg: '#1e3a8a', label: 'Checked in' },
  'checked-out': { bg: '#e5e7eb', fg: '#374151', label: 'Checked out' },
};

const toKey = value => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = typeof value?.toDate === 'function' ? value.toDate() : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : manilaDateKey(date);
};
const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dayIndex = (from, key) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// "3:00 PM" → hour 15. "After 9:00 PM" → 21. Missing → fallback.
function hourOf(time, fallback) {
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(time || ''));
  if (!match) return fallback;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour + Number(match[2]) / 60;
}

// Half-day slots a booking covers: [startSlot, endSlot) counted from `from`.
// Slot 2d = morning of day d, slot 2d+1 = afternoon/evening of day d.
export function bookingSlots(reservation, from) {
  const checkIn = toKey(reservation.checkIn);
  const checkOut = toKey(reservation.checkOut) || checkIn;
  if (!checkIn) return null;
  const startHour = hourOf(reservation.checkInTime, 14);
  const endHour = hourOf(reservation.checkOutTime, 12);
  const start = dayIndex(from, checkIn) * 2 + (startHour < 12 ? 0 : 1);
  // Leaving by 12 noon frees the room for the afternoon.
  const end = dayIndex(from, checkOut) * 2 + (endHour <= 12 ? 1 : 2);
  return end > start ? { start, end } : { start, end: start + 1 };
}

const sameRoom = (reservation, room) => reservation.roomId === room.id || (room.roomNumber && reservation.roomNumber === room.roomNumber);

export default function RoomSchedule({ reservations, t, onSelect }) {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(() => manilaDateKey());
  const [typeFilter, setTypeFilter] = useState('');
  // One week by default (wider, easier to read); two weeks on request.
  const [daysShown, setDaysShown] = useState(7);
  const [hideFree, setHideFree] = useState(false);
  const today = manilaDateKey();

  useEffect(() => {
    let active = true;
    loadRooms().then(list => { if (active) setRooms(list); }).catch(() => { if (active) setError('Rooms could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => Array.from({ length: daysShown }, (_, i) => addDays(from, i)), [from, daysShown]);
  const totalSlots = daysShown * 2;
  const types = useMemo(() => [...new Set(rooms.map(room => room.type).filter(Boolean))].sort(), [rooms]);

  // Each room's bookings in view, stacked in lanes if two ever overlap.
  const rows = useMemo(() => rooms
    .filter(room => !typeFilter || room.type === typeFilter)
    .sort((a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || '')))
    .map(room => {
      const items = reservations
        .filter(r => sameRoom(r, room) && !HIDDEN_STATUSES.includes(String(r.status || '').toLowerCase()))
        .map(r => ({ r, slots: bookingSlots(r, from) }))
        .filter(item => item.slots && item.slots.end > 0 && item.slots.start < totalSlots)
        .sort((a, b) => a.slots.start - b.slots.start);
      const laneEnds = [];
      items.forEach(item => {
        let lane = laneEnds.findIndex(end => end <= item.slots.start);
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = item.slots.end;
        item.lane = lane;
      });
      const busyToday = items.some(item => item.slots.start <= dayIndex(from, today) * 2 + 1 && item.slots.end > dayIndex(from, today) * 2);
      return { room, items, lanes: Math.max(1, laneEnds.length), busyToday };
    })
    .filter(row => !hideFree || row.items.length > 0), [rooms, reservations, from, typeFilter, totalSlots, today, hideFree]);

  const ctl = { border: `1px solid ${t.BORDER2}`, background: t.CARD2, color: t.TEXT, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const nameCol = 150;
  const grid = { display: 'grid', gridTemplateColumns: `${nameCol}px repeat(${totalSlots}, minmax(${daysShown > 7 ? 22 : 40}px, 1fr))` };
  const dayLabel = key => new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' });
  const monthLabel = `${new Date(`${days[0]}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(`${days[days.length - 1]}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <section aria-label="Room schedule" style={{ background: t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.TEXT }}>Room schedule</div>
          <div style={{ fontSize: 11.5, color: t.MUTED }}>{monthLabel} · click a booking to see its times and details</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={daysShown} onChange={event => setDaysShown(Number(event.target.value))} style={ctl} aria-label="Days shown">
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
          </select>
          <label style={{ ...ctl, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={hideFree} onChange={event => setHideFree(event.target.checked)} /> Hide free rooms
          </label>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} style={ctl} aria-label="Room type">
            <option value="">All room types</option>
            {types.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" style={ctl} onClick={() => setFrom(key => addDays(key, -7))} aria-label="Previous week"><i className="ti ti-chevron-left" aria-hidden="true" /></button>
          <button type="button" style={ctl} onClick={() => setFrom(today)}>Today</button>
          <button type="button" style={ctl} onClick={() => setFrom(key => addDays(key, 7))} aria-label="Next week"><i className="ti ti-chevron-right" aria-hidden="true" /></button>
          <input type="date" value={from} onChange={event => event.target.value && setFrom(event.target.value)} style={ctl} aria-label="Start date" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: t.MUTED, marginBottom: 10 }}>
        {Object.values(STATUS_STYLE).map(item => (
          <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: item.bg }} />{item.label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />Free today
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginLeft: 6 }} />Taken today
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', marginLeft: 6 }} />Maintenance
        </span>
      </div>

      {error && <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}

      <div style={{ overflowX: 'auto', border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
        <div style={{ minWidth: nameCol + totalSlots * (daysShown > 7 ? 22 : 40) }}>
          {/* Day headings */}
          <div style={{ ...grid, position: 'sticky', top: 0, background: t.CARD2, borderBottom: `1px solid ${t.BORDER}`, zIndex: 2 }}>
            <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: t.MUTED }}>Room</div>
            {days.map(key => (
              <div key={key} style={{ gridColumn: 'span 2', padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: key === today ? 800 : 600, color: key === today ? t.TEXT : t.MUTED, borderLeft: `1px solid ${t.BORDER}`, background: key === today ? (t.dark ? 'rgba(200,240,110,0.12)' : '#f7fbe9') : 'transparent' }}>
                {dayLabel(key)}
              </div>
            ))}
          </div>

          {rows.length === 0 && !error && <div style={{ padding: 16, fontSize: 12, color: t.MUTED }}>No rooms to show.</div>}

          {rows.map(({ room, items, lanes, busyToday }) => (
            <div key={room.id} style={{ ...grid, gridTemplateRows: `repeat(${lanes}, 40px)`, borderBottom: `1px solid ${t.BORDER}`, position: 'relative' }}>
              <div style={{ gridRow: `1 / span ${lanes}`, padding: '6px 10px', borderRight: `1px solid ${t.BORDER}`, minWidth: 0 }}>
                <div title={isRoomOutOfService(room.status) ? 'Maintenance' : busyToday ? 'Taken today' : 'Free today'}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: t.TEXT, overflow: 'hidden', whiteSpace: 'nowrap', height: '100%' }}>
                  <span aria-hidden="true" style={{ flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: isRoomOutOfService(room.status) ? '#dc2626' : busyToday ? '#f59e0b' : '#22c55e' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.roomNumber || 'Room'}</span>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{isRoomOutOfService(room.status) ? 'Maintenance' : busyToday ? 'Taken today' : 'Free today'}</span>
                </div>
              </div>
              {/* Day grid lines, today shaded */}
              {days.map((key, d) => (
                <div key={key} aria-hidden="true" style={{ gridColumn: `${2 + d * 2} / span 2`, gridRow: `1 / span ${lanes}`, borderLeft: `1px solid ${t.BORDER}`, background: key === today ? (t.dark ? 'rgba(200,240,110,0.08)' : '#f7fbe9') : 'transparent' }} />
              ))}
              {items.map(({ r, slots, lane }) => {
                const style = STATUS_STYLE[String(r.status || '').toLowerCase()] || STATUS_STYLE.pending;
                const start = Math.max(0, slots.start);
                const end = Math.min(totalSlots, slots.end);
                const when = `${toKey(r.checkIn)} ${r.checkInTime || ''} → ${toKey(r.checkOut) || toKey(r.checkIn)} ${r.checkOutTime || ''}`;
                const name = r.companyName || r.guestName || 'Guest';
                return (
                  <button key={r.id} type="button" onClick={() => onSelect?.(r.type === 'corporate-room' && r.corporateId ? r.corporateId : r.id)}
                    title={`${name} · ${style.label}\n${when}`}
                    style={{
                      gridColumn: `${2 + start} / ${2 + end}`, gridRow: lane + 1, margin: '4px 1px', zIndex: 1,
                      background: style.bg, color: style.fg, border: 0, borderRadius: 6, padding: '0 6px',
                      fontSize: 10.5, fontWeight: 700, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      borderLeft: slots.start < 0 ? '3px dashed rgba(0,0,0,.25)' : 0,
                    }}>
                    {name}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
