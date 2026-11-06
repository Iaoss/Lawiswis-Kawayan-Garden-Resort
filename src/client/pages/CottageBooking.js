import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BRASS, CREAM, FOREST, FOREST_DEEP, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';
import { useResortAvailability } from '../components/ResortAvailabilityContext';
import {
  COTTAGE_OPTIONS, DAYTOUR_TIME_SLOT, NIGHTTOUR_TIME_SLOT, calculateCottageTourPrice, cottageName,
  getResortNow, getSwimmingRate, getTourCutoffError,
} from '../../lib/bookingPricing';
import { NAME_PATTERN } from '../../lib/nameValidation';
import { FACEBOOK_CONTACT_METHOD, PREFERRED_CONTACT_METHODS, getContactLinkError } from '../../lib/preferredContactMethods';
import { RESERVATION_DEPOSIT_PERCENTAGE, getOnlinePaymentAmount } from '../../lib/paymentPolicy';
import { createPayMongoCheckout } from '../../lib/paymongo';
import { useCottageCatalog } from '../../lib/useCottageCatalog';

// Day tour or night tour with just a cottage — no room needed. Guests pay
// the swimming entrance per person plus the cottage.

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const addMonthsKey = (dateKey, months) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d, lastDay));
  return result.toISOString().slice(0, 10);
};
const readLocal = (key, fallback) => { try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };


export default function CottageBooking() {
  // The admin's current cottage list (Settings → Resort Status → Cottages).
  useCottageCatalog();
  const COTTAGES = COTTAGE_OPTIONS.filter(option => option.id);
  const navigate = useNavigate();
  // Filled in from the booking steps (/book): date, tour time and guests.
  const [query] = useSearchParams();
  const { available: resortOpen, loading: resortLoading } = useResortAvailability();
  const today = getResortNow().dateKey;
  const maxDate = addMonthsKey(today, 2);
  const [form, setForm] = useState(() => {
    const profile = readLocal('guest_profile', {}) || {};
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(query.get('date') || '') && query.get('date') >= today ? query.get('date') : today,
      tourPeriod: query.get('tour') === 'night' ? 'night' : 'day',
      adults: Math.max(1, Math.min(20, Number(query.get('adults')) || 2)),
      children: Math.max(0, Math.min(20, Number(query.get('children')) || 0)),
      cottageId: '',
      firstName: profile.firstName || '', lastName: profile.lastName || '', phone: profile.phone || '', email: profile.email || '',
      preferredContactMethod: PREFERRED_CONTACT_METHODS.includes(profile.preferredContactMethod) ? profile.preferredContactMethod : '',
      contactLink: profile.contactLink || '', notes: '', website: '',
    };
  });
  const [paymentChoice, setPaymentChoice] = useState('deposit');
  const [agreed, setAgreed] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const dayClosed = Boolean(getTourCutoffError(form.date, 'day'));
  const nightClosed = Boolean(getTourCutoffError(form.date, 'night'));
  const cutoffError = getTourCutoffError(form.date, form.tourPeriod);
  const guests = Number(form.adults) + Number(form.children);

  // Today's day tour closes at 8 AM: switch to the night tour if it's still open.
  useEffect(() => {
    if (form.tourPeriod === 'day' && dayClosed && !nightClosed) set('tourPeriod', 'night');
  }, [form.tourPeriod, dayClosed, nightClosed]);

  useEffect(() => {
    if (!form.date) return undefined;
    let active = true;
    setAvailability(null);
    fetch(`/api/cottage-availability?date=${encodeURIComponent(form.date)}&tourPeriod=${form.tourPeriod}`)
      .then(response => (response.ok ? response.json() : null))
      .then(result => { if (active) setAvailability(result?.availability || {}); })
      .catch(() => { if (active) setAvailability({}); });
    return () => { active = false; };
  }, [form.date, form.tourPeriod]);

  const pricing = useMemo(() => {
    if (!form.cottageId) return null;
    try {
      return calculateCottageTourPrice({ adults: Number(form.adults), children: Number(form.children), tourPeriod: form.tourPeriod, cottageId: form.cottageId });
    } catch (priceError) {
      return { error: priceError.message };
    }
  }, [form.adults, form.children, form.tourPeriod, form.cottageId]);
  const total = pricing && !pricing.error ? pricing.subtotalAmount : 0;
  const dueNow = total > 0 ? getOnlinePaymentAmount(total, paymentChoice) : 0;
  const rate = getSwimmingRate(form.tourPeriod);
  const slot = form.tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT;

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!resortOpen) return setError('Reservations are temporarily closed.');
    if (cutoffError) return setError(cutoffError);
    if (!form.cottageId) return setError('Choose a cottage for your tour.');
    if (pricing?.error) return setError(pricing.error);
    if (!NAME_PATTERN.test(form.firstName.trim()) || !NAME_PATTERN.test(form.lastName.trim())) return setError('Enter a valid first and last name (2-35 letters each).');
    if (!/^09\d{9}$/.test(form.phone)) return setError('Enter a valid 11-digit mobile number, like 09171234567.');
    if (!form.preferredContactMethod) return setError('Choose how we should contact you.');
    const linkError = getContactLinkError(form.preferredContactMethod, form.contactLink);
    if (linkError) return setError(linkError);
    if (!agreed) return setError('Please agree to the Terms of Service and the Cancellation Policy.');
    setSubmitting(true);
    try {
      const response = await fetch('/api/create-cottage-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          adults: Number(form.adults),
          children: Number(form.children),
          contactLink: form.preferredContactMethod === FACEBOOK_CONTACT_METHOD ? form.contactLink.trim() : '',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your booking could not be saved.');
      try {
        const history = readLocal('booking_history', []);
        window.localStorage.setItem('booking_history', JSON.stringify([{
          bookingId: result.reservationId,
          roomName: `${cottageName(COTTAGES.find(c => c.id === form.cottageId))} cottage · ${form.tourPeriod === 'night' ? 'night' : 'day'} tour`,
          checkIn: form.date, checkOut: form.date, totalAmount: result.totalAmount, status: 'Pending', createdAt: new Date().toISOString(),
        }, ...(Array.isArray(history) ? history : [])]));
      } catch { /* storage unavailable */ }
      const { checkoutUrl } = await createPayMongoCheckout({ reservationId: result.reservationId, paymentType: 'booking', paymentChoice });
      window.location.href = checkoutUrl;
    } catch (submitError) {
      setError(submitError.message || 'Your booking could not be saved. Please try again.');
      setSubmitting(false);
    }
  };

  const card = { background: '#fff', border: `1px solid ${LINE}`, padding: 24, minWidth: 0 };
  const label = { display: 'grid', gap: 6, color: FOREST_DEEP, font: `600 11px/1.4 ${SANS}`, letterSpacing: '.06em', textTransform: 'uppercase' };
  const input = { border: `1px solid ${LINE}`, padding: '11px 12px', font: `14px ${SANS}`, color: '#22261B', background: '#fff', borderRadius: 0, minWidth: 0, textTransform: 'none', letterSpacing: 0 };
  const choice = activeChoice => ({ textAlign: 'left', border: `1.5px solid ${activeChoice ? FOREST : LINE}`, background: activeChoice ? CREAM : '#fff', padding: '12px 14px', cursor: 'pointer', fontFamily: SANS, color: FOREST_DEEP });

  return (
    <main style={{ background: PAPER, padding: 'clamp(28px, 6vw, 64px) 16px', fontFamily: SANS }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <button type="button" onClick={() => navigate(`/book?${new URLSearchParams({ type: 'personal', stay: form.tourPeriod, checkIn: form.date, adults: String(form.adults), children: String(form.children), step: 'room' })}`)} style={{ border: 0, background: 'none', color: FOREST, cursor: 'pointer', padding: 0, font: `600 12px ${SANS}`, marginBottom: 14 }}>← Back to room choice</button>
        <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10 }}>Day tour · Night tour</div>
        <h1 style={{ color: FOREST_DEEP, font: `500 clamp(30px, 5vw, 44px)/1.1 ${SERIF}`, margin: '0 0 10px' }}>Book a cottage for the day</h1>
        <p style={{ color: '#6b6a5c', font: `14px/1.7 ${SANS}`, margin: '0 0 26px', maxWidth: 640 }}>
          No room needed. Swim and relax for the day or the evening with your own cottage. To book a room for your tour (cottage optional) or to stay overnight, <Link to="/rooms" style={{ color: FOREST }}>book a room</Link>.
        </p>

        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <section style={card}>
              <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 14px' }}>When</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                {[['day', 'Day tour', '8:00 AM – 5:00 PM', dayClosed], ['night', 'Night tour', '5:00 PM – 10:00 PM', nightClosed]].map(([id, name, hours, closed]) => (
                  <button key={id} type="button" disabled={closed} onClick={() => set('tourPeriod', id)} aria-pressed={form.tourPeriod === id}
                    style={{ ...choice(form.tourPeriod === id), opacity: closed ? 0.5 : 1, cursor: closed ? 'not-allowed' : 'pointer' }}>
                    <strong style={{ display: 'block', font: `600 14px ${SANS}` }}>{name}</strong>
                    <span style={{ font: `12px ${SANS}`, color: '#6b6a5c' }}>{closed ? 'Closed for today' : hours}</span>
                  </button>
                ))}
              </div>
              <label style={label}>Date
                <input type="date" required min={today} max={maxDate} value={form.date} onChange={e => set('date', e.target.value)} style={input} />
              </label>
              {cutoffError && <p role="alert" style={{ color: '#b42318', font: `12px ${SANS}`, margin: '10px 0 0' }}>{cutoffError}</p>}
            </section>

            <section style={card}>
              <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 14px' }}>Guests</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={label}>Adults (₱{rate.adult} each)
                  <input type="number" min="1" max="20" required value={form.adults} onChange={e => set('adults', Math.max(1, Math.min(20, Number(e.target.value) || 1)))} style={input} />
                </label>
                <label style={label}>Children under 10 (₱{rate.child} each)
                  <input type="number" min="0" max="20" value={form.children} onChange={e => set('children', Math.max(0, Math.min(20, Number(e.target.value) || 0)))} style={input} />
                </label>
              </div>
              <p style={{ color: '#6b6a5c', font: `12px/1.6 ${SANS}`, margin: '10px 0 0' }}>The swimming entrance is per person for the {form.tourPeriod === 'night' ? 'night' : 'day'} tour.</p>
            </section>

            <section style={card}>
              <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 4px' }}>Choose your cottage *</h2>
              <p style={{ color: '#6b6a5c', font: `12px ${SANS}`, margin: '0 0 14px' }}>Required for day and night tours.</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {COTTAGES.map(cottage => {
                  const entry = availability?.[cottage.id];
                  const soldOut = entry && entry.left !== null && entry.left <= 0;
                  const tooSmall = guests > cottage.maxGuests;
                  const disabled = soldOut || tooSmall;
                  return (
                    <button key={cottage.id} type="button" disabled={disabled} onClick={() => set('cottageId', cottage.id)} aria-pressed={form.cottageId === cottage.id}
                      style={{ ...choice(form.cottageId === cottage.id), display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                      <span>
                        <strong style={{ display: 'block', font: `600 14px ${SANS}` }}>{cottageName(cottage)}</strong>
                        <span style={{ font: `12px ${SANS}`, color: '#6b6a5c' }}>
                          Up to {cottage.maxGuests} guests
                          {availability === null ? ' · checking…' : soldOut ? ' · fully booked' : entry && entry.left !== null ? ` · ${entry.left} left` : ''}
                          {tooSmall && !soldOut ? ' · too small for your group' : ''}
                        </span>
                      </span>
                      <strong style={{ font: `600 16px ${SERIF}`, color: FOREST }}>{peso(cottage.price)}</strong>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={card}>
              <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 14px' }}>Your details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <label style={label}>First name *<input required maxLength={35} value={form.firstName} onChange={e => set('firstName', e.target.value)} style={input} autoComplete="given-name" /></label>
                <label style={label}>Last name *<input required maxLength={35} value={form.lastName} onChange={e => set('lastName', e.target.value)} style={input} autoComplete="family-name" /></label>
                <label style={label}>Mobile number *<input required inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX" value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} style={input} autoComplete="tel" /></label>
                <label style={label}>Email *<input required type="email" maxLength={254} value={form.email} onChange={e => set('email', e.target.value)} style={input} autoComplete="email" /></label>
                <label style={label}>Preferred contact method *
                  <select required value={form.preferredContactMethod} onChange={e => set('preferredContactMethod', e.target.value)} style={input}>
                    <option value="">Select a method</option>
                    {PREFERRED_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                  </select>
                  {['Email', 'Phone'].includes(form.preferredContactMethod) && (form.preferredContactMethod === 'Email' ? form.email : form.phone).trim() && (
                    <span style={{ font: `500 12px ${SANS}`, textTransform: 'none', letterSpacing: 0, color: FOREST }}>We'll contact you at {(form.preferredContactMethod === 'Email' ? form.email : form.phone).trim()}</span>
                  )}
                </label>
                {form.preferredContactMethod === FACEBOOK_CONTACT_METHOD && (
                  <label style={label}>Facebook profile link *
                    <input required type="url" maxLength={200} placeholder="https://www.facebook.com/your.name" value={form.contactLink} onChange={e => set('contactLink', e.target.value)} style={input} />
                  </label>
                )}
              </div>
              <label style={{ ...label, marginTop: 12 }}>Special requests
                <textarea rows={3} maxLength={1000} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...input, resize: 'vertical' }} />
              </label>
              <div aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} />
              </div>
            </section>
          </div>

          <aside style={{ ...card, position: 'sticky', top: 90 }}>
            <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 14px' }}>Summary</h2>
            {(() => {
              const row = (left, right, style = {}) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline', ...style }}>
                  <span>{left}</span><span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{right}</span>
                </div>
              );
              return (
                <div style={{ display: 'grid', gap: 8, font: `13px ${SANS}`, color: '#44463b' }}>
                  {row(form.tourPeriod === 'night' ? 'Night tour' : 'Day tour', `${form.date} · ${slot.checkIn}–${slot.checkOut}`)}
                  {row(`Entrance · ${form.adults} adult${Number(form.adults) === 1 ? '' : 's'}${Number(form.children) ? `, ${form.children} child${Number(form.children) === 1 ? '' : 'ren'}` : ''}`,
                    peso(Number(form.adults) * rate.adult + Number(form.children) * rate.child))}
                  {row(`Cottage${form.cottageId ? `: ${cottageName(COTTAGES.find(c => c.id === form.cottageId))}` : ''}`,
                    form.cottageId ? peso(COTTAGES.find(c => c.id === form.cottageId)?.price) : 'Choose one')}
                  {row('Total', total ? peso(total) : '—', { fontWeight: 700, color: FOREST_DEEP, borderTop: `1px solid ${LINE}`, paddingTop: 8 })}
                </div>
              );
            })()}
            {pricing?.error && <p role="alert" style={{ color: '#b42318', font: `12px ${SANS}`, margin: '12px 0 0' }}>{pricing.error}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '16px 0 10px' }}>
              {[['deposit', `${RESERVATION_DEPOSIT_PERCENTAGE}% deposit`], ['full', 'Pay in full']].map(([id, name]) => (
                <button key={id} type="button" onClick={() => setPaymentChoice(id)} aria-pressed={paymentChoice === id} style={choice(paymentChoice === id)}>
                  <strong style={{ display: 'block', font: `600 12px ${SANS}` }}>{name}</strong>
                  <span style={{ font: `600 14px ${SANS}` }}>{total ? peso(getOnlinePaymentAmount(total, id)) : '—'}</span>
                </button>
              ))}
            </div>
            <p style={{ color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 12px', font: `12px/1.6 ${SANS}`, margin: '0 0 12px' }}>
              Pay online now by GCash, Maya, QR or card. Any balance at the resort is cash or QR only — we have no card terminal.
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', font: `12px/1.6 ${SANS}`, color: '#44463b', marginBottom: 12 }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3, accentColor: FOREST }} />
              <span>I agree to the <Link to="/terms-of-service" target="_blank" style={{ color: FOREST }}>Terms of Service</Link> and the <Link to="/cancellation-policy" target="_blank" style={{ color: FOREST }}>Cancellation Policy</Link>.</span>
            </label>
            {error && <p role="alert" style={{ color: '#b42318', font: `13px/1.5 ${SANS}`, margin: '0 0 12px' }}>{error}</p>}
            <button type="submit" disabled={submitting || resortLoading || !resortOpen}
              style={{ width: '100%', border: 0, background: FOREST, color: '#fff', padding: 15, font: `600 13px ${SANS}`, letterSpacing: '.05em', cursor: submitting ? 'wait' : 'pointer', opacity: submitting || !resortOpen ? 0.7 : 1 }}>
              {submitting ? 'Starting payment…' : !resortOpen && !resortLoading ? 'Reservations closed' : `PAY ${dueNow ? peso(dueNow) : ''} AND BOOK`}
            </button>
          </aside>
        </form>
      </div>
    </main>
  );
}
