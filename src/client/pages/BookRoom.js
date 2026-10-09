import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { createPayMongoCheckout } from '../../lib/paymongo';
import { getOnlinePaymentAmount } from '../../lib/paymentPolicy';
import {
  calculateBookingPrice,
  COTTAGE_OPTIONS,
  DAYTOUR_TIME_SLOT,
  NIGHTTOUR_TIME_SLOT,
  OVERNIGHT_TIME_SLOTS,
} from '../../lib/bookingPricing';
import { FALLBACK_ROOM_IMAGES, resolveRoomImage } from '../components/clientTheme';
import OccupancyBadge from '../components/OccupancyBadge';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f0f7f0';
const RECEIPT_NOTICE = 'Your official booking receipt and confirmation details will be sent to the email address provided.';

const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};

// Small inline icons (no emojis) -----------------------------------------

function IconBed({ size = 48, color = 'rgba(255,255,255,0.85)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 18v2M22 18v2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 10V7a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="8" r="1.2" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function IconWarning({ size = 40, color = '#9ca3af' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M12 8v5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16" r="0.9" fill={color} />
    </svg>
  );
}

function IconCheck({ size = 32, color = DARK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock({ size = 12, color = '#9ca3af' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCard({ size = 16, color = '#111' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M2 10h20" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

const WALLETS = [
  { id: 'gcash', label: 'GCash' },
  { id: 'maya', label: 'Maya' },
  { id: 'grabpay', label: 'GrabPay' },
];

// --------------------------------------------------------------------------

export default function BookRoom() {
  const navigate = useNavigate();
  const today = formatDate(new Date());
  const maximumBookingDate = formatDate(addMonths(new Date(), 2));
  const roomId = window.location.pathname.split('/').pop();
  const params = new URLSearchParams(window.location.search);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Preview-only state — used when /api/create-checkout-session can't be
  // reached (e.g. running `npm start` locally instead of `vercel dev`).
  // Nothing entered here is ever sent anywhere; it exists purely so the
  // payment step can be reviewed visually during development.
  const [previewMode, setPreviewMode] = useState(false);
  const [previewMethod, setPreviewMethod] = useState('gcash'); // 'gcash' | 'maya' | 'grabpay' | 'card'
  const [previewReservationRef, setPreviewReservationRef] = useState('');
  const [termsRead, setTermsRead] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoFeedback, setPromoFeedback] = useState(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [form, setForm] = useState({
    guestName: '',
    email: '',
    phone: '',
    address: '',
    checkIn: params.get('checkIn') || '',
    checkOut: params.get('checkOut') || '',
    adults: 1,
    children: 0,
    bookingType: 'overnight',
    tourPeriod: 'day',
    overnightTimeSlot: 'morning',
    cottageId: '',
    cottageFee: 0,
    notes: '',
    paymentMethod: 'online',
    website: '', // honeypot — real guests leave this blank; see hidden field below
  });
  const datesValid = Boolean(form.checkIn && form.checkOut
    && form.checkIn >= today && form.checkOut > form.checkIn
    && form.checkIn <= maximumBookingDate && form.checkOut <= maximumBookingDate);
  const nights = form.checkIn && form.checkOut
    ? Math.ceil((new Date(`${form.checkOut}T00:00:00`) - new Date(`${form.checkIn}T00:00:00`)) / (1000 * 60 * 60 * 24))
    : 0;
  const stayUnit = form.bookingType === 'daytour' ? 'day' : 'night';
  const pricing = room && nights > 0
    ? calculateBookingPrice({
      room,
      bookingType: form.bookingType,
      nights,
      adults: Number(form.adults),
      children: Number(form.children),
      tourPeriod: form.tourPeriod,
      cottageId: form.cottageId,
      cottageFee: Number(form.cottageFee),
    })
    : null;
  const totalAmount = pricing?.subtotalAmount || 0;
  const [selectedPaymentChoice, setSelectedPaymentChoice] = useState('');
  const activePromo = appliedPromo?.subtotal === totalAmount ? appliedPromo : null;
  const discountAmount = activePromo?.discountAmount || 0;
  const bookingTotal = Math.max(0, totalAmount - discountAmount);
  const paymentChoice = selectedPaymentChoice || (bookingTotal < 5000 ? 'full' : 'deposit');
  const onlinePaymentAmount = bookingTotal > 0 ? getOnlinePaymentAmount(bookingTotal, paymentChoice) : 0;
  const depositPercentage = 25;

  useEffect(() => {
    const fetchRoom = async () => {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
      setLoading(false);
    };
    fetchRoom();
  }, [roomId]);

  useEffect(() => {
    if (appliedPromo && appliedPromo.subtotal !== totalAmount) {
      setAppliedPromo(null);
      setPromoFeedback({ type: 'error', text: 'Stay dates changed. Apply the promo code again.' });
    }
  }, [appliedPromo, totalAmount]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code || totalAmount <= 0) return;
    setPromoChecking(true);
    setPromoFeedback(null);
    try {
      const response = await fetch('/api/validate-promo-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: totalAmount }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not apply this promo code.');
      setAppliedPromo({ ...result, subtotal: totalAmount });
      setPromoInput(result.code);
      setPromoFeedback({ type: 'success', text: `-₱${Number(result.discountAmount).toLocaleString()} (${result.code} applied)` });
    } catch (error) {
      setAppliedPromo(null);
      setPromoFeedback({ type: 'error', text: error.message || 'Could not apply this promo code.' });
    } finally {
      setPromoChecking(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoFeedback(null);
  };

  const validateField = (key, value) => {
    if (key === 'guestName') {
      const name = String(value || '').trim();
      return /^[A-Za-z '-]{2,50}$/.test(name)
        ? ''
        : 'Full Name must contain only letters and spaces (2-50 characters).';
    }
    if (key === 'phone') {
      return /^09\d{9}$/.test(String(value || ''))
        ? ''
        : 'Please enter a valid 11-digit mobile number.';
    }
    return '';
  };

  const handleGuestFieldChange = (event) => {
    const { name, value } = event.target;
    const sanitized = name === 'guestName'
      ? value.replace(/[^a-zA-Z '-]/g, '').slice(0, 50)
      : value.replace(/\D/g, '').slice(0, 11);
    setForm(previous => ({ ...previous, [name]: sanitized }));
    setFieldErrors(previous => ({ ...previous, [name]: '' }));
  };

  const handleGuestFieldBlur = (event) => {
    const { name, value } = event.target;
    const normalized = name === 'guestName' ? value.trim() : value;
    if (normalized !== value) setForm(previous => ({ ...previous, [name]: normalized }));
    setFieldErrors(previous => ({ ...previous, [name]: validateField(name, normalized) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!room) return;
    const guestErrors = {
      guestName: validateField('guestName', form.guestName),
      phone: validateField('phone', form.phone),
    };
    setFieldErrors(guestErrors);
    if (Object.values(guestErrors).some(Boolean)) {
      document.getElementById(Object.keys(guestErrors).find(key => guestErrors[key]))?.focus();
      return;
    }
    if (!datesValid || nights <= 0) return alert('Please choose valid stay dates from the availability calendar first.');
    if (!termsRead || !termsAccepted) return alert('Please read the full Terms and Agreement and confirm that you agree before continuing.');

    setSubmitting(true);
    setErrorMsg('');
    setPreviewMode(false);

    try {
      // Reservation creation now happens server-side (see
      // /api/create-reservation.js). That endpoint runs the honeypot check
      // and a date-overlap check against existing
      // reservations for this room — none of which can be trusted if done
      // only in the browser, since a bot can skip your page's JS entirely
      // and call this same endpoint directly. The server is the one place
      // these checks actually hold.
      const response = await fetch('/api/create-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          guestName: form.guestName,
          email: form.email,
          phone: form.phone,
          address: form.address,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          checkInTime: form.bookingType === 'daytour'
            ? (form.tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT.checkIn : DAYTOUR_TIME_SLOT.checkIn)
            : OVERNIGHT_TIME_SLOTS.find(slot => slot.id === form.overnightTimeSlot).checkIn,
          checkOutTime: form.bookingType === 'daytour'
            ? (form.tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT.checkOut : DAYTOUR_TIME_SLOT.checkOut)
            : OVERNIGHT_TIME_SLOTS.find(slot => slot.id === form.overnightTimeSlot).checkOut,
          adults: Number(form.adults),
          children: Number(form.children),
          bookingType: form.bookingType,
          tourPeriod: form.tourPeriod,
          cottageId: form.cottageId,
          cottageFee: Number(form.cottageFee),
          notes: form.notes,
          paymentMethod: form.paymentMethod,
          promoCode: activePromo?.code || '',
          website: form.website,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      const { reservationId } = data;
      const ref8 = reservationId.slice(0, 8).toUpperCase();
      setBookingRef(ref8);

      // PayMongo hosts card and e-wallet checkout; card data never enters this app.
      const { checkoutUrl } = await createPayMongoCheckout({
        reservationId,
        guestName: form.guestName,
        guestEmail: form.email,
        description: `Room ${room.roomNumber} (${room.type}) — ${nights} ${stayUnit}${nights !== 1 ? 's' : ''}`,
        amount: onlinePaymentAmount,
        paymentType: 'booking',
        paymentChoice,
      });
      window.location.href = checkoutUrl;
      return;
    } catch (err) {
      console.error(err);

      const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

      if (isLocalDev) {
        // Most likely cause: running `npm start` instead of `vercel dev`,
        // so /api/create-checkout-session (or /api/create-reservation)
        // isn't being served at all. Show a visual-only preview instead
        // of a dead-end error.
        setPreviewReservationRef(bookingRef || 'PREVIEW');
        setPreviewMode(true);
      } else {
        setErrorMsg('Your reservation could not be started. Please try again.');
      }
    }
    setSubmitting(false);
  };

  const handleSimulatePreviewPayment = () => {
    setPreviewMode(false);
    setSuccess(true);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", color: '#9ca3af', padding: '0 20px' }}>
      Loading room details...
    </div>
  );

  if (!room) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: '0 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><IconWarning /></div>
        <div style={{ fontWeight: '600', color: '#111' }}>Room not found</div>
        <button onClick={() => window.location.href = '/rooms'}
          style={{ marginTop: '16px', background: ACCENT, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 24px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
          Back to Rooms
        </button>
      </div>
    </div>
  );

  if (!datesValid) return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '32px', textAlign: 'center', maxWidth: '440px' }}>
        <h1 style={{ color: '#111', fontSize: '20px', margin: '0 0 10px' }}>Choose stay dates first</h1>
        <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: 1.6 }}>Select available check-in and check-out dates before continuing to this room.</p>
        <button onClick={() => { window.location.href = '/rooms'; }} style={{ background: DARK, color: '#fff', border: 0, borderRadius: '8px', padding: '11px 18px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>Choose dates</button>
      </div>
    </div>
  );

  if (success) return (
    <div style={{ minHeight: '100vh', background: LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: '40px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '50px', textAlign: 'center', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '70px', height: '70px', background: '#d4f550', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <IconCheck />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111', marginBottom: '10px' }}>Booking Confirmed!</h2>
        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '24px' }}>
          Thank you, <strong>{form.guestName}</strong>! Your reservation has been submitted successfully.
        </p>
        <p role="status" style={{ color: '#355a42', background: LIGHT, borderRadius: '8px', padding: '12px', fontSize: '12px', lineHeight: 1.6, marginBottom: '18px' }}>{RECEIPT_NOTICE}</p>
        <div style={{ background: LIGHT, borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Booking Reference</span>
            <span style={{ fontWeight: '700', color: ACCENT }}>#{bookingRef}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Room</span>
            <span style={{ fontWeight: '600' }}>Room {room.roomNumber} ({room.type})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Check-in</span>
            <span style={{ fontWeight: '600' }}>{form.checkIn}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Check-out</span>
            <span style={{ fontWeight: '600' }}>{form.checkOut}</span>
          </div>
          {activePromo && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}><span style={{ color: '#6b7280' }}>Subtotal</span><span style={{ fontWeight: '600' }}>₱{totalAmount.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#15803d' }}><span>{activePromo.code} discount</span><span>−₱{discountAmount.toLocaleString()}</span></div>
          </>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginTop: '10px' }}>
            <span style={{ fontWeight: '600' }}>Total Amount</span>
            <span style={{ fontWeight: '700', color: ACCENT }}>₱{bookingTotal.toLocaleString()}</span>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }}>
          Please keep your booking reference for your records.
        </p>
        <button onClick={() => window.location.href = '/rooms'}
          style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
          Browse More Rooms
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#f9fafb', minHeight: '100vh', padding: '0 20px' }}>
      <div style={{ maxWidth: '720px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: '24px', margin: '40px auto', padding: 0 }}>
        {/* Booking Form */}
        <div>
          <button type="button" onClick={() => navigate('/rooms')} style={{ padding: 0, border: 0, background: 'transparent', color: ACCENT, fontSize: '12px', cursor: 'pointer', marginBottom: '14px' }}>← Back to rooms</button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>Complete Your Booking</h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '28px' }}>Fill in your details to reserve Room {room.roomNumber}</p>

          <form onSubmit={handleSubmit}>
            {/* Guest Info */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', background: DARK, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#d4f550', fontWeight: '700' }}>1</span>
                Guest Information
              </div>
              <div className="responsive-grid-2" style={{ gap: '14px' }}>
                {[
                  { label: 'Full Name *', key: 'guestName', placeholder: 'Juan dela Cruz', type: 'text', required: true },
                  { label: 'Phone Number *', key: 'phone', placeholder: '09XX XXX XXXX', type: 'tel', required: true },
                  { label: 'Email Address *', key: 'email', placeholder: 'juan@email.com', type: 'email', required: true },
                  { label: 'Address', key: 'address', placeholder: 'City, Province', type: 'text', required: false },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                    <input id={f.key} name={f.key} required={f.required} type={f.type} value={form[f.key]}
                      maxLength={f.key === 'guestName' ? 50 : f.key === 'phone' ? 11 : undefined}
                      inputMode={f.key === 'phone' ? 'numeric' : undefined}
                      onChange={['guestName', 'phone'].includes(f.key) ? handleGuestFieldChange : e => setForm(previous => ({ ...previous, [f.key]: e.target.value }))}
                      onBlur={['guestName', 'phone'].includes(f.key) ? handleGuestFieldBlur : undefined}
                      placeholder={f.placeholder}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                    {fieldErrors[f.key] && <div role="alert" style={{ color: '#b91c1c', fontSize: '11px', marginTop: '5px' }}>{fieldErrors[f.key]}</div>}
                  </div>
                ))}
              </div>

              {/* Honeypot field — invisible to real guests (off-screen, no
                  tab focus). Basic bots that auto-fill every input on a
                  form will populate this; the API rejects the submission
                  when it sees a value here. Real guests never notice it. */}
              <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
                <label htmlFor="website">Leave this field blank</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={e => setForm({ ...form, website: e.target.value })}
                />
              </div>

            </div>

            {/* Stay Details */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', background: DARK, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#d4f550', fontWeight: '700' }}>2</span>
                Stay Details
              </div>
              <div className="responsive-grid-2" style={{ gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1', background: LIGHT, padding: '14px', borderRadius: '8px', color: '#355a42', fontSize: '13px' }}>
                  <strong>Check-in:</strong> {form.checkIn} <span style={{ margin: '0 12px' }}>·</span> <strong>Check-out:</strong> {form.checkOut}
                  <button type="button" onClick={() => { window.location.href = '/rooms'; }} style={{ marginLeft: '14px', border: 0, background: 'transparent', color: DARK, textDecoration: 'underline', cursor: 'pointer', font: "inherit" }}>Edit dates</button>
                </div>
                <div>
                  <label htmlFor="booking-type" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Booking Type</label>
                  <select id="booking-type" value={form.bookingType} onChange={e => setForm(previous => ({ ...previous, bookingType: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    <option value="overnight">Overnight stay</option>
                    <option value="daytour">Daytour (8:00 AM–5:00 PM)</option>
                  </select>
                </div>
                {form.bookingType === 'overnight' ? (
                  <div>
                    <label htmlFor="overnight-time-slot" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-in / Check-out Time</label>
                    <select id="overnight-time-slot" value={form.overnightTimeSlot} onChange={e => setForm(previous => ({ ...previous, overnightTimeSlot: e.target.value }))}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                      {OVERNIGHT_TIME_SLOTS.map(slot => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ alignSelf: 'end', background: LIGHT, color: '#355a42', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                    {form.tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT.label : DAYTOUR_TIME_SLOT.label}
                  </div>
                )}
                {form.bookingType === 'daytour' && (
                  <div>
                    <label htmlFor="tour-period" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Swimming Tour</label>
                    <select id="tour-period" value={form.tourPeriod} onChange={e => setForm(previous => ({ ...previous, tourPeriod: e.target.value }))}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                      <option value="day">Day swimming (8:00 AM–5:00 PM)</option>
                      <option value="night">Night swimming (5:00 PM–10:00 PM / 12:00 MN)</option>
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adults</label>
                  <select value={form.adults} onChange={e => setForm(previous => ({ ...previous, adults: Number(e.target.value) }))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    {Array.from({ length: 25 }, (_, index) => index + 1).map(n => <option key={n} value={n}>{n} Adult{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Children (under 10)</label>
                  <select value={form.children} onChange={e => setForm(previous => ({ ...previous, children: Number(e.target.value) }))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    {Array.from({ length: 26 }, (_, n) => <option key={n} value={n}>{n} {n === 1 ? 'Child' : 'Children'}</option>)}
                  </select>
                </div>
              </div>
              {form.checkIn && form.checkOut && nights > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <OccupancyBadge startDate={form.checkIn} endDate={form.checkOut} />
                </div>
              )}

              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Special Requests</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any special requests or notes..."
                  rows={3}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: '14px' }}>
                <label htmlFor="cottage-selection" style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Optional Cottage</label>
                <select id="cottage-selection" value={`${form.cottageId}:${form.cottageFee}`} onChange={e => {
                  const [cottageId, fee] = e.target.value.split(':');
                  setForm(previous => ({ ...previous, cottageId, cottageFee: Number(fee) }));
                }}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                  {COTTAGE_OPTIONS.flatMap(option => option.prices.map(fee => (
                    <option key={`${option.id}:${fee}`} value={`${option.id}:${fee}`}>
                      {option.id ? `${option.label} · ₱${fee.toLocaleString()}` : option.label}
                    </option>
                  )))}
                </select>
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', background: DARK, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#d4f550', fontWeight: '700' }}>3</span>
                Payment Method
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <button type="button" onClick={() => setForm({ ...form, paymentMethod: 'online' })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: '10px',
                    border: form.paymentMethod === 'online' ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                    background: form.paymentMethod === 'online' ? LIGHT : '#fff',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    fontFamily: "'Poppins', sans-serif", color: '#111', textAlign: 'left',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <IconCard />
                    Pay Online — Card, GCash, Maya, or GrabPay
                  </span>
                  {form.paymentMethod === 'online' && <IconCheck size={16} color={ACCENT} />}
                </button>

              </div>

              {form.paymentMethod === 'online' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                    {[
                      { value: 'full', label: 'Pay in full', amount: bookingTotal },
                      { value: 'deposit', label: `${depositPercentage}% deposit`, amount: bookingTotal > 0 ? getOnlinePaymentAmount(bookingTotal, 'deposit') : 0 },
                    ].map(option => (
                      <button key={option.value} type="button" onClick={() => setSelectedPaymentChoice(option.value)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
                          padding: '12px 14px', borderRadius: '10px', textAlign: 'left',
                          border: paymentChoice === option.value ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                          background: paymentChoice === option.value ? LIGHT : '#fff',
                          color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                        }}>
                        <span style={{ fontSize: '12px', fontWeight: '600' }}>{option.label}</span>
                        <span style={{ fontSize: '14px', fontWeight: '700' }}>₱{option.amount.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ background: LIGHT, borderRadius: '12px', padding: '16px', fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>
                    You'll be redirected to PayMongo to pay <strong>₱{onlinePaymentAmount.toLocaleString()}</strong> now.
                    {' '}Reservation total: <strong>₱{bookingTotal.toLocaleString()}</strong>.
                    {paymentChoice === 'deposit' && <> The remaining balance must be paid before checkout.</>}
                    {' '}Card, GCash, Maya, and GrabPay payments are processed securely by PayMongo.
                  </div>
                </>
              )}

              <p style={{ margin: '12px 0 0', color: '#355a42', fontSize: '12px', lineHeight: 1.6 }}>{RECEIPT_NOTICE}</p>

              {previewMode && (
                <div style={{ marginTop: '14px', border: '1px dashed #d1d5db', borderRadius: '12px', padding: '18px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Preview Mode
                    </span>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      /api/create-checkout-session isn't reachable — this is a visual mockup only, nothing here is submitted anywhere.
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {WALLETS.map(w => (
                      <button key={w.id} type="button" onClick={() => setPreviewMethod(w.id)}
                        style={{
                          padding: '8px 14px', borderRadius: '8px',
                          border: previewMethod === w.id ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                          background: previewMethod === w.id ? '#fff' : '#f3f4f6',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: '#111',
                        }}>
                        {w.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setPreviewMethod('card')}
                      style={{
                        padding: '8px 14px', borderRadius: '8px',
                        border: previewMethod === 'card' ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                        background: previewMethod === 'card' ? '#fff' : '#f3f4f6',
                        fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: '#111',
                      }}>
                      Card
                    </button>
                  </div>

                  {previewMethod !== 'card' ? (
                    <div style={{ textAlign: 'center' }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=PREVIEW-${previewMethod.toUpperCase()}-${previewReservationRef}`}
                        alt={`${previewMethod} QR placeholder`}
                        style={{ borderRadius: '10px', border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', marginBottom: '10px' }}
                      />
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Placeholder {WALLETS.find(w => w.id === previewMethod)?.label} QR — the real checkout
                        page generates this live with your actual PayMongo account details.
                      </div>
                    </div>
                  ) : (
                    <div style={{ maxWidth: '320px', margin: '0 auto' }}>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Card Number</label>
                      <input disabled placeholder="4242 4242 4242 4242"
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', marginBottom: '10px', fontFamily: "'Poppins', sans-serif", background: '#f9fafb', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Expiry</label>
                          <input disabled placeholder="MM/YY"
                            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", background: '#f9fafb', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px' }}>CVV</label>
                          <input disabled placeholder="123"
                            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", background: '#f9fafb', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Cardholder Name</label>
                      <input disabled placeholder={form.guestName || 'Juan dela Cruz'}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", background: '#f9fafb', boxSizing: 'border-box' }} />
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                        Fields are disabled — real card entry happens on PayMongo's hosted page, never on your own site.
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={handleSimulatePreviewPayment}
                    style={{ width: '100%', marginTop: '18px', background: DARK, color: '#d4f550', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Simulate Successful Payment (preview only)
                  </button>
                </div>
              )}

              {errorMsg && (
                <div style={{ marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#b91c1c' }}>
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Terms gate: the guest must scroll through the agreement before accepting it. */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '12px' }}>Terms and Agreement</div>
              <div
                onScroll={event => {
                  const element = event.currentTarget;
                  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) setTermsRead(true);
                }}
                style={{ height: '170px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', color: '#4b5563', fontSize: '12px', lineHeight: '1.7', background: '#fafafa' }}
              >
                <p style={{ marginTop: 0 }}><strong>1. Reservation details.</strong> The guest confirms that the information supplied in this booking is accurate and complete. The reservation is subject to room availability and resort confirmation.</p>
                <p><strong>2. Check-in and check-out.</strong> Check-in is at 2:00 PM and check-out is at 12:00 NN unless the resort confirms another arrangement. Valid identification may be requested at check-in.</p>
                <p><strong>3. Payment.</strong> Online payments are processed securely by our payment provider. Pay the selected full amount or deposit through the hosted checkout.</p>
                <p><strong>4. Cancellation.</strong> Cancellation fees and refunds follow the resort cancellation policy applicable to the selected booking dates.</p>
                <p><strong>5. Guest conduct.</strong> Guests agree to follow resort rules, respect other guests, and accept responsibility for damage or loss caused by their party.</p>
                <p><strong>6. Privacy and information use.</strong> The resort collects the information provided in this form, including your name, contact details, address, stay dates, guest count, and requests, to process your reservation, communicate about your stay, provide support, and meet operational or legal requirements. We do not sell this information.</p>
                <p><strong>7. Payment privacy.</strong> Card and e-wallet payment details are entered and processed through the secure payment provider&apos;s hosted checkout. The resort does not store your full card number, security code, or e-wallet credentials. We may receive payment status, transaction references, and limited payment details needed to confirm and reconcile your booking.</p>
                <p style={{ marginBottom: 0 }}><strong>8. Agreement.</strong> By checking the box below, the guest confirms they have read and agree to these terms, the privacy practices above, and the resort&apos;s applicable policies.</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginTop: '14px', color: termsRead ? '#374151' : '#9ca3af', fontSize: '12px', lineHeight: '1.5', cursor: termsRead ? 'pointer' : 'not-allowed' }}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  disabled={!termsRead}
                  onChange={event => setTermsAccepted(event.target.checked)}
                  style={{ marginTop: '2px', accentColor: ACCENT }}
                />
                <span>{termsRead ? 'I have read and agree to the Terms and Agreement.' : 'Scroll to the end of the agreement to enable acceptance.'}</span>
              </label>
            </div>

            {errorMsg && (
              <div role="alert" style={{ marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#b91c1c' }}>
                {errorMsg}
              </div>
            )}
            <button type="submit" disabled={submitting || !termsAccepted}
              style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '14px', padding: '16px', fontSize: '15px', fontWeight: '700', cursor: submitting || !termsAccepted ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", opacity: submitting || !termsAccepted ? 0.7 : 1 }}>
              {submitting ? 'Redirecting to payment...' : 'Continue to Payment →'}
            </button>
          </form>
        </div>

        {/* Room Summary */}
        <div>
          <div className="sticky-summary" style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', position: 'sticky', top: '20px' }}>
            <div style={{ height: '180px', background: `linear-gradient(135deg, ${DARK}, #2d5a2d)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={resolveRoomImage(room) || FALLBACK_ROOM_IMAGES[0]}
                alt={`Room ${room.roomNumber}`}
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                  event.currentTarget.nextElementSibling.style.display = 'block';
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={{ display: 'none' }}><IconBed size={56} /></span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{room.type}</div>
              <div style={{ fontWeight: '700', fontSize: '18px', color: '#111', marginBottom: '12px' }}>Room {room.roomNumber}</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {(room.amenities || 'AC, TV, WiFi').split(',').map(a => (
                  <span key={a} style={{ background: LIGHT, color: ACCENT, borderRadius: '6px', padding: '3px 8px', fontSize: '10px', fontWeight: '500' }}>
                    {a.trim()}
                  </span>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="booking-promo-code" style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: '600', marginBottom: '7px' }}>Promo Code</label>
                  <div style={{ display: 'flex', gap: '7px' }}>
                    <input id="booking-promo-code" value={promoInput} disabled={Boolean(activePromo)} onChange={event => { setPromoInput(event.target.value.toUpperCase()); setPromoFeedback(null); }}
                      placeholder="Enter code" maxLength={32} style={{ minWidth: 0, flex: 1, border: '1px solid #d1d5db', borderRadius: '7px', padding: '9px 10px', fontSize: '12px', textTransform: 'uppercase' }} />
                    {activePromo ? (
                      <button type="button" onClick={removePromo} style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: '7px', padding: '0 11px', fontSize: '11px', cursor: 'pointer' }}>Remove</button>
                    ) : (
                      <button type="button" onClick={applyPromo} disabled={promoChecking || !promoInput.trim() || totalAmount <= 0}
                        style={{ border: 0, background: ACCENT, color: '#fff', borderRadius: '7px', padding: '0 13px', fontSize: '11px', fontWeight: 700, cursor: promoChecking || !promoInput.trim() || totalAmount <= 0 ? 'not-allowed' : 'pointer', opacity: promoChecking || !promoInput.trim() || totalAmount <= 0 ? 0.6 : 1 }}>
                        {promoChecking ? 'Checking…' : 'Apply'}
                      </button>
                    )}
                  </div>
                  {promoFeedback && <div role={promoFeedback.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '7px', color: promoFeedback.type === 'success' ? '#15803d' : '#b91c1c', fontSize: '11px' }}>{promoFeedback.text}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <span>Base · ₱{pricing?.baseRate.toLocaleString() || 0} × {nights} {stayUnit}{nights !== 1 ? 's' : ''}</span>
                  <span>₱{((pricing?.baseRate || 0) * nights).toLocaleString()}</span>
                </div>
                {pricing?.extraGuests > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <span>{pricing.extraGuests} extra guest{pricing.extraGuests !== 1 ? 's' : ''}</span>
                  <span>₱{pricing.extraGuestCharge.toLocaleString()}</span>
                </div>}
                {pricing?.cottageFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <span>{COTTAGE_OPTIONS.find(option => option.id === pricing.cottageId)?.label || 'Cottage'}</span>
                  <span>₱{pricing.cottageFee.toLocaleString()}</span>
                </div>}
                {activePromo && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#15803d', marginBottom: '8px' }}><span>Discount · {activePromo.code}</span><span>−₱{discountAmount.toLocaleString()}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '700', color: '#111', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
                  <span>Total</span>
                  <span style={{ color: ACCENT }}>₱{bookingTotal.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '10px' }}><span>Due today · {paymentChoice === 'full' ? 'full payment' : '25% deposit'}</span><span>₱{onlinePaymentAmount.toLocaleString()}</span></div>
              </div>

              {nights > 0 && (
                <div style={{ background: LIGHT, borderRadius: '10px', padding: '12px', marginTop: '14px', fontSize: '12px', color: ACCENT, textAlign: 'center', fontWeight: '600' }}>
                  {nights} {stayUnit}{nights !== 1 ? 's' : ''} · {form.checkIn} → {form.checkOut}
                </div>
              )}

              <div style={{ marginTop: '16px', fontSize: '11px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.7' }}>
                <IconLock />Secure booking · Free cancellation applies based on policy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}