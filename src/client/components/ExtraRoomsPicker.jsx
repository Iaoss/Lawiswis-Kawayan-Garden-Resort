import React, { useEffect, useMemo, useState } from 'react';
import { calculateBookingPrice, getGuestCountViolation, getRoomCapacityPolicy } from '../../lib/bookingPricing';
import { MAX_ROOMS_PER_BOOKING } from '../../lib/groupBooking';

// "Need more rooms?" on the booking form. For example 5 guests: a couple
// room plus a room with an extra bed, booked and paid together. Each extra
// room has its own guests and price; the cottage stays with the first room.
// value: [{ roomId, adults, children, price, roomNumber }]
export default function ExtraRoomsPicker({ mainRoom, rooms, checkIn, stayEnd, bookingType, tourPeriod, nights, seasonPeriods, checkOut, lateArrival, value, onChange, colors }) {
  const { DARK = '#1a3a1a', ACCENT = '#4a7c59' } = colors || {};
  const [freeIds, setFreeIds] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!checkIn || !stayEnd) { setFreeIds(null); return undefined; }
    let active = true;
    fetch(`/api/room-availability?${new URLSearchParams({ startDate: checkIn, endDate: stayEnd })}`)
      .then(response => response.json().then(data => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) throw new Error(data.error || 'Could not check which rooms are free.');
        setFreeIds(data.availableRoomIds || []);
        setError('');
      })
      .catch(fetchError => { if (active) { setFreeIds([]); setError(fetchError.message); } });
    return () => { active = false; };
  }, [checkIn, stayEnd]);

  const priceFor = (room, adults, children) => {
    try {
      return calculateBookingPrice({
        room, bookingType, nights: Math.max(1, nights || 1), adults, children,
        tourPeriod: bookingType === 'daytour' ? tourPeriod : 'day', cottageId: '', cottageFee: 0,
        lateArrival, season: { periods: seasonPeriods || [], checkIn, checkOut },
      }).subtotalAmount;
    } catch { return 0; }
  };

  const choices = useMemo(() => (rooms || [])
    .filter(room => room.id !== mainRoom?.id && (freeIds ? freeIds.includes(room.id) : false))
    .sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true })), [rooms, mainRoom?.id, freeIds]);

  // Keep prices current when dates or the booking type change.
  useEffect(() => {
    if (!value.length) return;
    const next = value.map(item => {
      const room = rooms.find(r => r.id === item.roomId);
      return room ? { ...item, price: priceFor(room, item.adults, item.children) } : item;
    });
    if (next.some((item, i) => item.price !== value[i].price)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingType, tourPeriod, nights, checkIn, checkOut, lateArrival, seasonPeriods, rooms]);

  const update = (index, patch) => {
    const next = value.map((item, i) => {
      if (i !== index) return item;
      const merged = { ...item, ...patch };
      const room = rooms.find(r => r.id === merged.roomId);
      return { ...merged, roomNumber: room?.roomNumber || '', price: room ? priceFor(room, merged.adults, merged.children) : 0 };
    });
    onChange(next);
  };
  const add = () => {
    const used = new Set(value.map(item => item.roomId));
    const room = choices.find(r => !used.has(r.id));
    if (!room) { setError('No other rooms are free on these dates.'); return; }
    onChange([...value, { roomId: room.id, roomNumber: room.roomNumber, adults: 2, children: 0, price: priceFor(room, 2, 0) }]);
  };

  const label = { fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 };
  const input = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 10px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' };

  return (
    <div style={{ marginTop: 14, border: '1px dashed #c7d2c0', borderRadius: 12, padding: 14, background: '#fbfcfa' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Need more rooms?</div>
      <div style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 10px' }}>
        Book up to {MAX_ROOMS_PER_BOOKING} rooms for the same dates and pay once. For example 5 guests: a couple room plus a room with an extra bed.
      </div>
      {value.map((item, index) => {
        const room = rooms.find(r => r.id === item.roomId);
        const violation = room ? getGuestCountViolation(room, item.adults, item.children) : '';
        const used = new Set(value.filter((_, i) => i !== index).map(v => v.roomId));
        return (
          <div key={`${item.roomId}-${index}`} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(70px, 1fr) minmax(70px, 1fr)', gap: 8 }} className="keep-columns">
              <div>
                <label style={label}>Room {index + 2}</label>
                <select value={item.roomId} onChange={e => update(index, { roomId: e.target.value })} style={input}>
                  {choices.filter(r => !used.has(r.id)).map(r => (
                    <option key={r.id} value={r.id}>Room {r.roomNumber} · {getRoomCapacityPolicy(r)?.label || r.type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Adults</label>
                <input type="number" min={1} max={10} value={item.adults} onChange={e => update(index, { adults: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} style={input} />
              </div>
              <div>
                <label style={label}>Children</label>
                <input type="number" min={0} max={10} value={item.children} onChange={e => update(index, { children: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 12 }}>
              <span style={{ color: violation ? '#b91c1c' : '#374151', fontWeight: 600 }}>{violation || `₱${Number(item.price || 0).toLocaleString()}`}</span>
              <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}
                style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
            </div>
          </div>
        );
      })}
      {value.length < MAX_ROOMS_PER_BOOKING - 1 && (
        <button type="button" onClick={add} disabled={freeIds === null}
          style={{ border: `1px solid ${ACCENT}`, background: '#fff', color: DARK, borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 12.5, cursor: freeIds === null ? 'wait' : 'pointer' }}>
          {freeIds === null ? 'Checking free rooms…' : '+ Add another room'}
        </button>
      )}
      {error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export const extraRoomsViolation = (rooms, value) => value
  .map(item => {
    const room = rooms.find(r => r.id === item.roomId);
    const problem = room ? getGuestCountViolation(room, item.adults, item.children) : 'Choose a room.';
    return problem ? `Room ${item.roomNumber || ''}: ${problem}` : '';
  })
  .find(Boolean) || '';
