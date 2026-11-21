import React, { useEffect, useMemo, useState } from 'react';
import { loadRooms, isRoomOutOfService } from '../lib/roomOccupancy';
import { manilaDateKey } from '../../lib/reservationStatus';

// Room schedule: every room as a row and the next days as columns, so staff
// can see at a glance when each room is taken. Each day is split into
// morning (before 12 noon) and afternoon/evening, so a 3 PM check-in starts
// in the second half of its day and a 12 PM check-out ends in the first half.
// Click a booking to open its details. Search for a room (or click its name)
// to list all of its current and upcoming bookings; the list updates live.
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

const isActiveBooking = reservation => !HIDDEN_STATUSES.includes(String(reservation.status || '').toLowerCase());
const bookingId = reservation => (reservation.type === 'corporate-room' && reservation.corporateId ? reservation.corporateId : reservation.id);
const shortDate = key => (key ? new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '');

// A room's bookings from today on (guests already gone are left out),
// earliest first.
export function roomBookings(reservations, room, today) {
  return reservations
    .filter(r => sameRoom(r, room) && isActiveBooking(r) && String(r.status || '').toLowerCase() !== 'checked-out')
    .filter(r => toKey(r.checkIn) && (toKey(r.checkOut) || toKey(r.checkIn)) >= today)
    .sort((a, b) => toKey(a.checkIn).localeCompare(toKey(b.checkIn)) || hourOf(a.checkInTime, 14) - hourOf(b.checkInTime, 14));
}

// Today's state of a room, for the panel and the dot beside its name.
export function roomToday(room, bookings, today) {
  if (isRoomOutOfService(room.status)) return { label: 'Maintenance', color: '#dc2626' };
  const staying = bookings.find(r => String(r.status || '').toLowerCase() === 'checked-in');
  if (staying) return { label: `Occupied by ${staying.companyName || staying.guestName || 'a guest'}`, color: '#f59e0b', taken: true };
  if (bookings.some(r => toKey(r.checkIn) <= today)) return { label: 'Booked today', color: '#f59e0b', taken: true };
  return { label: 'Free today', color: '#22c55e' };
}

// The calendar days a booking uses (same morning / afternoon rule as the
// schedule, so a 12 PM check-out does not take the afternoon of that day).
const MAX_BOOKING_DAYS = 62;
export function bookingDays(reservation) {
  const checkIn = toKey(reservation.checkIn);
  const slots = checkIn ? bookingSlots(reservation, checkIn) : null;
  if (!slots) return [];
  const count = Math.min(MAX_BOOKING_DAYS, Math.floor((slots.end - 1) / 2) + 1);
  return Array.from({ length: count }, (_, i) => addDays(checkIn, i));
}

// Months that have bookings, oldest first: [{ month: '2026-11', count: 2 }].
export function bookingsByMonth(bookings) {
  const months = new Map();
  bookings.forEach(r => {
    new Set(bookingDays(r).map(day => day.slice(0, 7))).forEach(month => months.set(month, (months.get(month) || 0) + 1));
  });
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}

const shiftMonth = (month, by) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
};
const monthName = (month, options) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-PH', options);

// One room's month calendar, with a button for every month that has bookings.
function RoomMonthCalendar({ bookings, today, t, onSelect }) {
  const months = useMemo(() => bookingsByMonth(bookings), [bookings]);
  const thisMonth = today.slice(0, 7);
  const [chosen, setChosen] = useState('');
  // Opens on this month, or the next month with bookings if this one has none.
  const month = chosen || (months.some(item => item.month === thisMonth) ? thisMonth : months.find(item => item.month > thisMonth)?.month || thisMonth);
  const byDay = useMemo(() => {
    const map = new Map();
    bookings.forEach(r => bookingDays(r).forEach(day => map.set(day, [...(map.get(day) || []), r])));
    return map;
  }, [bookings]);
  const first = `${month}-01`;
  const blanks = new Date(`${first}T00:00:00Z`).getUTCDay();
  const dayCount = dayIndex(first, `${shiftMonth(month, 1)}-01`);
  const nav = { border: `1px solid ${t.BORDER2}`, background: t.CARD, color: t.TEXT, borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button type="button" style={nav} onClick={() => setChosen(shiftMonth(month, -1))} aria-label="Previous month"><i className="ti ti-chevron-left" aria-hidden="true" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, color: t.TEXT }}>{monthName(month, { month: 'long', year: 'numeric' })}</div>
        <button type="button" style={nav} onClick={() => setChosen(shiftMonth(month, 1))} aria-label="Next month"><i className="ti ti-chevron-right" aria-hidden="true" /></button>
      </div>
      {months.length > 0 && (
        <div role="group" aria-label="Months with bookings" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {months.map(item => (
            <button key={item.month} type="button" aria-pressed={item.month === month} onClick={() => setChosen(item.month)}
              style={{ border: `1px solid ${item.month === month ? t.TEXT : t.BORDER2}`, background: item.month === month ? t.TEXT : t.CARD, color: item.month === month ? t.CARD : t.TEXT, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {monthName(item.month, { month: 'short', year: '2-digit' })} · {item.count}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(58px, 1fr))', gap: 3, minWidth: 430 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} style={{ fontSize: 10.5, fontWeight: 600, color: t.MUTED, textAlign: 'center' }}>{day}</div>)}
          {Array.from({ length: blanks }, (_, i) => <div key={`blank-${i}`} />)}
          {Array.from({ length: dayCount }, (_, i) => {
            const day = addDays(first, i);
            const items = byDay.get(day) || [];
            return (
              <div key={day} style={{ minHeight: 58, background: day === today ? (t.dark ? 'rgba(200,240,110,0.12)' : '#f7fbe9') : t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 6, padding: 3, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: day === today ? 800 : 500, color: day === today ? t.TEXT : t.MUTED, marginBottom: 2 }}>{i + 1}</div>
                {items.slice(0, 2).map(r => {
                  const style = STATUS_STYLE[String(r.status || '').toLowerCase()] || STATUS_STYLE.pending;
                  const name = r.companyName || r.guestName || 'Guest';
                  return (
                    <button key={r.id} type="button" onClick={() => onSelect?.(bookingId(r))} title={`${name} · ${style.label}`}
                      style={{ display: 'block', width: '100%', border: 0, borderRadius: 4, background: style.bg, color: style.fg, padding: '1px 4px', marginBottom: 2, fontSize: 9.5, fontWeight: 700, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {name}
                    </button>
                  );
                })}
                {items.length > 2 && <div style={{ fontSize: 9.5, color: t.MUTED }}>+{items.length - 2} more</div>}
              </div>
            );
          })}
        </div>
      </div>
      {months.length === 0 && <div style={{ fontSize: 12, color: t.MUTED, marginTop: 8 }}>This room has no bookings yet.</div>}
    </div>
  );
}

export default function RoomSchedule({ reservations, t, onSelect }) {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(() => manilaDateKey());
  const [typeFilter, setTypeFilter] = useState('');
  // One week by default (wider, easier to read); two weeks on request.
  const [daysShown, setDaysShown] = useState(7);
  const [hideFree, setHideFree] = useState(false);
  const [search, setSearch] = useState('');
  const [pickedRoomId, setPickedRoomId] = useState('');
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
  const searchText = search.trim().toLowerCase();
  const rows = useMemo(() => rooms
    .filter(room => !typeFilter || room.type === typeFilter)
    .filter(room => !searchText || `${room.roomNumber || ''} ${room.type || ''}`.toLowerCase().includes(searchText))
    .sort((a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || '')))
    .map(room => {
      const items = reservations
        .filter(r => sameRoom(r, room) && isActiveBooking(r))
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
      const upcoming = roomBookings(reservations, room, today);
      const allBookings = reservations.filter(r => sameRoom(r, room) && isActiveBooking(r));
      return { room, items, lanes: Math.max(1, laneEnds.length), upcoming, allBookings, state: roomToday(room, upcoming, today) };
    })
    // A room being searched for stays visible even when it is free.
    .filter(row => !hideFree || searchText || row.items.length > 0), [rooms, reservations, from, typeFilter, totalSlots, today, hideFree, searchText]);

  // Rooms whose bookings are listed: the one clicked, or up to 3 search matches.
  const picked = rows.find(row => row.room.id === pickedRoomId);
  const panels = !picked && searchText && rows.length <= 3 ? rows : [];

  // Esc closes the room's pop-up.
  useEffect(() => {
    if (!pickedRoomId) return undefined;
    const onKey = event => { if (event.key === 'Escape') setPickedRoomId(''); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickedRoomId]);

  const ctl = { border: `1px solid ${t.BORDER2}`, background: t.CARD2, color: t.TEXT, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const nameCol = 150;
  const grid = { display: 'grid', gridTemplateColumns: `${nameCol}px repeat(${totalSlots}, minmax(${daysShown > 7 ? 22 : 40}px, 1fr))` };
  const dayLabel = key => new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric' });
  const monthLabel = `${new Date(`${days[0]}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(`${days[days.length - 1]}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // Opening a booking closes the room pop-up so the booking shows on top.
  const openBooking = id => { setPickedRoomId(''); onSelect?.(id); };
  const roomPanel = ({ room, upcoming, allBookings, state }, { inDialog = false } = {}) => (
        <section key={room.id} aria-label={`Bookings in ${room.roomNumber || 'room'}`} style={{ background: inDialog ? 'transparent' : t.CARD2, border: inDialog ? 0 : `1px solid ${t.BORDER2}`, borderRadius: 12, padding: 14, marginBottom: inDialog ? 0 : 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: t.TEXT }}>{room.roomNumber || 'Room'}</span>
              {room.type && <span style={{ fontSize: 12, color: t.MUTED }}> · {room.type}</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: t.TEXT, marginTop: 2 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: state.color }} />{state.label}
              </div>
            </div>
            <div style={{ fontSize: 12, color: t.MUTED }}>{upcoming.length ? `${upcoming.length} booking${upcoming.length === 1 ? '' : 's'} from today` : 'No bookings from today on'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14, alignItems: 'start' }}>
          <RoomMonthCalendar bookings={allBookings} today={today} t={t} onSelect={openBooking} />
          <div role="group" aria-label="Current and upcoming bookings" style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            {upcoming.map(r => {
              const style = STATUS_STYLE[String(r.status || '').toLowerCase()] || STATUS_STYLE.pending;
              const checkIn = toKey(r.checkIn);
              const checkOut = toKey(r.checkOut) || checkIn;
              return (
                <button key={r.id} type="button" onClick={() => onSelect?.(bookingId(r))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', width: '100%', textAlign: 'left', background: t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', color: t.TEXT }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{r.companyName || r.guestName || 'Guest'}</span>
                    <span style={{ display: 'block', fontSize: 12, color: t.MUTED }}>{shortDate(checkIn)}{r.checkInTime ? `, ${r.checkInTime}` : ''} → {shortDate(checkOut)}{r.checkOutTime ? `, ${r.checkOutTime}` : ''}</span>
                  </span>
                  <span style={{ background: style.bg, color: style.fg, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{style.label}</span>
                </button>
              );
            })}
          </div>
          </div>
        </section>);

  return (
    <section aria-label="Room schedule" style={{ background: t.CARD, border: `1px solid ${t.BORDER}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.TEXT }}>Room schedule</div>
          <div style={{ fontSize: 11.5, color: t.MUTED }}>{monthLabel} · click a room name to see all its bookings</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...ctl, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'text', fontWeight: 500 }}>
            <i className="ti ti-search" aria-hidden="true" style={{ color: t.MUTED }} />
            <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPickedRoomId(''); }}
              placeholder="Search room" aria-label="Search room"
              style={{ border: 0, outline: 'none', background: 'transparent', color: t.TEXT, font: 'inherit', width: 130 }} />
          </span>
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

      {searchText && rows.length > 3 && !picked && (
        <div style={{ fontSize: 12, color: t.MUTED, marginBottom: 10 }}>{rows.length} rooms match. Keep typing, or click a room name to see its bookings.</div>
      )}

      {/* Up to 3 rooms matching the search, listed under the search box. */}
      {panels.map(row => roomPanel(row))}

      {/* The clicked room's bookings, in a pop-up right where staff are looking. */}
      {picked && (
        <div role="presentation" onClick={event => { if (event.target === event.currentTarget) setPickedRoomId(''); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label={`Bookings in ${picked.room.roomNumber || 'room'}`} className="lk-enter"
            style={{ width: 'min(960px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: t.CARD, borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', padding: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 4px 0' }}>
              <button type="button" onClick={() => setPickedRoomId('')} aria-label="Close" autoFocus
                style={{ border: `1px solid ${t.BORDER2}`, background: t.CARD2, color: t.TEXT, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            {roomPanel(picked, { inDialog: true })}
          </div>
        </div>
      )}

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

          {rows.length === 0 && !error && <div style={{ padding: 16, fontSize: 12, color: t.MUTED }}>{searchText ? `No room matches "${search.trim()}".` : 'No rooms to show.'}</div>}

          {rows.map(({ room, items, lanes, state }) => (
            <div key={room.id} style={{ ...grid, gridTemplateRows: `repeat(${lanes}, 40px)`, borderBottom: `1px solid ${t.BORDER}`, position: 'relative' }}>
              <div style={{ gridRow: `1 / span ${lanes}`, padding: '6px 10px', borderRight: `1px solid ${t.BORDER}`, minWidth: 0 }}>
                <button type="button" title={`${state.label} · show this room's bookings`} aria-pressed={pickedRoomId === room.id}
                  onClick={() => setPickedRoomId(current => (current === room.id ? '' : room.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 0, background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: t.TEXT, overflow: 'hidden', whiteSpace: 'nowrap', height: '100%', textAlign: 'left', textDecoration: pickedRoomId === room.id ? 'underline' : 'none' }}>
                  <span aria-hidden="true" style={{ flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: state.color }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.roomNumber || 'Room'}</span>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{state.taken ? 'Taken today' : state.label}</span>
                </button>
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
                  <button key={r.id} type="button" onClick={() => onSelect?.(bookingId(r))}
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
