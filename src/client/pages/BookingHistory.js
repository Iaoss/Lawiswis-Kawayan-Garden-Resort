import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const DARK = '#1a3a1a';
const ACCENT = '#4a7c59';

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
  const [requestedDates, setRequestedDates] = useState({ checkIn: '', checkOut: '' });

  useEffect(() => {
    const history = readStoredValue('booking_history', []);
    setBookings(Array.isArray(history) ? history.filter(item => item && item.bookingId) : []);

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
    if (!response.ok) throw new Error(result.error || 'Could not process the reservation request.');
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
      setRequestedDates({
        checkIn: result.reservation.checkIn || '',
        checkOut: result.reservation.checkOut || '',
      });
    } catch (lookupError) {
      setError(lookupError.message || 'Could not find this reservation.');
    } finally {
      setLoading(false);
    }
  };

  const requestRefund = async booking => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await sendGuestAction('refund', booking.bookingId);
      const update = item => item.bookingId === booking.bookingId
        ? { ...item, refundRequestStatus: result.outcome || 'requested' }
        : item;
      const updatedBookings = bookings.map(update);
      setBookings(updatedBookings);
      try {
        window.localStorage.setItem('booking_history', JSON.stringify(updatedBookings));
      } catch (storageError) {
        console.error('Unable to update booking history in local storage:', storageError);
      }
      if (lookupResult?.bookingId === booking.bookingId) {
        setLookupResult({
          ...lookupResult,
          refundRequestStatus: result.outcome || 'requested',
          refundDecision: result.decision || lookupResult.refundDecision,
        });
      }
      setNotice(result.alreadyRequested
        ? 'A refund request for this reservation is already on file.'
        : result.outcome === 'eligible'
          ? `Policy estimate: ₱${Number(result.decision?.refundableAmount || 0).toLocaleString()} refundable, pending staff approval.`
          : result.decision?.reason || 'Your refund request was sent to the resort for review.');
    } catch (refundError) {
      setError(refundError.message || 'Could not submit the refund request.');
    } finally {
      setLoading(false);
    }
  };

  const requestScheduleChange = async (event, booking) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await sendGuestAction('schedule-change', booking.bookingId, requestedDates);
      const updated = { ...booking, modificationRequest: result.modificationRequest };
      if (lookupResult?.bookingId === booking.bookingId) setLookupResult(updated);
      setNotice(result.alreadyRequested
        ? 'A schedule-change request is already awaiting resort review.'
        : `Your requested dates were sent to resort staff. ${result.modificationRequest?.reason || ''}`);
    } catch (requestError) {
      setError(requestError.message || 'Could not request a schedule change.');
    } finally {
      setLoading(false);
    }
  };

  const canRequestRefund = booking => ['pending', 'confirmed'].includes(String(booking.status || '').toLowerCase())
    && !booking.refundRequestStatus;

  const renderBooking = (booking, allowModification = false) => (
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
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Check-in</div><strong>{booking.checkIn || '—'}</strong></div>
        <div><div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase' }}>Check-out</div><strong>{booking.checkOut || '—'}</strong></div>
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
          <strong>Schedule change:</strong> {booking.modificationRequest.status?.replaceAll('_', ' ')} · {booking.modificationRequest.requestedCheckIn} – {booking.modificationRequest.requestedCheckOut}
          {booking.modificationRequest.reason && <div style={{ marginTop: 4 }}>{booking.modificationRequest.reason}</div>}
        </div>
      )}
      {canRequestRefund(booking) && (
        <button type="button" disabled={loading} onClick={() => requestRefund(booking)} style={{ marginTop: 16, border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '10px 14px', color: DARK, background: '#fff', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
          Request Refund
        </button>
      )}
      {allowModification
        && (!booking.modificationRequest || ['rejected', 'completed'].includes(booking.modificationRequest.status))
        && ['pending', 'confirmed'].includes(String(booking.status || '').toLowerCase()) && (
        <form onSubmit={event => requestScheduleChange(event, booking)} style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 5, color: '#4b5563', fontSize: 11, fontWeight: 600 }}>New check-in
            <input type="date" required value={requestedDates.checkIn} onChange={event => setRequestedDates(current => ({ ...current, checkIn: event.target.value }))} style={{ border: '1px solid #d1d5db', borderRadius: 7, padding: 9, font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 5, color: '#4b5563', fontSize: 11, fontWeight: 600 }}>New check-out
            <input type="date" required value={requestedDates.checkOut} onChange={event => setRequestedDates(current => ({ ...current, checkOut: event.target.value }))} style={{ border: '1px solid #d1d5db', borderRadius: 7, padding: 9, font: 'inherit' }} />
          </label>
          <button type="submit" disabled={loading || !contact.trim()} style={{ border: 0, borderRadius: 8, padding: '10px 14px', background: DARK, color: '#fff', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>Request date change</button>
        </form>
      )}
    </article>
  );

  return (
    <main style={{ minHeight: '70vh', background: '#f7f8f5', padding: '52px 18px', color: '#22261b', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <p style={{ color: ACCENT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', margin: '0 0 8px' }}>GUEST SERVICES</p>
          <h1 style={{ color: DARK, fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(30px, 7vw, 42px)', margin: '0 0 10px' }}>My Bookings</h1>
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.7, margin: 0 }}>Review reservations saved on this device, look up a booking from another device, or send a refund request for the resort to review.</p>
        </header>

        {bookings.length > 0 ? (
          <section aria-labelledby="saved-bookings-heading" style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
            <h2 id="saved-bookings-heading" style={{ fontSize: 18, color: DARK, margin: '0 0 2px' }}>Saved on this device</h2>
            {bookings.map(booking => renderBooking(booking))}
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
          {lookupResult && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>{renderBooking(lookupResult, true)}</div>}
        </section>
        <div style={{ marginTop: 22, textAlign: 'center' }}><Link to="/rooms" style={{ color: DARK, fontWeight: 700, fontSize: 13 }}>Browse rooms</Link></div>
      </div>
    </main>
  );
}
