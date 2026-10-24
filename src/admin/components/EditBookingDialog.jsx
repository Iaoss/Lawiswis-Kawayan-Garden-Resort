import React, { useEffect, useState } from 'react';
import DateOccupancy from '../../components/ui/date-occupancy';
import { BOOKING_OPTIONS, getBookingOptionId } from '../../lib/bookingDetails';
import { OVERNIGHT_TIME_SLOTS, isCheckInPassed, isTourStartPassed } from '../../lib/bookingPricing';
import { staffApi } from '../lib/staffApi';

const peso = value => `₱${Number(value || 0).toLocaleString()}`;

// Staff edit of a booking: switch overnight / day tour / night tour, move
// dates, or change guest counts. Every change is priced by the server
// (/api/staff-billing edit-booking, preview first), so the total shown is
// the total that gets saved.
export default function EditBookingDialog({ reservation, onClose, onSaved, colors }) {
  const c = colors;
  const [form, setForm] = useState(() => ({
    bookingOption: getBookingOptionId(reservation),
    checkIn: reservation.checkIn || '',
    checkOut: reservation.checkOut || '',
    overnightTimeSlot: OVERNIGHT_TIME_SLOTS.find(slot => slot.checkIn === reservation.checkInTime)?.id || 'morning',
    adults: Number(reservation.adults) || 1,
    children: Number(reservation.children) || 0,
  }));
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const isTour = form.bookingOption !== 'overnight';

  const changes = {
    ...form,
    checkOut: isTour ? form.checkIn : form.checkOut,
    adults: Number(form.adults),
    children: Number(form.children),
  };
  const changesKey = JSON.stringify(changes);

  // Ask the server for the new price whenever the form changes.
  useEffect(() => {
    let active = true;
    setQuoting(true);
    const timer = setTimeout(() => {
      staffApi('staff-billing', { action: 'edit-booking', reservationId: reservation.id, changes: JSON.parse(changesKey), preview: true })
        .then(result => { if (active) { setQuote(result); setQuoteError(''); } })
        .catch(error => { if (active) { setQuote(null); setQuoteError(error.message); } })
        .finally(() => { if (active) setQuoting(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [changesKey, reservation.id]);

  const save = async () => {
    if (!quote || saving) return;
    setSaving(true);
    try {
      const result = await staffApi('staff-billing', { action: 'edit-booking', reservationId: reservation.id, changes });
      onSaved(result);
    } catch (error) {
      setQuoteError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const field = { display: 'grid', gap: 5, fontSize: 11, fontWeight: 600, color: c.MUTED };
  const input = {
    background: c.CARD2, border: `1px solid ${c.BORDER2}`, borderRadius: 10, padding: '9px 12px',
    fontSize: 12, fontFamily: 'inherit', color: c.TEXT, outline: 'none',
  };
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div role="presentation" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-labelledby="edit-booking-title"
        onSubmit={event => { event.preventDefault(); save(); }}
        style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: c.CARD, border: `1px solid ${c.BORDER}`, borderRadius: 14, padding: 20, display: 'grid', gap: 12, fontFamily: "'Poppins', sans-serif" }}>
        <div>
          <div id="edit-booking-title" style={{ fontWeight: 700, fontSize: 15, color: c.TEXT }}>Edit booking</div>
          <div style={{ fontSize: 12, color: c.MUTED }}>{reservation.guestName || 'Guest'} · Room {reservation.roomNumber || '—'}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <label style={{ ...field, gridColumn: '1 / -1' }}>Booking type
            <select value={form.bookingOption} onChange={e => setForm(f => ({ ...f, bookingOption: e.target.value }))} style={input}>
              {BOOKING_OPTIONS.map(option => {
                const closed = option.bookingType === 'daytour' && form.checkIn !== reservation.checkIn && isTourStartPassed(form.checkIn, option.tourPeriod);
                return <option key={option.id} value={option.id} disabled={closed}>{option.label}{closed ? ' — closed for today' : ''}</option>;
              })}
            </select>
          </label>
          <label style={field}>{isTour ? 'Date' : 'Check-in'}
            <input type="date" required min={reservation.checkIn < todayKey ? reservation.checkIn : todayKey} value={form.checkIn}
              onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} style={input} />
          </label>
          {!isTour && (
            <>
              <label style={field}>Check-out
                <input type="date" required min={form.checkIn} value={form.checkOut}
                  onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} style={input} />
              </label>
              <label style={{ ...field, gridColumn: '1 / -1' }}>Check-in time
                <select value={form.overnightTimeSlot} onChange={e => setForm(f => ({ ...f, overnightTimeSlot: e.target.value }))} style={input}>
                  {OVERNIGHT_TIME_SLOTS.map(slot => {
                    const passed = form.checkIn !== reservation.checkIn && isCheckInPassed(form.checkIn, slot);
                    return <option key={slot.id} value={slot.id} disabled={passed}>{slot.label}{passed ? ' — passed for today' : ''}</option>;
                  })}
                </select>
              </label>
            </>
          )}
          <label style={field}>Adults
            <input type="number" min="1" max="60" required value={form.adults} onChange={e => setForm(f => ({ ...f, adults: e.target.value }))} style={input} />
          </label>
          <label style={field}>Children (under 10)
            <input type="number" min="0" max="60" required value={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.value }))} style={input} />
          </label>
        </div>

        <DateOccupancy date={form.checkIn} focus={isTour ? form.bookingOption : 'overnight'}
          colors={{ text: c.TEXT, muted: c.MUTED, border: c.BORDER2, background: c.CARD2, accent: c.ACCENT }} />

        <div role="status" aria-live="polite" style={{ background: c.CARD2, border: `1px solid ${c.BORDER2}`, borderRadius: 10, padding: 12, fontSize: 12, color: c.TEXT }}>
          {quoteError ? (
            <span style={{ color: '#dc2626' }}>{quoteError}</span>
          ) : !quote ? (
            <span style={{ color: c.MUTED }}>{quoting ? 'Calculating the new price…' : 'Change the booking to see the new price.'}</span>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: c.MUTED }}>Current total</span><span>{peso(quote.oldTotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>New total</span><span>{peso(quote.totalAmount)}{quoting ? ' …' : ''}</span></div>
              {quote.difference !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: quote.difference > 0 ? '#b45309' : '#15803d' }}>
                  <span>{quote.difference > 0 ? 'Increase' : 'Decrease'}</span><span>{peso(Math.abs(quote.difference))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: c.MUTED }}>Balance after change</span><span>{peso(quote.balance)}</span></div>
              {quote.overpaid > 0 && (
                <div style={{ color: '#b45309' }}>The guest has paid {peso(quote.overpaid)} more than the new total. Arrange a refund after saving.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ ...input, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={!quote || quoting || saving}
            style={{ background: c.ACCENT, color: c.ACCENT_TEXT, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: !quote || quoting || saving ? 'not-allowed' : 'pointer', opacity: !quote || quoting ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
