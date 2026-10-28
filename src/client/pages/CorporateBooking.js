import React, { useMemo, useState } from 'react';
import { createPayMongoCheckout } from '../../lib/paymongo';
import { getOnlinePaymentAmount, RESERVATION_DEPOSIT_PERCENTAGE } from '../../lib/paymentPolicy';
import {
  formatLongDate, getCorporateNights, getCorporatePackage, getEarliestGroupDate, getGroupAdvanceNoticeError, getGroupGuestError,
  CORPORATE_FEATURE_ROWS, CORPORATE_PACKAGES, GROUP_ADVANCE_DAYS, MAX_GROUP_GUESTS, MIN_GROUP_GUESTS, isCorporateFeatureIncluded,
} from '../../lib/corporatePackages';
import { NAME_PATTERN, joinGuestName } from '../../lib/nameValidation';
import { PREFERRED_CONTACT_METHODS } from '../../lib/preferredContactMethods';
import { CREAM, FOREST, FOREST_DEEP, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';
import { useResortAvailability } from '../components/ResortAvailabilityContext';
import { openBookingTypeModal } from '../lib/bookingTypeModal';

const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};

export default function CorporateBooking() {
  const { available, error: availabilityError, loading: availabilityLoading } = useResortAvailability();
  const maxDate = formatDate(addMonths(new Date(), 2));
  // Groups book at least a week ahead (Philippine date).
  const earliestDate = getEarliestGroupDate();
  const [form, setForm] = useState({
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    preferredContactMethod: '',
    totalGuests: 15,
    bookingType: 'overnight',
    checkIn: '',
    checkOut: '',
    accommodationInterest: false,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedReservationId, setSavedReservationId] = useState('');

  const totalGuests = Number(form.totalGuests);
  // Nights from the dates (a day tour is 1). Until check-out is picked, the
  // price shows for 1 night.
  const nights = getCorporateNights(form.bookingType, form.checkIn, form.checkOut) || 1;
  const selectedPackage = getCorporatePackage(totalGuests, nights);
  const nightLabel = form.bookingType === 'daytour' ? 'day tour' : `${nights} night${nights === 1 ? '' : 's'}`;
  const guestName = joinGuestName(form.firstName, form.lastName);
  const depositAmount = selectedPackage ? getOnlinePaymentAmount(selectedPackage.totalAmount, 'deposit') : 0;
  const dateValid = Boolean(form.checkIn && (form.bookingType === 'daytour'
    ? form.checkIn >= earliestDate && form.checkIn <= maxDate
    : form.checkOut > form.checkIn && form.checkIn >= earliestDate && form.checkOut <= maxDate));
  const guestError = form.totalGuests === '' ? '' : getGroupGuestError(totalGuests);
  const noticeError = form.checkIn ? getGroupAdvanceNoticeError(form.checkIn) : '';

  const packageFeatures = useMemo(() => selectedPackage
    ? CORPORATE_FEATURE_ROWS.filter(row => isCorporateFeatureIncluded(selectedPackage.id, nights, row.id))
    : [], [selectedPackage, nights]);

  const changeField = event => {
    const { name, value, type, checked } = event.target;
    setForm(previous => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'bookingType' && value === 'daytour' ? { checkOut: previous.checkIn } : {}),
      ...(name === 'checkIn' && previous.bookingType === 'daytour' ? { checkOut: value } : {}),
      ...(name === 'checkIn' && previous.bookingType === 'overnight' && previous.checkOut && previous.checkOut <= value ? { checkOut: '' } : {}),
    }));
  };

  const startPayment = async reservationId => {
    const { checkoutUrl } = await createPayMongoCheckout({
      reservationId,
      paymentType: 'booking',
      paymentChoice: 'deposit',
    });
    window.location.href = checkoutUrl;
  };

  const submit = async event => {
    event.preventDefault();
    setErrorMessage('');
    if (availabilityLoading || !available) {
      setErrorMessage(availabilityError || 'Reservations are temporarily closed.');
      return;
    }
    if (!selectedPackage) {
      setErrorMessage(getGroupGuestError(totalGuests));
      return;
    }
    if (noticeError) {
      setErrorMessage(noticeError);
      return;
    }
    if (!dateValid) {
      setErrorMessage(`Choose dates from ${formatLongDate(earliestDate)} through ${formatLongDate(maxDate)}.`);
      return;
    }
    if (!NAME_PATTERN.test(form.firstName.trim()) || !NAME_PATTERN.test(form.lastName.trim())) {
      setErrorMessage('Enter a valid first and last name (2–35 letters each).');
      return;
    }

    setSubmitting(true);
    let reservationId = savedReservationId;
    try {
      if (!reservationId) {
        const response = await fetch('/api/create-corporate-reservation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: form.companyName.trim(),
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            guestName,
            email: form.email.trim(),
            phone: form.phone.trim(),
            preferredContactMethod: form.preferredContactMethod,
            totalGuests,
            bookingType: form.bookingType,
            checkIn: form.checkIn,
            checkOut: form.bookingType === 'daytour' ? form.checkIn : form.checkOut,
            accommodationInterest: form.accommodationInterest,
            notes: form.notes.trim(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not create the group reservation.');
        reservationId = result.reservationId;
        if (!reservationId) throw new Error('The group reservation was created without a reference. Please contact the resort.');
        setSavedReservationId(reservationId);
      }
      await startPayment(reservationId);
    } catch (error) {
      setErrorMessage(reservationId
        ? `Your group request is saved as #${reservationId.slice(0, 8).toUpperCase()}, but payment checkout could not start. You can retry the deposit payment. ${error.message}`
        : error.message || 'Could not start your group reservation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, background: '#fff', padding: '12px', color: INK, font: `13px ${SANS}` };
  const labelStyle = { display: 'grid', gap: '7px', color: FOREST, font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase' };

  return (
    <main style={{ background: PAPER, minHeight: '100vh', paddingBottom: '88px' }}>
      <style>{`
        @media (max-width: 800px) {
          .corporate-booking-layout { grid-template-columns: minmax(0, 1fr) !important; padding: 24px 16px !important; }
          .corporate-booking-layout > *, .corporate-booking-layout form > section { min-width: 0; }
          .corporate-booking-summary { position: static !important; }
        }
      `}</style>
      <header style={{ background: FOREST_DEEP, color: '#fff', padding: '64px 24px 56px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button type="button" onClick={openBookingTypeModal} style={{ border: 0, background: 'transparent', color: '#e4d4a7', padding: 0, marginBottom: '24px', cursor: 'pointer', font: `600 11px ${SANS}` }}>← CHANGE BOOKING TYPE</button>
          <div style={{ color: '#e4d4a7', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '12px' }}>Corporate / Big Group Booking · {MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS} Guests</div>
          <h1 style={{ margin: '0 0 12px', font: `500 clamp(38px, 6vw, 64px)/1.05 ${SERIF}` }}>Bring your whole team.</h1>
          <p style={{ maxWidth: '650px', color: 'rgba(255,255,255,.76)', font: `14px/1.8 ${SANS}`, margin: 0 }}>Select your group size and dates to see the Bamboo package tier and per-person pricing. A {RESERVATION_DEPOSIT_PERCENTAGE}% deposit reserves your request.</p>
        </div>
      </header>

      <div className="corporate-booking-layout" style={{ maxWidth: '1100px', margin: '0 auto', padding: '38px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: '24px', alignItems: 'start' }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: '22px' }}>
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 18px' }}>Your group</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
              <label style={labelStyle}>Company / organization<input required maxLength={120} name="companyName" value={form.companyName} onChange={changeField} style={inputStyle} /></label>
              <label style={labelStyle}>Number of guests ({MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS})<input required type="number" min={MIN_GROUP_GUESTS} max={MAX_GROUP_GUESTS} step="1" name="totalGuests" value={form.totalGuests} onChange={changeField} aria-invalid={Boolean(guestError)} style={inputStyle} />{guestError && <span role="alert" style={{ color: '#b42318', font: `500 11px/1.5 ${SANS}`, letterSpacing: 0, textTransform: 'none' }}>{guestError}</span>}</label>
              <label style={labelStyle}>Contact first name<input required minLength="2" maxLength="35" name="firstName" value={form.firstName} onChange={changeField} style={inputStyle} /></label>
              <label style={labelStyle}>Contact last name<input required minLength="2" maxLength="35" name="lastName" value={form.lastName} onChange={changeField} style={inputStyle} /></label>
              <label style={labelStyle}>Email address<input required type="email" maxLength="254" name="email" value={form.email} onChange={changeField} style={inputStyle} /></label>
              <label style={labelStyle}>Mobile number<input required type="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength="11" placeholder="09XXXXXXXXX" name="phone" value={form.phone} onChange={changeField} style={inputStyle} /></label>
              <label style={labelStyle}>Preferred Contact Method *<select required name="preferredContactMethod" value={form.preferredContactMethod} onChange={changeField} style={inputStyle}><option value="">Select a method</option>{PREFERRED_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}</select></label>
            </div>
          </section>

          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 18px' }}>Dates and stay</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
              <label style={labelStyle}>Booking format<select name="bookingType" value={form.bookingType} onChange={changeField} style={inputStyle}><option value="overnight">Overnight stay</option><option value="daytour">Day tour</option></select></label>
              <label style={labelStyle}>{form.bookingType === 'daytour' ? 'Event date' : 'Check-in'}<input required type="date" name="checkIn" min={earliestDate} max={maxDate} value={form.checkIn} onChange={changeField} aria-invalid={Boolean(noticeError)} style={inputStyle} /></label>
              {form.bookingType === 'overnight' && <label style={labelStyle}>Check-out<input required type="date" name="checkOut" min={form.checkIn || earliestDate} max={maxDate} value={form.checkOut} onChange={changeField} style={inputStyle} /></label>}
            </div>
            <p role={noticeError ? 'alert' : undefined} style={{ margin: '14px 0 0', padding: '10px 12px', background: noticeError ? '#fef3f2' : CREAM, color: noticeError ? '#b42318' : '#626355', font: `12px/1.6 ${SANS}` }}>
              {noticeError || `Group and corporate bookings must be made at least ${GROUP_ADVANCE_DAYS} days before check-in, so the resort can inspect and prepare the areas. The earliest date you can choose is ${formatLongDate(earliestDate)}.`}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '18px', color: '#626355', font: `12px/1.6 ${SANS}` }}>
              <input type="checkbox" name="accommodationInterest" checked={form.accommodationInterest} onChange={changeField} style={{ marginTop: '3px' }} />
              Please include optional accommodation and meal package options (without meals, plated meals, or managed buffet meals) in our follow-up.
            </label>
            <label style={{ ...labelStyle, marginTop: '18px' }}>Additional details<textarea name="notes" maxLength="1000" rows="4" value={form.notes} onChange={changeField} placeholder="Tell us about your retreat, seminar, or event needs." style={{ ...inputStyle, resize: 'vertical' }} /></label>
          </section>

          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 18px' }}>Package inclusions</h2>
            <p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, margin: '0 0 16px' }}>Selected inclusions are based on your guest tier and stay duration ({nights} night{nights === 1 ? '' : 's'}). Availability of accommodation and whole-property rental is confirmed by the resort.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse', font: `12px/1.5 ${SANS}`, color: INK }}>
                <thead><tr style={{ background: CREAM }}><th scope="col" style={{ textAlign: 'left', padding: '12px', minWidth: '260px' }}>Package inclusion</th>{CORPORATE_PACKAGES.map(tier => <th key={tier.id} scope="col" style={{ padding: '12px', textAlign: 'center' }}>{tier.name}<br /><span style={{ fontWeight: 400 }}>{tier.minGuests}{tier.maxGuests ? `–${tier.maxGuests}` : '+'} guests · ₱{tier.ratePerGuest.toLocaleString()} / guest</span></th>)}</tr></thead>
                <tbody>{CORPORATE_FEATURE_ROWS.map(row => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 500, padding: '12px' }}>{row.label}</th>
                    {CORPORATE_PACKAGES.map(tier => <td key={tier.id} style={{ textAlign: 'center', padding: '12px', color: isCorporateFeatureIncluded(tier.id, nights, row.id) ? FOREST : '#aaa' }}>{isCorporateFeatureIncluded(tier.id, nights, row.id) ? 'Included' : '—'}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          {errorMessage && <div role="alert" style={{ background: '#fff1f0', border: '1px solid #efc2bf', color: '#9b2c24', padding: '14px', font: `12px/1.6 ${SANS}` }}>{errorMessage}</div>}
          <button type="submit" disabled={submitting || availabilityLoading || !available || !selectedPackage} style={{ border: 0, background: FOREST, color: '#fff', padding: '16px 20px', cursor: submitting || !available ? 'not-allowed' : 'pointer', opacity: submitting || !available ? .65 : 1, font: `600 12px ${SANS}`, letterSpacing: '.06em' }}>
            {submitting ? 'STARTING SECURE CHECKOUT…' : savedReservationId ? `RETRY ${RESERVATION_DEPOSIT_PERCENTAGE}% DEPOSIT PAYMENT` : `CONTINUE · PAY ${RESERVATION_DEPOSIT_PERCENTAGE}% DEPOSIT${selectedPackage ? ` (₱${depositAmount.toLocaleString()})` : ''}`}
          </button>
        </form>

        <aside className="corporate-booking-summary" style={{ position: 'sticky', top: '105px', background: FOREST_DEEP, color: '#fff', padding: '25px' }}>
          <div style={{ color: '#e4d4a7', font: `600 10px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase' }}>Your package</div>
          {selectedPackage ? (
            <>
              <h2 style={{ font: `500 30px ${SERIF}`, margin: '12px 0 5px' }}>{selectedPackage.name}</h2>
              <div style={{ color: 'rgba(255,255,255,.7)', font: `12px ${SANS}` }}>{selectedPackage.minGuests}{selectedPackage.maxGuests ? `–${selectedPackage.maxGuests}` : '+'} guests · ₱{selectedPackage.ratePerGuest.toLocaleString()} per guest</div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,.2)', margin: '22px 0 10px', paddingTop: '16px', display: 'grid', gap: '6px', font: `12px ${SANS}`, color: 'rgba(255,255,255,.78)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span>{totalGuests} guests × ₱{selectedPackage.ratePerGuest.toLocaleString()}</span><span>₱{selectedPackage.perNightAmount.toLocaleString()}{form.bookingType === 'daytour' ? '' : ' / night'}</span></div>
                {form.bookingType !== 'daytour' && <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span>× {nightLabel}{form.checkOut ? '' : ' (pick check-out)'}</span></div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', font: `600 15px ${SANS}` }}><span>Total</span><span>₱{selectedPackage.totalAmount.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e4d4a7', font: `600 14px ${SANS}` }}><span>{RESERVATION_DEPOSIT_PERCENTAGE}% deposit</span><span>₱{depositAmount.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: 'rgba(255,255,255,.7)', font: `12px ${SANS}` }}><span>Remaining balance</span><span>₱{(selectedPackage.totalAmount - depositAmount).toLocaleString()}</span></div>
            </>
          ) : <p style={{ color: 'rgba(255,255,255,.78)', font: `13px/1.6 ${SANS}` }}>Corporate packages are available for groups of 15 guests or more.</p>}
          <p style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: '16px', margin: '20px 0 0', color: 'rgba(255,255,255,.7)', font: `11px/1.7 ${SANS}` }}>Your request is subject to resort confirmation. Optional accommodation/meal packages and whole property rental require availability confirmation.</p>
          {packageFeatures.length > 0 && <div aria-label="Included package benefits" style={{ marginTop: '18px', display: 'grid', gap: '7px', color: '#f1ead9', font: `11px/1.5 ${SANS}` }}>{packageFeatures.slice(0, 4).map(feature => <span key={feature.id}>✓ {feature.label}</span>)}</div>}
        </aside>
      </div>
    </main>
  );
}
