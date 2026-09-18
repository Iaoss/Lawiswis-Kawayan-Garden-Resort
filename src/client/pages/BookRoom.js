import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { createPayMongoCheckout } from '../../lib/paymongo';
import { FALLBACK_ROOM_IMAGES, resolveRoomImage } from '../components/clientTheme';
import OccupancyBadge from '../components/OccupancyBadge';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f0f7f0';

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

function IconCash({ size = 16, color = '#111' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke={color} strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" />
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
  const today = new Date().toISOString().split('T')[0];
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

  const [form, setForm] = useState({
    guestName: '',
    email: '',
    phone: '',
    address: '',
    checkIn: params.get('checkIn') || '',
    checkOut: params.get('checkOut') || '',
    adults: 1,
    children: 0,
    notes: '',
    paymentMethod: 'online', // 'online' (card / e-wallet via PayMongo) | 'cash' (pay at resort)
    website: '', // honeypot — real guests leave this blank; see hidden field below
  });

  const [totalAmount, setTotalAmount] = useState(0);
  const [nights, setNights] = useState(0);

  useEffect(() => {
    const fetchRoom = async () => {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
      setLoading(false);
    };
    fetchRoom();
  }, [roomId]);

  useEffect(() => {
    if (room && form.checkIn && form.checkOut) {
      const n = Math.ceil((new Date(form.checkOut) - new Date(form.checkIn)) / (1000 * 60 * 60 * 24));
      setNights(n > 0 ? n : 0);
      setTotalAmount(n > 0 ? n * Number(room.price) : 0);
    }
  }, [room, form.checkIn, form.checkOut]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!room) return;
    if (nights <= 0) return alert('Please select valid check-in and check-out dates.');
    if (!termsRead || !termsAccepted) return alert('Please read the full Terms and Agreement and confirm that you agree before continuing.');

    setSubmitting(true);
    setErrorMsg('');
    setPreviewMode(false);

    try {
      // Reservation creation now happens server-side (see
      // /api/create-reservation.js). That endpoint runs the honeypot check,
      // per-email rate limiting, and a date-overlap check against existing
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
          adults: form.adults,
          children: form.children,
          notes: form.notes,
          paymentMethod: form.paymentMethod,
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

      if (form.paymentMethod === 'online') {
        // Hand off to PayMongo's hosted checkout page. It presents the
        // actual card entry form / e-wallet QR codes (GCash, Maya,
        // GrabPay) — we never handle card numbers or QR generation
        // ourselves. Once paid, PayMongo redirects the guest back to
        // /payment/success, and the webhook marks the reservation paid
        // in the background.
        const { checkoutUrl } = await createPayMongoCheckout({
          reservationId,
          guestName: form.guestName,
          guestEmail: form.email,
          description: `Room ${room.roomNumber} (${room.type}) — ${nights} night${nights !== 1 ? 's' : ''}`,
          amount: totalAmount,
        });
        window.location.href = checkoutUrl;
        return; // navigating away
      }

      // Cash / pay-at-resort: no online payment step needed.
      setSuccess(true);
    } catch (err) {
      console.error(err);

      const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

      if (form.paymentMethod === 'online' && isLocalDev) {
        // Most likely cause: running `npm start` instead of `vercel dev`,
        // so /api/create-checkout-session (or /api/create-reservation)
        // isn't being served at all. Show a visual-only preview instead
        // of a dead-end error.
        setPreviewReservationRef(bookingRef || 'PREVIEW');
        setPreviewMode(true);
      } else {
        setErrorMsg(
          form.paymentMethod === 'online'
            ? 'Your reservation could not be started. Please try again, or choose "Pay at Resort".'
            : 'Something went wrong. Please try again.'
        );
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginTop: '10px' }}>
            <span style={{ fontWeight: '600' }}>Total Amount</span>
            <span style={{ fontWeight: '700', color: ACCENT }}>₱{totalAmount.toLocaleString()}</span>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }}>
          Our team will contact you shortly to confirm your booking. Please keep your booking reference.
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
      {/* Navbar */}
      <nav className="responsive-nav" style={{ background: DARK, padding: '0 20px', justifyContent: 'space-between', height: '64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>
          <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="0" width="5" height="44" rx="2.5" fill="rgba(255,255,255,0.9)"/>
            <rect x="4" y="8" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
            <rect x="4" y="20" width="10" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
            <rect x="4" y="32" width="7" height="3" rx="1.5" fill="rgba(255,255,255,0.7)"/>
            <rect x="14" y="4" width="5" height="40" rx="2.5" fill="rgba(255,255,255,0.75)"/>
            <rect x="14" y="12" width="9" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
            <rect x="14" y="24" width="11" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
            <rect x="14" y="36" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
            <rect x="25" y="2" width="4" height="38" rx="2" fill="rgba(255,255,255,0.6)"/>
            <rect x="25" y="14" width="8" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)"/>
            <rect x="25" y="26" width="9" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)"/>
          </svg>
          <div>
            <div style={{ color: '#fff', fontWeight: '700', fontSize: '18px', lineHeight: 1.1, fontFamily: 'Georgia, serif', letterSpacing: '0.5px' }}>Lawiswis Kawayan</div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'Georgia, serif' }}>Garden Resort</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button onClick={() => window.location.href = '/rooms'}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            ← Back to Rooms
          </button>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f3f4f6', padding: '12px 20px', fontSize: '12px', color: '#9ca3af' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/home'}>Home</span>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/rooms'}>Rooms</span>
        <span style={{ margin: '0 8px' }}>›</span>
        <span style={{ color: '#111', fontWeight: '500' }}>Book Room {room.roomNumber}</span>
      </div>

      <div className="section-container two-column-fixed" style={{ margin: '40px auto' }}>
        {/* Booking Form */}
        <div>
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
                  { label: 'Email Address', key: 'email', placeholder: 'juan@email.com', type: 'email', required: false },
                  { label: 'Address', key: 'address', placeholder: 'City, Province', type: 'text', required: false },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                    <input required={f.required} type={f.type} value={form[f.key]}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
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

              {form.paymentMethod === 'online' && !form.email && (
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#9ca3af' }}>
                  Tip: add an email address to receive your payment receipt.
                </div>
              )}
            </div>

            {/* Stay Details */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '24px', height: '24px', background: DARK, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#d4f550', fontWeight: '700' }}>2</span>
                Stay Details
              </div>
              <div className="responsive-grid-2" style={{ gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-in Date *</label>
                  <input required type="date" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })}
                    min={today}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-out Date *</label>
                  <input required type="date" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })}
                    min={form.checkIn || today}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adults</label>
                  <select value={form.adults} onChange={e => setForm({ ...form, adults: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} Adult{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Children</label>
                  <select value={form.children} onChange={e => setForm({ ...form, children: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    {[0,1,2,3,4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Child' : 'Children'}</option>)}
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

                <button type="button" onClick={() => setForm({ ...form, paymentMethod: 'cash' })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: '10px',
                    border: form.paymentMethod === 'cash' ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                    background: form.paymentMethod === 'cash' ? LIGHT : '#fff',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    fontFamily: "'Poppins', sans-serif", color: '#111', textAlign: 'left',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <IconCash />
                    Pay at Resort — Cash on Arrival
                  </span>
                  {form.paymentMethod === 'cash' && <IconCheck size={16} color={ACCENT} />}
                </button>
              </div>

              {form.paymentMethod === 'online' && (
                <div style={{ background: LIGHT, borderRadius: '12px', padding: '16px', fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>
                  You'll be redirected to our secure payment page to complete your payment
                  of <strong>₱{totalAmount.toLocaleString()}</strong>. Card details, GCash,
                  Maya, and GrabPay options are all handled there — nothing is stored on our site.
                </div>
              )}

              {form.paymentMethod === 'cash' && (
                <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '16px', border: '1px solid #fde68a', fontSize: '12px', color: '#a16207' }}>
                  Please prepare the exact amount (₱{totalAmount.toLocaleString()}) upon arrival at the resort.
                </div>
              )}

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
                <p><strong>3. Payment.</strong> Online payments are processed by our secure payment provider. Pay-at-resort bookings must be paid upon arrival according to the amount shown in the reservation summary.</p>
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

            <button type="submit" disabled={submitting || !termsAccepted}
              style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '14px', padding: '16px', fontSize: '15px', fontWeight: '700', cursor: submitting || !termsAccepted ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", opacity: submitting || !termsAccepted ? 0.7 : 1 }}>
              {submitting
                ? (form.paymentMethod === 'online' ? 'Redirecting to payment...' : 'Submitting...')
                : (form.paymentMethod === 'online' ? 'Continue to Payment →' : 'Confirm Booking →')}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <span>₱{Number(room.price).toLocaleString()} × {nights} night{nights !== 1 ? 's' : ''}</span>
                  <span>₱{(Number(room.price) * nights).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '14px' }}>
                  <span>Reservation fee</span>
                  <span style={{ color: ACCENT }}>Free</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '700', color: '#111', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
                  <span>Total</span>
                  <span style={{ color: ACCENT }}>₱{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              {nights > 0 && (
                <div style={{ background: LIGHT, borderRadius: '10px', padding: '12px', marginTop: '14px', fontSize: '12px', color: ACCENT, textAlign: 'center', fontWeight: '600' }}>
                  {nights} night{nights !== 1 ? 's' : ''} · {form.checkIn} → {form.checkOut}
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