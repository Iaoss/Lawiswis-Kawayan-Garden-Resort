import React, { useEffect, useState } from 'react';
import { ID_TYPES } from '../../lib/checkInId';

// Asked when staff check a guest in: how many of the booked guests arrived
// (the rest can come later), which ID the guest showed, and its last 4
// characters (never the full number or a photo, for privacy). Staff can skip
// the ID. <CheckInIdHost /> is mounted in both staff layouts.
//
//   const answer = await askCheckInId('Juan dela Cruz', { bookedGuests: 4 });
//   // { type, last4, arrivedGuests }  |  { skipped: true, arrivedGuests }  |  null (cancelled)

let pushRequest = null;

export function askCheckInId(guestName = '', { bookedGuests = 0, arrivedGuests = null } = {}) {
  return new Promise(resolve => {
    if (!pushRequest) { resolve({ skipped: true }); return; }
    const booked = Number(bookedGuests) || 0;
    const start = Number.isInteger(arrivedGuests) && arrivedGuests >= 1 ? Math.min(arrivedGuests, booked) : booked;
    pushRequest({ guestName, bookedGuests: booked, startArrived: start, resolve });
  });
}

export function CheckInIdHost({ dark, accent }) {
  const [request, setRequest] = useState(null);
  const [type, setType] = useState(ID_TYPES[0]);
  const [last4, setLast4] = useState('');
  const [error, setError] = useState('');
  const [arrived, setArrived] = useState(0);

  useEffect(() => {
    pushRequest = next => { setRequest(next); setType(ID_TYPES[0]); setLast4(''); setError(''); setArrived(next.startArrived); };
    return () => { pushRequest = null; };
  }, []);

  if (!request) return null;
  const booked = request.bookedGuests;
  const withCount = answer => (answer && booked > 0 ? { ...answer, arrivedGuests: arrived } : answer);
  const finish = answer => { request.resolve(withCount(answer)); setRequest(null); };
  const submit = event => {
    event.preventDefault();
    const clean = last4.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(clean)) { setError('Enter the last 2–4 letters or numbers of the ID, or choose Skip.'); return; }
    finish({ type, last4: clean });
  };

  const c = { card: dark ? '#1c1c1c' : '#fff', card2: dark ? '#262624' : '#f7f8f7', border: dark ? '#2f2f2c' : '#e5e7eb', text: dark ? '#f0f0f0' : '#111827', muted: dark ? '#a3a39a' : '#6b7280' };
  const input = { background: c.card2, border: `1px solid ${c.border}`, borderRadius: 9, padding: '9px 11px', color: c.text, font: 'inherit', fontSize: 13 };

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) finish(null); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-label="Check in" onSubmit={submit}
        style={{ width: '100%', maxWidth: 380, background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20, fontFamily: "'Poppins', sans-serif", display: 'grid', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Check in {request.guestName || 'the guest'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: c.muted }}>Ask for a valid ID and record which one was shown. Only the last 4 characters are saved.</p>
        </div>
        {booked > 0 && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: c.muted }}>How many guests arrived?
            <select value={arrived} onChange={e => setArrived(Number(e.target.value))} style={input}>
              {Array.from({ length: booked }, (_, i) => booked - i).map(n => (
                <option key={n} value={n}>{n === booked ? `All ${booked} guest${booked === 1 ? '' : 's'}` : `${n} of ${booked} (${booked - n} coming later)`}</option>
              ))}
            </select>
            {arrived < booked && (
              <span style={{ fontSize: 11, color: '#d97706' }}>{booked - arrived} guest{booked - arrived === 1 ? '' : 's'} still to arrive. Record them later from the booking (Guests arrived).</span>
            )}
          </label>
        )}
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: c.muted }}>ID shown
          <select value={type} onChange={e => setType(e.target.value)} style={input}>
            {ID_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: c.muted }}>Last 4 characters of the ID number
          <input autoFocus value={last4} maxLength={4} onChange={e => setLast4(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="e.g. 4821" style={input} />
        </label>
        {error && <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => finish(null)} style={{ ...input, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => finish({ skipped: true })} style={{ ...input, cursor: 'pointer', fontWeight: 600 }}>Skip</button>
            <button type="submit" style={{ border: 'none', background: accent || '#9cb56f', color: '#0a1a0a', borderRadius: 9, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Check in</button>
          </div>
        </div>
      </form>
    </div>
  );
}
