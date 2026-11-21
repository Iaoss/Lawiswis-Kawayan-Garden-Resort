import React, { useEffect, useMemo, useState } from 'react';
import { staffApi } from '../lib/staffApi';
import { OVERNIGHT_TIME_SLOTS } from '../../lib/bookingPricing';
import { getBookingOptionId } from '../../lib/bookingDetails';
import { money } from '../lib/money';

// Extend a checked-in stay on the spot: turn a day or night tour into an
// overnight stay, or add nights to an overnight stay. The server reprices it
// with the room's normal rates (staff-billing edit-booking): we preview the
// new total first, then save.

const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const niceDate = key => new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export default function StayLongerPanel({ reservation, colors, onSaved }) {
  const { CARD2, TEXT, MUTED, BORDER, ACCENT, ACCENT_TEXT, inp } = colors;
  const isTour = getBookingOptionId(reservation) !== 'overnight';
  const checkIn = String(reservation.checkIn || '').slice(0, 10);
  const currentOut = String(reservation.checkOut || reservation.checkIn || '').slice(0, 10);
  // A tour becomes at least one night; an overnight stay gets at least one more night.
  const minOut = isTour ? addDays(checkIn, 1) : addDays(currentOut, 1);
  const [checkOut, setCheckOut] = useState(minOut);
  // A day tour guest is already here, so the earliest check-out slot fits;
  // a night tour (5 PM) fits the evening slot.
  const [slot, setSlot] = useState(() => (reservation.tourPeriod === 'night' ? 'evening' : (OVERNIGHT_TIME_SLOTS.find(s => s.checkIn === reservation.checkInTime)?.id || 'morning')));
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const changes = useMemo(() => ({
    bookingOption: 'overnight',
    checkIn,
    checkOut,
    ...(isTour ? { overnightTimeSlot: slot } : {}),
  }), [checkIn, checkOut, slot, isTour]);

  // Price preview whenever the choice changes.
  useEffect(() => {
    if (!checkOut || checkOut < minOut) { setQuote(null); setError('Choose a later check-out date.'); return undefined; }
    let active = true;
    setError('');
    setQuote(null);
    const timer = setTimeout(() => {
      staffApi('staff-billing', { action: 'edit-booking', reservationId: reservation.id, changes, preview: true })
        .then(result => { if (active) setQuote(result); })
        .catch(err => { if (active) setError(err.message || 'The new price could not be worked out.'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [changes, checkOut, minOut, reservation.id]);

  const save = async () => {
    if (!quote || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await staffApi('staff-billing', { action: 'edit-booking', reservationId: reservation.id, changes });
      onSaved?.(result, { isTour, checkOut, checkOutTime: quote.details?.checkOutTime });
    } catch (err) {
      setError(err.message || 'The stay could not be extended.');
      setBusy(false);
    }
  };

  const nights = quote?.details?.nights;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
        {isTour
          ? 'Turn this tour into an overnight stay. The room’s overnight rate replaces the tour price, and what the guest already paid counts toward it.'
          : `Add nights to this stay. Current check-out: ${niceDate(currentOut)}${reservation.checkOutTime ? `, ${reservation.checkOutTime}` : ''}.`}
      </div>
      <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED }}>
        New check-out date
        <input type="date" min={minOut} value={checkOut} onChange={e => setCheckOut(e.target.value)} style={inp} />
      </label>
      {isTour && (
        <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: MUTED }}>
          Check-out time
          <select value={slot} onChange={e => setSlot(e.target.value)} style={inp}>
            {OVERNIGHT_TIME_SLOTS.filter(s => !s.lateArrival).map(s => <option key={s.id} value={s.id}>Check-out {s.checkOut} (overnight rate, {s.checkIn} slot)</option>)}
          </select>
        </label>
      )}
      <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: TEXT, minHeight: 44 }}>
        {error ? <span role="alert" style={{ color: '#dc2626' }}>{error}</span>
          : !quote ? <span style={{ color: MUTED }}>Working out the new price…</span>
            : (
              <>
                <div><strong>New total: {money(quote.totalAmount)}</strong>{quote.difference > 0 ? ` (+${money(quote.difference)})` : ''}</div>
                <div style={{ color: MUTED, marginTop: 2 }}>
                  {nights ? `${nights} night${nights === 1 ? '' : 's'}` : 'Overnight'} · check-out {niceDate(checkOut)}{quote.details?.checkOutTime ? `, ${quote.details.checkOutTime}` : ''}
                  {quote.balance > 0 ? ` · balance to collect ${money(quote.balance)}` : ' · nothing more to pay'}
                </div>
              </>
            )}
      </div>
      <button type="button" onClick={save} disabled={!quote || busy}
        style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, cursor: !quote || busy ? 'not-allowed' : 'pointer', opacity: !quote || busy ? 0.6 : 1 }}>
        {busy ? 'Saving…' : isTour ? 'Make it an overnight stay' : 'Extend the stay'}
      </button>
    </div>
  );
}
