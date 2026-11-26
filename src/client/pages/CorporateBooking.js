import React, { useEffect, useMemo, useState } from 'react';
import { loadPublicRooms } from '../lib/publicRooms';
import { MAX_STAY_NIGHTS, getRoomMaximumGuests, getStayDurationError } from '../../lib/bookingPricing';
import { createPayMongoCheckout } from '../../lib/paymongo';
import { getOnlinePaymentAmount, RESERVATION_DEPOSIT_PERCENTAGE } from '../../lib/paymentPolicy';
import {
  formatLongDate, getCorporateNights, getCorporatePackage, getEarliestGroupDate, getGroupAdvanceNoticeError, getGroupGuestError,
  CORPORATE_FEATURE_ROWS, CORPORATE_PACKAGES, GROUP_ADVANCE_DAYS, MAX_GROUP_GUESTS, MIN_GROUP_GUESTS, isCorporateFeatureIncluded,
} from '../../lib/corporatePackages';
import { NAME_PATTERN, joinGuestName } from '../../lib/nameValidation';
import { phoneTypingError } from '../../lib/liveFieldErrors';
import { CONTACT_REQUIREMENT_NOTE, FACEBOOK_CONTACT_METHOD, PREFERRED_CONTACT_METHODS, getContactFieldErrors, getContactLinkError } from '../../lib/preferredContactMethods';
import { CREAM, FOREST, FOREST_DEEP, INK, LINE, PAPER, SERIF, SANS } from '../components/clientTheme';
import { useResortAvailability } from '../components/ResortAvailabilityContext';
import { openBookingTypeModal } from '../lib/bookingTypeModal';
import { CLIENT_TYPES, DEFAULT_PAYMENT_TERMS_DAYS, normalizeAgencyDetails, PAY_LATER_LABEL, perDiemFit } from '../../lib/agencyBilling';
import BookingSteps from '../components/BookingSteps';
import { decorateRoom } from '../lib/roomCatalog';
import { roomHasStairs } from '../../lib/roomAccess';
import { closedPeriodMessage, findClosedPeriod } from '../../lib/closedDates';
import { describeBooking } from '../../lib/stayDescription';

const GROUP_STEPS = ['Your group', 'Dates', 'Rooms', 'Review & pay'];
const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};

export default function CorporateBooking() {
  const { available, error: availabilityError, loading: availabilityLoading, closedDates = [] } = useResortAvailability();
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
    contactLink: '',
    totalGuests: 15,
    bookingType: 'overnight',
    checkIn: '',
    checkOut: '',
    accommodationInterest: false,
    notes: '',
    clientType: 'family',
    office: '',
    tin: '',
    poNumber: '',
    perDiemRate: '',
  });
  // Government agencies send a request (no online deposit) and pay after the
  // event through their Purchase Order.
  const isGovernment = form.clientType === 'government';
  const isFamily = form.clientType === 'family';
  const [sentRequest, setSentRequest] = useState(null);
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

  // The form goes step by step, like a personal booking.
  const [groupStep, setGroupStep] = useState(0);
  const [touched, setTouched] = useState({});
  const [stepFree, setStepFree] = useState(false);
  const closedPeriod = form.checkIn ? findClosedPeriod(closedDates, form.checkIn, form.bookingType === 'daytour' ? form.checkIn : form.checkOut || form.checkIn) : null;
  const contactErrors = getContactFieldErrors(form);
  const fieldErrors = {
    companyName: isFamily || form.companyName.trim() ? '' : isGovernment ? 'Enter the agency name.' : 'Enter the company or organization name.',
    totalGuests: form.totalGuests === '' ? 'Enter the number of guests.' : guestError,
    firstName: NAME_PATTERN.test(form.firstName.trim()) ? '' : 'Enter a first name (2-35 letters).',
    lastName: NAME_PATTERN.test(form.lastName.trim()) ? '' : 'Enter a last name (2-35 letters).',
    ...contactErrors,
    checkIn: !form.checkIn ? 'Choose a date.' : noticeError
      || (form.checkIn > maxDate ? `Choose a date up to ${formatLongDate(maxDate)}.` : '')
      || (closedPeriod ? closedPeriodMessage(closedPeriod) : ''),
    checkOut: form.bookingType === 'daytour' ? '' : !form.checkOut ? 'Choose a check-out date.'
      : form.checkIn && form.checkOut <= form.checkIn ? 'Check-out must be after check-in.'
        : form.checkOut > maxDate ? `Choose a date up to ${formatLongDate(maxDate)}.`
          : (form.checkIn && getStayDurationError(form.checkIn, form.checkOut)) || '',
  };
  const touch = event => { const { name } = event.target; setTouched(previous => ({ ...previous, [name]: true })); };
  const visibleError = name => (touched[name] ? fieldErrors[name] : '');
  const fieldError = name => (visibleError(name)
    ? <span role="alert" style={{ color: '#b42318', font: `500 11px/1.5 ${SANS}`, letterSpacing: 0, textTransform: 'none' }}>{visibleError(name)}</span>
    : null);
  const STEP_FIELDS = [['companyName', 'totalGuests', 'firstName', 'lastName', 'email', 'phone', 'preferredContactMethod', 'contactLink'], ['checkIn', 'checkOut'], [], []];
  const scrollToForm = () => document.getElementById('group-booking-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const goToGroupStep = step => { setErrorMessage(''); setGroupStep(step); setTimeout(scrollToForm, 0); };
  const nextGroupStep = () => {
    const names = STEP_FIELDS[groupStep];
    setTouched(previous => ({ ...previous, ...Object.fromEntries(names.map(name => [name, true])) }));
    const problem = names.map(name => fieldErrors[name]).find(Boolean);
    if (problem) return; // each problem is shown beside its field
    if (groupStep === 0 && isGovernment) {
      const agencyCheck = normalizeAgencyDetails(form);
      if (agencyCheck.error) { setErrorMessage(agencyCheck.error); return; }
    }
    goToGroupStep(groupStep + 1);
  };

  const fit = isGovernment && selectedPackage ? perDiemFit(selectedPackage.ratePerGuest, form.perDiemRate) : null;

  // Rooms the group can pick (optional): free on the chosen dates.
  const [allRooms, setAllRooms] = useState([]);
  const [freeRoomIds, setFreeRoomIds] = useState(null); // null = not checked yet
  const [roomIds, setRoomIds] = useState([]);
  const [extraRoomIds, setExtraRoomIds] = useState([]);
  const stayEnd = form.bookingType === 'daytour' ? form.checkIn : form.checkOut;
  useEffect(() => {
    loadPublicRooms()
      .then(rooms => setAllRooms(rooms.map(decorateRoom).sort((a, b) => String(a.roomNumber || '').localeCompare(String(b.roomNumber || '')))))
      .catch(() => setAllRooms([]));
  }, []);
  useEffect(() => {
    setFreeRoomIds(null);
    if (!dateValid || noticeError) return undefined;
    let active = true;
    fetch(`/api/room-availability?${new URLSearchParams({ startDate: form.checkIn, endDate: stayEnd })}`)
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(data => {
        if (!active) return;
        const free = Array.isArray(data.availableRoomIds) ? data.availableRoomIds : [];
        setFreeRoomIds(free);
        setRoomIds(current => current.filter(id => free.includes(id)));
      })
      .catch(() => { if (active) setFreeRoomIds([]); });
    return () => { active = false; };
  }, [form.checkIn, stayEnd, dateValid, noticeError]);
  const freeRooms = freeRoomIds ? allRooms.filter(room => freeRoomIds.includes(room.id) && (!stepFree || !roomHasStairs(room))) : [];
  const stairRoomsHidden = stepFree && freeRoomIds ? allRooms.filter(room => freeRoomIds.includes(room.id) && roomHasStairs(room)).length : 0;
  const [photoIndex, setPhotoIndex] = useState({});
  const movePhoto = (room, by) => setPhotoIndex(current => ({ ...current, [room.id]: ((current[room.id] || 0) + by + room.gallery.length) % room.gallery.length }));
  const pickedRooms = allRooms.filter(room => roomIds.includes(room.id));
  const includedBeds = pickedRooms.filter(room => !extraRoomIds.includes(room.id))
    .reduce((sum, room) => sum + (getRoomMaximumGuests(room) || 0), 0);
  const groupFits = totalGuests > 0 && includedBeds >= totalGuests;
  const toggleRoom = id => {
    if (roomIds.includes(id)) {
      setRoomIds(current => current.filter(roomId => roomId !== id));
      setExtraRoomIds(current => current.filter(roomId => roomId !== id));
      return;
    }
    if (groupFits) setExtraRoomIds(current => [...current, id]);
    setRoomIds(current => [...current, id]);
  };
  const toggleExtraRoom = id => setExtraRoomIds(current => (
    current.includes(id) ? current.filter(roomId => roomId !== id) : [...current, id]
  ));
  useEffect(() => {
    if (!stepFree || !allRooms.length) return;
    const inaccessible = new Set(allRooms.filter(room => roomHasStairs(room)).map(room => room.id));
    setRoomIds(current => current.filter(id => !inaccessible.has(id)));
    setExtraRoomIds(current => current.filter(id => !inaccessible.has(id)));
  }, [stepFree, allRooms]);
  // Longest stay: 30 nights (same as other bookings).
  const lastCheckOut = (() => {
    if (!form.checkIn) return maxDate;
    const date = new Date(`${form.checkIn}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + MAX_STAY_NIGHTS);
    const key = date.toISOString().slice(0, 10);
    return maxDate && maxDate < key ? maxDate : key;
  })();

  const packageFeatures = useMemo(() => selectedPackage
    ? CORPORATE_FEATURE_ROWS.filter(row => isCorporateFeatureIncluded(selectedPackage.id, nights, row.id))
    : [], [selectedPackage, nights]);

  const changeField = event => {
    const { name, value, type, checked } = event.target;
    // Dates and choices are checked straight away; typed fields when left.
    if (['checkIn', 'checkOut', 'totalGuests', 'preferredContactMethod'].includes(name)) {
      setTouched(previous => ({ ...previous, [name]: true, ...(name === 'preferredContactMethod' ? { email: true, phone: true } : {}) }));
    }
    // A mobile number that can no longer be valid is flagged while typing.
    if (name === 'phone' && phoneTypingError(value)) setTouched(previous => ({ ...previous, phone: true }));
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
    if (groupStep < GROUP_STEPS.length - 1) { nextGroupStep(); return; }
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
    if (roomIds.length && includedBeds < totalGuests) {
      setErrorMessage('The rooms marked as included need enough capacity for everyone. Mark only additional rooms as extra.');
      setGroupStep(2);
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
    const contactProblem = STEP_FIELDS[0].map(name => fieldErrors[name]).find(Boolean);
    if (contactProblem) {
      setErrorMessage(contactProblem);
      setGroupStep(0);
      return;
    }
    const agency = isGovernment ? normalizeAgencyDetails(form) : { value: null };
    if (agency.error) {
      setErrorMessage(agency.error);
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
            roomIds,
            extraRoomIds,
            stepFree,
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            guestName,
            email: form.email.trim(),
            phone: form.phone.trim(),
            preferredContactMethod: form.preferredContactMethod,
            contactLink: form.preferredContactMethod === FACEBOOK_CONTACT_METHOD ? form.contactLink.trim() : '',
            totalGuests,
            bookingType: form.bookingType,
            checkIn: form.checkIn,
            checkOut: form.bookingType === 'daytour' ? form.checkIn : form.checkOut,
            accommodationInterest: form.accommodationInterest,
            notes: form.notes.trim(),
            clientType: form.clientType,
            ...(isGovernment ? { agency: agency.value } : {}),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          // A picked room was just taken: check the free rooms again.
          if (result.code === 'ROOM_TAKEN') setFreeRoomIds(null);
          throw new Error(result.error || 'Could not create the group reservation.');
        }
        reservationId = result.reservationId;
        if (!reservationId) throw new Error('The group reservation was created without a reference. Please contact the resort.');
        setSavedReservationId(reservationId);
        if (result.chargeToAgency) {
          setSentRequest({ reference: reservationId.slice(0, 8).toUpperCase(), email: form.email.trim() });
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
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
          .corporate-packages-top { padding: 24px 16px 0 !important; }
        }
        @media (max-width: 640px) {
          .corporate-packages-top .pkg-table { display: none !important; }
          .corporate-packages-top .pkg-cards { display: grid !important; }
        }
      `}</style>
      <header style={{ background: FOREST_DEEP, color: '#fff', padding: '64px 24px 56px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button type="button" onClick={openBookingTypeModal} style={{ border: 0, background: 'transparent', color: '#e4d4a7', padding: 0, marginBottom: '24px', cursor: 'pointer', font: `600 11px ${SANS}` }}>← CHANGE BOOKING TYPE</button>
          <div style={{ color: '#e4d4a7', font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '12px' }}>Big Group Booking · Families, companies & agencies · {MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS} Guests</div>
          <h1 style={{ margin: '0 0 12px', font: `500 clamp(38px, 6vw, 64px)/1.05 ${SERIF}` }}>Bring the whole group.</h1>
          <p style={{ maxWidth: '650px', color: 'rgba(255,255,255,.76)', font: `14px/1.8 ${SANS}`, margin: 0 }}>For family reunions, celebrations, company outings and government events. Select your group size and dates to see the Bamboo package and per-person price, and pick your rooms. A {RESERVATION_DEPOSIT_PERCENTAGE}% deposit reserves your request.</p>
        </div>
      </header>

      {/* Packages first, so guests compare tiers before filling in the form. */}
      <div className="corporate-packages-top" style={{ maxWidth: '1100px', margin: '0 auto', padding: '38px 24px 0' }}>
        <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
          <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 8px' }}>Compare packages</h2>
          <p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, margin: '0 0 16px' }}>
            Your package depends on the number of guests. Prices are per guest, per night (a day tour counts as one).
            Inclusions shown for {form.bookingType === 'daytour' ? 'a day tour' : `${nights} night${nights === 1 ? '' : 's'}`}. Availability of accommodation and whole-property rental is confirmed by the resort.
          </p>
          <div className="pkg-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse', font: `12px/1.5 ${SANS}`, color: INK }}>
              <thead>
                <tr style={{ background: CREAM }}>
                  <th scope="col" style={{ textAlign: 'left', padding: '12px', minWidth: '260px' }}>Package inclusion</th>
                  {CORPORATE_PACKAGES.map(tier => {
                    const yours = selectedPackage?.id === tier.id;
                    return (
                      <th key={tier.id} scope="col" style={{ padding: '12px', textAlign: 'center', background: yours ? FOREST : undefined, color: yours ? '#fff' : undefined }}>
                        {tier.name}{yours && <span style={{ display: 'block', font: `600 9px ${SANS}`, letterSpacing: '.12em', color: '#e4d4a7' }}>YOUR GROUP</span>}
                        <span style={{ display: 'block', fontWeight: 400 }}>{tier.minGuests}{tier.maxGuests ? `–${tier.maxGuests}` : '+'} guests · ₱{tier.ratePerGuest.toLocaleString()} / guest</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>{CORPORATE_FEATURE_ROWS.map(row => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 500, padding: '12px' }}>{row.label}</th>
                  {CORPORATE_PACKAGES.map(tier => (
                    <td key={tier.id} style={{ textAlign: 'center', padding: '12px', background: selectedPackage?.id === tier.id ? '#f1f5ec' : undefined, color: isCorporateFeatureIncluded(tier.id, nights, row.id) ? FOREST : '#aaa' }}>
                      {isCorporateFeatureIncluded(tier.id, nights, row.id) ? 'Included' : '—'}
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {/* Phones: one card per package, so nothing is hidden off to the side. */}
          <div className="pkg-cards" style={{ display: 'none', gap: '12px' }}>
            {CORPORATE_PACKAGES.map(tier => {
              const yours = selectedPackage?.id === tier.id;
              const included = CORPORATE_FEATURE_ROWS.filter(row => isCorporateFeatureIncluded(tier.id, nights, row.id));
              return (
                <article key={tier.id} style={{ border: `1px solid ${yours ? FOREST : LINE}`, background: yours ? '#f1f5ec' : '#fff', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ color: FOREST_DEEP, font: `600 16px ${SANS}` }}>{tier.name}</strong>
                    {yours && <span style={{ background: FOREST, color: '#fff', font: `600 9px ${SANS}`, letterSpacing: '.12em', padding: '3px 8px' }}>YOUR GROUP</span>}
                  </div>
                  <div style={{ color: '#626355', font: `12px/1.6 ${SANS}`, margin: '2px 0 8px' }}>
                    {tier.minGuests}{tier.maxGuests ? `–${tier.maxGuests}` : '+'} guests · ₱{tier.ratePerGuest.toLocaleString()} per guest, per night
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: INK, font: `12px/1.7 ${SANS}` }}>
                    {included.map(row => <li key={row.id}><span aria-hidden="true" style={{ color: FOREST, fontWeight: 700 }}>✓</span> {row.label}</li>)}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="corporate-booking-layout" style={{ maxWidth: '1100px', margin: '0 auto', padding: '38px 24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: '24px', alignItems: 'start' }}>
        {sentRequest ? (
          <section role="status" style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '28px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 10px' }}>Request sent: #{sentRequest.reference}</h2>
            <p style={{ color: INK, font: `14px/1.7 ${SANS}`, margin: '0 0 10px' }}>Thank you. {sentRequest.email ? <>We emailed a copy to <strong>{sentRequest.email}</strong>.</> : 'The resort will contact you using your preferred contact method.'}</p>
            <ol style={{ color: '#4b4d42', font: `13px/1.8 ${SANS}`, paddingLeft: '20px', margin: 0 }}>
              <li>Our team sends your agency a quotation.</li>
              <li>Your agency issues the Purchase Order (PO) and sends it to us.</li>
              <li>We confirm the booking once the PO is received.</li>
              <li>Your group enjoys the stay first: nothing to pay at check-in or check-out.</li>
              <li>After the event, we send the Statement of Account and your agency pays within {DEFAULT_PAYMENT_TERMS_DAYS} days after check-out.</li>
            </ol>
          </section>
        ) : (
        <form id="group-booking-form" noValidate onSubmit={submit} style={{ display: 'grid', gap: '22px', scrollMarginTop: '100px', minWidth: 0 }}>
          <BookingSteps steps={GROUP_STEPS} current={groupStep} onStep={goToGroupStep} style={{ marginBottom: 0 }} />
          {groupStep === 0 && (
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 18px' }}>Your group</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
              <label style={labelStyle}>Who is booking?<select name="clientType" value={form.clientType} onChange={changeField} style={inputStyle}>{CLIENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
              <label style={labelStyle}>{isGovernment ? 'Agency name' : isFamily ? 'Group name (optional)' : 'Company / organization'}<input required={!isFamily} maxLength={120} name="companyName" value={form.companyName} onChange={changeField} placeholder={isGovernment ? 'e.g. Department of Education' : isFamily ? 'e.g. Santos family reunion' : ''} onBlur={touch} aria-invalid={Boolean(visibleError('companyName'))} style={inputStyle} />{fieldError('companyName')}</label>
              {isGovernment && (
                <>
                  <label style={labelStyle}>Office / unit (optional)<input maxLength={120} name="office" value={form.office} onChange={changeField} placeholder="e.g. Region III, HR Division" style={inputStyle} /></label>
                  <label style={labelStyle}>Agency TIN (optional)<input maxLength={20} name="tin" value={form.tin} onChange={changeField} placeholder="123-456-789-000" style={inputStyle} /></label>
                  <label style={labelStyle}>Per diem per person per day (optional)<input type="number" min="0" max="20000" name="perDiemRate" value={form.perDiemRate} onChange={changeField} placeholder="₱" style={inputStyle} /></label>
                  <label style={labelStyle}>Purchase Order no. (if you have it)<input maxLength={40} name="poNumber" value={form.poNumber} onChange={changeField} placeholder="Can be sent later" style={inputStyle} /></label>
                </>
              )}
              <label style={labelStyle}>Number of guests ({MIN_GROUP_GUESTS}–{MAX_GROUP_GUESTS})<input required type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" name="totalGuests" value={form.totalGuests} onChange={event => changeField({ target: { name: 'totalGuests', value: event.target.value.replace(/\D/g, '').slice(0, 3), type: 'text' } })} aria-invalid={Boolean(guestError)} style={inputStyle} />{fieldError('totalGuests')}</label>
              <p role="note" style={{ gridColumn: '1 / -1', margin: '4px 0 0', padding: '10px 12px', background: '#f6f8f1', border: '1px solid #dfe6d2', borderRadius: 10, fontSize: 12, lineHeight: 1.55, color: '#374151' }}>
                <strong>At least one contact is required.</strong> {CONTACT_REQUIREMENT_NOTE}
              </p>
              <label style={labelStyle}>Contact first name<input required minLength="2" maxLength="35" name="firstName" value={form.firstName} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('firstName'))} style={inputStyle} />{fieldError('firstName')}</label>
              <label style={labelStyle}>Contact last name<input required minLength="2" maxLength="35" name="lastName" value={form.lastName} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('lastName'))} style={inputStyle} />{fieldError('lastName')}</label>
              <label style={labelStyle}>{form.preferredContactMethod === 'Email' ? 'Email address' : 'Email address (optional)'}<input type="email" maxLength="254" name="email" value={form.email} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('email'))} style={inputStyle} />{fieldError('email')}</label>
              <label style={labelStyle}>{form.preferredContactMethod === 'Phone' ? 'Mobile number' : 'Mobile number (optional)'}<input type="tel" inputMode="numeric" maxLength="11" placeholder="09XXXXXXXXX" name="phone" value={form.phone} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('phone'))} style={inputStyle} />{fieldError('phone')}</label>
              <label style={labelStyle}>Preferred Contact Method<select name="preferredContactMethod" value={form.preferredContactMethod} onChange={changeField} style={inputStyle}><option value="">Select a method</option>{PREFERRED_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}</select>{fieldError('preferredContactMethod')}
                {['Email', 'Phone'].includes(form.preferredContactMethod) && (
                  <span style={{ font: `500 12px/1.5 ${SANS}`, letterSpacing: 0, textTransform: 'none', color: FOREST_DEEP }}>
                    {(form.preferredContactMethod === 'Email' ? form.email : form.phone).trim()
                      ? <>We'll contact you at <strong style={{ overflowWrap: 'anywhere' }}>{(form.preferredContactMethod === 'Email' ? form.email : form.phone).trim()}</strong></>
                      : `Enter your ${form.preferredContactMethod === 'Email' ? 'email address' : 'mobile number'} above.`}
                  </span>
                )}
              </label>
              {form.preferredContactMethod === FACEBOOK_CONTACT_METHOD && (
                <label style={labelStyle}>Facebook profile link
                  <input type="url" maxLength="200" name="contactLink" value={form.contactLink} onChange={changeField} onBlur={touch} placeholder="https://www.facebook.com/your.name" style={inputStyle} />
                  <span style={{ font: `500 11px/1.5 ${SANS}`, letterSpacing: 0, textTransform: 'none', color: form.contactLink && getContactLinkError(form.preferredContactMethod, form.contactLink) ? '#b42318' : '#6b7280' }}>
                    {(form.contactLink && getContactLinkError(form.preferredContactMethod, form.contactLink)) || 'Copy the link from your Facebook profile and paste it here.'}
                  </span>
                </label>
              )}
            </div>
          </section>
          )}

          {groupStep === 1 && (
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px' }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 18px' }}>Dates and stay</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
              <label style={labelStyle}>Booking format<select name="bookingType" value={form.bookingType} onChange={changeField} style={inputStyle}><option value="overnight">Overnight stay</option><option value="daytour">Day tour</option></select></label>
              <label style={labelStyle}>{form.bookingType === 'daytour' ? 'Event date' : 'Check-in'}<input type="date" name="checkIn" min={earliestDate} max={maxDate} value={form.checkIn} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('checkIn'))} style={inputStyle} />{fieldError('checkIn')}</label>
              {form.bookingType === 'overnight' && <label style={labelStyle}>Check-out (up to {MAX_STAY_NIGHTS} nights)<input type="date" name="checkOut" min={form.checkIn || earliestDate} max={lastCheckOut} value={form.checkOut} onChange={changeField} onBlur={touch} aria-invalid={Boolean(visibleError('checkOut'))} style={inputStyle} />{fieldError('checkOut')}</label>}
            </div>
            {form.bookingType === 'overnight' && form.checkIn && form.checkOut && form.checkOut > form.checkIn && (
              <p style={{ margin: '14px 0 0', color: FOREST, font: `600 13px/1.6 ${SANS}` }}>
                {nights} night{nights === 1 ? '' : 's'} · {formatLongDate(form.checkIn)} to {formatLongDate(form.checkOut)}{nights > MAX_STAY_NIGHTS ? ` (the most is ${MAX_STAY_NIGHTS} nights)` : ''}
              </p>
            )}
            <p style={{ margin: '14px 0 0', padding: '10px 12px', background: CREAM, color: '#626355', font: `12px/1.6 ${SANS}` }}>
              {`Overnight group stays can be 1 to ${MAX_STAY_NIGHTS} nights. Group and corporate bookings must be made at least ${GROUP_ADVANCE_DAYS} days before check-in, so the resort can inspect and prepare the areas. The earliest date you can choose is ${formatLongDate(earliestDate)}.`}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '18px', color: '#626355', font: `12px/1.6 ${SANS}` }}>
              <input type="checkbox" name="accommodationInterest" checked={form.accommodationInterest} onChange={changeField} style={{ marginTop: '3px' }} />
              Please include optional accommodation and meal package options (without meals, plated meals, or managed buffet meals) in our follow-up.
            </label>
            <label style={{ ...labelStyle, marginTop: '18px' }}>Additional details (optional)<textarea name="notes" maxLength="1000" rows="4" value={form.notes} onChange={changeField} placeholder="Tell us about your retreat, seminar, or event needs." style={{ ...inputStyle, resize: 'vertical' }} /></label>
          </section>
          )}

          {groupStep === 2 && (
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px', minWidth: 0 }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 6px' }}>Choose your rooms</h2>
            <p style={{ margin: '0 0 14px', color: '#626355', font: `13px/1.6 ${SANS}` }}>Optional. Pick the rooms you want, or continue and the resort will assign rooms for your group.</p>
            <label style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', margin: '0 0 14px', color: INK, font: `13px/1.5 ${SANS}`, cursor: 'pointer' }}>
              <input type="checkbox" checked={stepFree} onChange={event => setStepFree(event.target.checked)} style={{ marginTop: '3px' }} />
              <span>A senior citizen or guest with limited mobility is in our group <span style={{ color: '#6b6a5c' }}>(hide rooms with stairs{stairRoomsHidden ? `: ${stairRoomsHidden} hidden` : ''})</span></span>
            </label>
            {freeRoomIds === null ? (
              <p role="status" style={{ margin: 0, color: '#626355', font: `13px/1.6 ${SANS}` }}>Checking free rooms…</p>
            ) : freeRooms.length === 0 ? (
              <p style={{ margin: 0, color: '#626355', font: `13px/1.6 ${SANS}` }}>No matching rooms are free on these dates. You can still book the package; the resort will contact you about rooms.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '12px' }}>
                {freeRooms.map(room => {
                  const on = roomIds.includes(room.id);
                  const photo = room.gallery[(photoIndex[room.id] || 0) % room.gallery.length] || room.cover;
                  const arrow = side => ({ position: 'absolute', top: '50%', [side]: 6, transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,.9)', color: FOREST_DEEP, cursor: 'pointer' });
                  return (
                    <article key={room.id} style={{ border: `2px solid ${on ? FOREST : LINE}`, background: on ? CREAM : '#fff', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ position: 'relative', height: 140, background: '#000' }}>
                        <img src={photo} alt={`${room.title}, view ${(photoIndex[room.id] || 0) + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {room.gallery.length > 1 && (
                          <>
                            <button type="button" aria-label={`Previous photo of ${room.title}`} onClick={() => movePhoto(room, -1)} style={arrow('left')}>‹</button>
                            <button type="button" aria-label={`Next photo of ${room.title}`} onClick={() => movePhoto(room, 1)} style={arrow('right')}>›</button>
                          </>
                        )}
                      </div>
                      <div style={{ padding: '12px', display: 'grid', gap: '4px', flex: 1, font: `12px/1.5 ${SANS}`, color: '#626355' }}>
                        <strong style={{ font: `500 18px ${SERIF}`, color: INK }}>{room.title}</strong>
                        <span>{room.groupTitle} · up to {getRoomMaximumGuests(room) || '?'} guests</span>
                        {room.location && <span>{room.location}</span>}
                        <button type="button" aria-pressed={on} onClick={() => toggleRoom(room.id)}
                          style={{ marginTop: '8px', border: `1px solid ${FOREST}`, background: on ? FOREST : '#fff', color: on ? '#fff' : FOREST, padding: '9px', font: `600 12px ${SANS}`, cursor: 'pointer' }}>
                          {on ? '✓ Selected' : 'Select room'}
                        </button>
                        {on && (
                          <label style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, color: INK, font: `12px ${SANS}` }}>
                            <input type="checkbox" checked={extraRoomIds.includes(room.id)} onChange={() => toggleExtraRoom(room.id)} />
                            Extra room · charged separately
                          </label>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {roomIds.length > 0 && (
              <p role="status" style={{ margin: '12px 0 0', color: FOREST, font: `600 13px/1.6 ${SANS}` }}>
                {roomIds.length} room{roomIds.length === 1 ? '' : 's'} selected, {includedBeds} included beds for {totalGuests || 0} guests.
                {extraRoomIds.length ? ` ${extraRoomIds.length} extra room${extraRoomIds.length === 1 ? '' : 's'} will be charged at the selected room rate.` : ''}
                {' '}They are held for your group once you book.
              </p>
            )}
          </section>
          )}

          {groupStep === 3 && (
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '24px', minWidth: 0 }}>
            <h2 style={{ color: FOREST_DEEP, font: `500 28px ${SERIF}`, margin: '0 0 14px' }}>Review your booking</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', margin: 0, font: `13px/1.5 ${SANS}`, color: INK }}>
              {[
                ['Group', form.companyName.trim() || `${form.lastName.trim()} family`],
                ['Guests', totalGuests],
                ['Contact', guestName],
                ['Preferred contact', form.preferredContactMethod === 'Email' ? form.email.trim() : form.preferredContactMethod === 'Phone' ? form.phone.trim() : form.contactLink.trim()],
                [form.bookingType === 'daytour' ? 'Event date' : 'Stay', form.bookingType === 'daytour' ? formatLongDate(form.checkIn) : `${formatLongDate(form.checkIn)} to ${formatLongDate(form.checkOut)}`],
                ['Rooms', pickedRooms.length ? pickedRooms.map(room => room.title).join(', ') : 'Assigned by the resort'],
              ].map(([term, value]) => <div key={term} style={{ minWidth: 0 }}><dt style={{ color: '#6b6a5c', fontSize: '11px' }}>{term}</dt><dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</dd></div>)}
            </dl>
          </section>
          )}

          {errorMessage && <div role="alert" style={{ background: '#fff1f0', border: '1px solid #efc2bf', color: '#9b2c24', padding: '14px', font: `12px/1.6 ${SANS}` }}>{errorMessage}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            {groupStep > 0 ? <button type="button" onClick={() => goToGroupStep(groupStep - 1)} style={{ border: `1px solid ${LINE}`, background: '#fff', color: FOREST, padding: '15px 20px', cursor: 'pointer', font: `600 12px ${SANS}` }}>← BACK</button> : <span />}
            {groupStep < GROUP_STEPS.length - 1
              ? <button type="button" onClick={nextGroupStep} style={{ flex: '1 1 220px', border: 0, background: FOREST, color: '#fff', padding: '16px 20px', cursor: 'pointer', font: `600 12px ${SANS}`, letterSpacing: '.06em' }}>NEXT: {GROUP_STEPS[groupStep + 1].toUpperCase()} →</button>
              : (
          <button type="submit" disabled={submitting || availabilityLoading || !available || !selectedPackage} style={{ border: 0, background: FOREST, color: '#fff', padding: '16px 20px', cursor: submitting || !available ? 'not-allowed' : 'pointer', opacity: submitting || !available ? .65 : 1, font: `600 12px ${SANS}`, letterSpacing: '.06em' }}>
            {isGovernment ? (submitting ? 'SENDING REQUEST…' : 'SEND BOOKING REQUEST · NO PAYMENT NOW') : submitting ? 'STARTING SECURE CHECKOUT…' : savedReservationId ? `RETRY ${RESERVATION_DEPOSIT_PERCENTAGE}% DEPOSIT PAYMENT` : `CONTINUE · PAY ${RESERVATION_DEPOSIT_PERCENTAGE}% DEPOSIT${selectedPackage ? ` (₱${depositAmount.toLocaleString()})` : ''}`}
          </button>
              )}
          </div>
        </form>
        )}

        <aside className="corporate-booking-summary" style={{ position: 'sticky', top: '105px', background: FOREST_DEEP, color: '#fff', padding: '25px' }}>
          <div style={{ color: '#e4d4a7', font: `600 10px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase' }}>Your package</div>
          {selectedPackage ? (
            <>
              <h2 style={{ font: `500 30px ${SERIF}`, margin: '12px 0 5px' }}>{selectedPackage.name}</h2>
              <div style={{ color: 'rgba(255,255,255,.7)', font: `12px ${SANS}` }}>{selectedPackage.minGuests}{selectedPackage.maxGuests ? `–${selectedPackage.maxGuests}` : '+'} guests · ₱{selectedPackage.ratePerGuest.toLocaleString()} per guest</div>
              {form.checkIn && (form.bookingType === 'daytour' || form.checkOut) && (
                // "Bamboo Core · 20 guests · 15 nights (Nov 22 – Dec 7, 2026)"
                <div style={{ marginTop: '12px', background: 'rgba(255,255,255,.1)', padding: '10px 12px', font: `600 13px/1.5 ${SANS}` }}>
                  {describeBooking({ type: 'corporate', packageName: selectedPackage.name, totalGuests, bookingType: form.bookingType, checkIn: form.checkIn, checkOut: form.bookingType === 'daytour' ? form.checkIn : form.checkOut })}
                </div>
              )}
              <div style={{ borderTop: '1px solid rgba(255,255,255,.2)', margin: '22px 0 10px', paddingTop: '16px', display: 'grid', gap: '6px', font: `12px ${SANS}`, color: 'rgba(255,255,255,.78)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span>{totalGuests} guests × ₱{selectedPackage.ratePerGuest.toLocaleString()}</span><span>₱{selectedPackage.perNightAmount.toLocaleString()}{form.bookingType === 'daytour' ? '' : ' / night'}</span></div>
                {form.bookingType !== 'daytour' && <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span>× {nightLabel}{form.checkOut ? '' : ' (pick check-out)'}</span></div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', font: `600 15px ${SANS}` }}><span>Total</span><span>₱{selectedPackage.totalAmount.toLocaleString()}</span></div>
              {extraRoomIds.length > 0 && (
                <p style={{ margin: '-6px 0 14px', color: '#e4d4a7', font: `11px/1.5 ${SANS}` }}>
                  {extraRoomIds.length} extra room{extraRoomIds.length === 1 ? '' : 's'} billed at the published room rate. Extra-room charges are added to the total and deposit at checkout.
                </p>
              )}
              {isGovernment ? (
                <div style={{ display: 'grid', gap: '8px', color: 'rgba(255,255,255,.82)', font: `12px/1.6 ${SANS}` }}>
                  <div style={{ color: '#e4d4a7', fontWeight: 600 }}>{PAY_LATER_LABEL}: no payment now</div>
                  {fit && <div style={{ color: fit.fits ? '#c8e6a0' : '#fcd9a8' }}>{fit.message}</div>}
                  <div>We email a quotation. Your agency issues the PO, your group enjoys the stay, and the agency pays within {DEFAULT_PAYMENT_TERMS_DAYS} days after check-out against our Statement of Account.</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e4d4a7', font: `600 14px ${SANS}` }}><span>{RESERVATION_DEPOSIT_PERCENTAGE}% deposit</span><span>₱{depositAmount.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: 'rgba(255,255,255,.7)', font: `12px ${SANS}` }}><span>Remaining balance</span><span>₱{(selectedPackage.totalAmount - depositAmount).toLocaleString()}</span></div>
                </>
              )}
            </>
          ) : <p style={{ color: 'rgba(255,255,255,.78)', font: `13px/1.6 ${SANS}` }}>Corporate packages are available for groups of 15 guests or more.</p>}
          <p style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: '16px', margin: '20px 0 0', color: 'rgba(255,255,255,.7)', font: `11px/1.7 ${SANS}` }}>Your request is subject to resort confirmation. Optional accommodation/meal packages and whole property rental require availability confirmation.</p>
          {packageFeatures.length > 0 && <div aria-label="Included package benefits" style={{ marginTop: '18px', display: 'grid', gap: '7px', color: '#f1ead9', font: `11px/1.5 ${SANS}` }}>{packageFeatures.slice(0, 4).map(feature => <span key={feature.id}>✓ {feature.label}</span>)}</div>}
        </aside>
      </div>
    </main>
  );
}
