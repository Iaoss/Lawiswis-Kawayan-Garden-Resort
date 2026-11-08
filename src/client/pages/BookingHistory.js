import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination, usePagination } from '../../components/ui/pagination';
import { BOOKING_OPTIONS, getBookingOptionId } from '../../lib/bookingDetails';

const DARK = '#1a3a1a';
const ACCENT = '#4a7c59';

// Guests can't cancel or move a booking online; they contact the resort.
const RESORT_PHONE = '0917 811 2332';
const RESORT_EMAIL = 'lawiswiskawayan123@gmail.com';

const formatMDY = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : (value || '—');
};

function readStoredValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage:`, error);
    return fallback;
  }
}

function bookingStatus(booking) {
  if (booking.refundRequestStatus) return `Refund ${String(booking.refundRequestStatus).replaceAll('_', ' ')}`;
  if (booking.modificationRequest?.status) return `Change ${String(booking.modificationRequest.status).replaceAll('_', ' ')}`;
  return booking.status || 'Pending';
}

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [reference, setReference] = useState('');
  const [contact, setContact] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  // Moving a booking online after a resort closure.
  const [moveDate, setMoveDate] = useState('');
  const [moveError, setMoveError] = useState('');
  const [moveSuggestions, setMoveSuggestions] = useState([]);
  const [moving, setMoving] = useState(false);
  const pagination = usePagination(bookings, { pageSize: 5 });

  useEffect(() => {
    const history = readStoredValue('booking_history', []);
    setBookings(Array.isArray(history) ? history.filter(item => item && item.bookingId) : []);

    // The closure email links here with the booking number filled in.
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) setReference(ref.slice(0, 32));
    } catch (urlError) { /* ignore */ }

    const profile = readStoredValue('guest_profile', {});
    if (profile && typeof profile === 'object') {
      setContact(String(profile.phone || profile.email || ''));
    }
  }, []);

  const sendGuestAction = async (action, bookingReference, details = {}) => {
    const response = await fetch('/api/reservation-guest-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reference: bookingReference, contact: contact.trim(), ...details }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(result.error || 'Could not process the reservation request.');
      failure.suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      throw failure;
    }
    return result;
  };

  const lookupBooking = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    setLookupResult(null);
    try {
      const result = await sendGuestAction('lookup', reference.trim());
      setLookupResult(result.reservation);
    } catch (lookupError) {
      setError(lookupError.message || 'Could not find this reservation.');
    } finally {
      setLoading(false);
    }
  };

  const requestClosureMove = async checkIn => {
    if (!lookupResult || !checkIn) return;
    setMoving(true);
    setMoveError('');
    setMoveSuggestions([]);
    try {
      const result = await sendGuestAction('schedule-change', reference.trim(), { checkIn });
      setLookupResult(current => ({ ...current, modificationRequest: result.modificationRequest || current.modificationRequest, canReschedule: true }));
      setNotice('Your new dates were sent. The resort will confirm them by email.');
    } catch (moveFailure) {
      setMoveError(moveFailure.message || 'Could not send your new dates.');
      setMoveSuggestions(moveFailure.suggestions || []);
    } finally {
      setMoving(false);
    }
  };

  // Closure: cancel online with no fee and a 100% refund (staff send it).
  const [refundBusy, setRefundBusy] = useState(false);
  const requestClosureRefund = async () => {
    if (!lookupResult || refundBusy) return;
    if (!window.confirm('Cancel this booking and get back 100% of what you paid? This cannot be undone.')) return;
    setRefundBusy(true);
    setMoveError('');
    try {
      const result = await sendGuestAction('refund', reference.trim());
      setLookupResult(current => ({
        ...current,
        refundRequestStatus: result.outcome || current.refundRequestStatus || 'eligible',
        refundDecision: result.decision ? { outcome: result.decision.outcome, reason: result.decision.reason, refundableAmount: result.decision.refundableAmount } : current.refundDecision,
      }));
      setNotice('Cancellation sent. The resort will cancel your booking with no fee and refund 100% of what you paid. You will get an email.');
    } catch (failure) {
      setMoveError(failure.message || 'Could not send the cancellation.');
    } finally {
      setRefundBusy(false);
    }
  };

  const stayLength = booking => Math.max(0, Math.round((Date.parse(`${String(booking.checkOut || booking.checkIn).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(booking.checkIn).slice(0, 10)}T00:00:00Z`)) / 86400000));
  const addDays = (key, days) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };

  const suggestionButtons = (list, disabled) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {list.map(option => (
        <button key={option.checkIn} type="button" disabled={disabled} onClick={() => requestClosureMove(option.checkIn)}
          style={{ border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '8px 12px', background: '#fff', color: DARK, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}>
          {formatMDY(option.checkIn)}{option.checkOut && option.checkOut !== option.checkIn ? ` – ${formatMDY(option.checkOut)}` : ''}
        </button>
      ))}
    </div>
  );

  // Shown when the resort closed on this booking's dates.
  const renderClosureMove = booking => {
    if (!booking.canReschedule || !booking.closure) return null;
    if (booking.refundRequestStatus) {
      return (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#eff6f0', color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: DARK }}>Cancellation requested.</strong> No fee: the resort refunds 100% of what you paid and confirms by email.
        </div>
      );
    }
    const request = booking.modificationRequest;
    const pending = request && ['requested', 'needs_review', 'approved', 'awaiting_payment', 'awaiting_refund'].includes(request.status);
    const rejected = request?.status === 'rejected';
    const length = stayLength(booking);
    const minDate = addDays(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), 1);
    return (
      <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
        <strong style={{ color: '#9a3412' }}>The resort is closed {formatMDY(booking.closure.from)}{booking.closure.to !== booking.closure.from ? ` – ${formatMDY(booking.closure.to)}` : ''}{booking.closure.reason ? ` (${booking.closure.reason})` : ''}.</strong>
        <div style={{ marginTop: 4 }}>Sorry for the trouble. You have two choices, both with <strong>no fee</strong>:</div>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li><strong>Rebook:</strong> pick your preferred new date below. Same room, booking type, guests and price. The resort checks it and confirms by email; if it's not free, we suggest the closest free dates.</li>
          <li><strong>Cancel:</strong> get back <strong>100%</strong> of what you paid.{' '}
            {!pending && (
              <button type="button" onClick={requestClosureRefund} disabled={refundBusy}
                style={{ border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: refundBusy ? 'wait' : 'pointer', marginLeft: 4 }}>
                {refundBusy ? 'Sending…' : 'Cancel with full refund'}
              </button>
            )}
          </li>
        </ol>
        {pending ? (
          <div style={{ marginTop: 10, fontWeight: 600 }}>New dates sent: {formatMDY(request.requestedCheckIn)}{request.requestedCheckOut !== request.requestedCheckIn ? ` – ${formatMDY(request.requestedCheckOut)}` : ''}. Waiting for the resort to confirm.</div>
        ) : (
          <>
            {rejected && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b' }}>
                The resort could not take {formatMDY(request.requestedCheckIn)}{request.staffReason ? `: ${request.staffReason}` : '.'}
                {request.suggestions?.length > 0 && <div style={{ color: '#374151', marginTop: 6 }}>These dates are free for the same price. Tap one to request it:</div>}
                {request.suggestions?.length > 0 && suggestionButtons(request.suggestions, moving)}
              </div>
            )}
            <form onSubmit={event => { event.preventDefault(); requestClosureMove(moveDate); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                New check-in date
                <input type="date" required min={minDate} value={moveDate} onChange={event => setMoveDate(event.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 10px', fontSize: 14 }} />
              </label>
              {moveDate && <div style={{ fontSize: 12, paddingBottom: 10 }}>Check-out: <strong>{formatMDY(addDays(moveDate, length))}</strong></div>}
              <button type="submit" disabled={moving || !moveDate} style={{ border: 0, borderRadius: 8, padding: '10px 16px', background: DARK, color: '#fff', fontWeight: 700, cursor: moving ? 'default' : 'pointer' }}>
                {moving ? 'Sending...' : 'Request these dates'}
              </button>
            </form>
            {moveError && <div style={{ marginTop: 8, color: '#b91c1c', fontWeight: 600 }}>{moveError}</div>}
            {moveSuggestions.length > 0 && suggestionButtons(moveSuggestions, moving)}
          </>
        )}
      </div>
    );
  };

  const renderBooking = booking => (
    <article key={booking.bookingId} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>BOOKING REFERENCE</div>
          <strong style={{ color: DARK }}>#{String(booking.bookingId).slice(0, 8).toUpperCase()}</strong>
        </div>
        <span style={{ color: DARK, background: '#eff6f0', borderRadius: 20, padding: '6px 10px', fontWeight: 700, fontSize: 11 }}>
          {bookingStatus(booking)}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 12, marginTop: 16, color: '#4b5563', fontSize: 12 }}>
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Room</div><strong>{booking.roomName || booking.roomType || 'Resort room'}</strong></div>
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Check-in</div><strong>{formatMDY(booking.checkIn)}</strong></div>
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Check-out</div><strong>{formatMDY(booking.checkOut)}</strong></div>
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Total</div><strong>₱{Number(booking.totalAmount || 0).toLocaleString()}</strong></div>
      </div>
      {booking.refundDecision && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#f8faf8', color: '#4b5563', fontSize: 12 }}>
          <strong>Refund decision:</strong> {booking.refundDecision.reason}
          {Number(booking.refundDecision.refundableAmount) > 0 && <> Estimated amount ₱{Number(booking.refundDecision.refundableAmount).toLocaleString()}.</>}
          {booking.refundDecision.alternatives?.length > 0 && <div style={{ marginTop: 5 }}>Options: {booking.refundDecision.alternatives.join(' ')}</div>}
        </div>
      )}
      {booking.modificationRequest && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#f8faf8', color: '#4b5563', fontSize: 12 }}>
          <strong>Requested change:</strong> {booking.modificationRequest.status?.replaceAll('_', ' ')} · {booking.modificationRequest.requestedCheckIn}{booking.modificationRequest.requestedCheckOut !== booking.modificationRequest.requestedCheckIn ? ` – ${booking.modificationRequest.requestedCheckOut}` : ''}
          {booking.modificationRequest.requestedBookingType && <> · {BOOKING_OPTIONS.find(option => option.id === getBookingOptionId({ bookingType: booking.modificationRequest.requestedBookingType, tourPeriod: booking.modificationRequest.requestedTourPeriod }))?.label}</>}
          {booking.modificationRequest.requestedAdults != null && <> · {booking.modificationRequest.requestedAdults} adult(s), {booking.modificationRequest.requestedChildren || 0} child(ren)</>}
          {booking.modificationRequest.reason && <div style={{ marginTop: 4 }}>{booking.modificationRequest.reason}</div>}
        </div>
      )}
      {renderClosureMove(booking)}
      {['pending', 'confirmed'].includes(String(booking.status || '').toLowerCase()) && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#eff6f0', color: '#374151', fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: DARK }}>Need to move or cancel this booking?</strong>
          <div style={{ marginTop: 4 }}>
            Contact Lawiswis Kawayan Garden Resort and give your booking reference <strong>#{String(booking.bookingId).slice(0, 8).toUpperCase()}</strong>. Our staff will check the new dates and explain any fees under the <Link to="/cancellation-policy" style={{ color: ACCENT }}>cancellation policy</Link>.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <a href={`tel:${RESORT_PHONE.replace(/\s/g, '')}`} style={{ border: 0, borderRadius: 8, padding: '9px 14px', background: DARK, color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Call {RESORT_PHONE}</a>
            <a href={`mailto:${RESORT_EMAIL}?subject=${encodeURIComponent(`Booking #${String(booking.bookingId).slice(0, 8).toUpperCase()}`)}`} style={{ border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '9px 14px', background: '#fff', color: DARK, fontWeight: 700, textDecoration: 'none' }}>Email us</a>
            <Link to="/chat" style={{ border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '9px 14px', background: '#fff', color: DARK, fontWeight: 700, textDecoration: 'none' }}>Chat with us</Link>
          </div>
        </div>
      )}
    </article>
  );

  return (
    <main style={{ minHeight: '70vh', background: '#f7f8f5', padding: '52px 18px', color: '#22261b', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <p style={{ color: ACCENT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', margin: '0 0 8px' }}>GUEST SERVICES</p>
          <h1 style={{ color: DARK, fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(30px, 7vw, 42px)', margin: '0 0 10px' }}>My Bookings</h1>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, margin: 0 }}>Review reservations saved on this device or look up a booking from another device. To move or cancel a booking, contact the resort.</p>
        </header>

        {bookings.length > 0 ? (
          <section aria-labelledby="saved-bookings-heading" style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
            <h2 id="saved-bookings-heading" style={{ fontSize: 18, color: DARK, margin: '0 0 2px' }}>Saved on this device</h2>
            {pagination.pageItems.map(booking => renderBooking(booking))}
            <Pagination pagination={pagination} itemLabel="bookings" pageSizeOptions={[5, 10, 25]} colors={{ accent: DARK }} style={{ padding: '4px 0 0' }} />
          </section>
        ) : (
          <section style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, background: '#fff', marginBottom: 24 }}>
            <p style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.7, margin: 0 }}>No saved booking history was found on this device. Use the lookup below with your reference number and the phone number or email used when booking.</p>
          </section>
        )}

        <section aria-labelledby="lookup-heading" style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, background: '#fff' }}>
          <h2 id="lookup-heading" style={{ fontSize: 18, color: DARK, margin: '0 0 8px' }}>Find a reservation</h2>
          <form onSubmit={lookupBooking} style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, color: '#4b5563', fontSize: 12, fontWeight: 600 }}>
              Booking ID or reference number
              <input required value={reference} onChange={event => setReference(event.target.value)} maxLength={32} autoComplete="off" placeholder="Enter your booking reference" style={{ minWidth: 0, border: '1px solid #d1d5db', borderRadius: 8, padding: '12px 13px', fontSize: 14 }} />
            </label>
            <label style={{ display: 'grid', gap: 6, color: '#4b5563', fontSize: 12, fontWeight: 600 }}>
              Booking phone number or email
              <input required value={contact} onChange={event => setContact(event.target.value)} autoComplete="email" placeholder="Phone number or email used to book" style={{ minWidth: 0, border: '1px solid #d1d5db', borderRadius: 8, padding: '12px 13px', fontSize: 14 }} />
            </label>
            <button type="submit" disabled={loading} style={{ justifySelf: 'start', border: 0, borderRadius: 8, padding: '12px 18px', background: DARK, color: '#fff', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? 'Please wait…' : 'Look up reservation'}
            </button>
          </form>
          {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
          {notice && <p role="status" style={{ color: DARK, background: '#eff6f0', borderRadius: 8, padding: 12, fontSize: 13, margin: '14px 0 0' }}>{notice}</p>}
          {lookupResult && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>{renderBooking(lookupResult)}</div>}
        </section>
        <div style={{ marginTop: 22, textAlign: 'center' }}><Link to="/rooms" style={{ color: DARK, fontWeight: 700, fontSize: 13 }}>Browse rooms</Link></div>
      </div>
    </main>
  );
}
