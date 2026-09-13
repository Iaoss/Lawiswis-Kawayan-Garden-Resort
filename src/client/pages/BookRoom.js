import React, { useEffect, useState } from 'react';
import { db } from '../../firebase/firebase';
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';

const ACCENT = '#4a7c59';
const DARK = '#1a3a1a';
const LIGHT = '#f0f7f0';

export default function BookRoom() {
  const today = new Date().toISOString().split('T')[0];
  const roomId = window.location.pathname.split('/').pop();
  const params = new URLSearchParams(window.location.search);

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingRef, setBookingRef] = useState('');

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
    paymentMethod: 'gcash',
  });

  const [totalAmount, setTotalAmount] = useState(0);
  const [nights, setNights] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (snap.exists()) setRoom({ id: snap.id, ...snap.data() });
      setLoading(false);
    };
    fetch();
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
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'reservations'), {
        ...form,
   roomId: room.id,
  roomNumber: room.roomNumber,
  roomType: room.type,
  totalAmount,
  nights,
  type: 'online',
  status: 'pending',
  paymentStatus: 'pending',
  createdAt: serverTimestamp(),
});

await updateDoc(doc(db, 'rooms', room.id), {
  status: 'occupied',
});

setBookingRef(ref.id.slice(0, 8).toUpperCase());
setSuccess(true);   
    } catch (err) {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", color: '#9ca3af', padding: '0 20px' }}>
      Loading room details...
    </div>
  );

  if (!room) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif", padding: '0 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
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
        <div style={{ width: '70px', height: '70px', background: '#d4f550', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '32px' }}>✓</div>
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
  {/* Bamboo icon */}
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
              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Special Requests</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any special requests or notes..."
                  rows={3}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontFamily: "'Poppins', sans-serif", outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
            </div>

            {/* Payment Method */}
{/* Payment Method */}
<div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '20px' }}>
  <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ width: '24px', height: '24px', background: '#1A312C', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#89D7B7', fontWeight: '700' }}>3</span>
    Payment Method
  </div>
  <div className="responsive-grid-2" style={{ gap: '10px', marginBottom: '16px' }}>
    {[
      { value: 'gcash', label: '💙 GCash' },
      { value: 'card', label: '💳 Credit/Debit Card' },
      { value: 'bank', label: '🏦 Bank Transfer' },
      { value: 'cash', label: '💵 Pay at Resort' },
    ].map(m => (
      <button key={m.value} type="button" onClick={() => setForm({ ...form, paymentMethod: m.value })}
        style={{ padding: '12px', borderRadius: '10px', border: form.paymentMethod === m.value ? '2px solid #428475' : '1px solid #e5e7eb', background: form.paymentMethod === m.value ? '#FFF4E1' : '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", color: '#111' }}>
        {m.label}
      </button>
    ))}
  </div>

  {form.paymentMethod === 'gcash' && (
    <div style={{ background: '#f0f9ff', borderRadius: '12px', padding: '20px', border: '1px solid #bae6fd', textAlign: 'center' }}>
      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0369a1', marginBottom: '12px' }}>💙 GCash Payment Details</div>
      <img
        src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=00020101021226490012PH.GLOBE.GCASH01110917811233252040000530363654063500.005802PH5918LAWISWIS+KAWAYAN6007BULACAN63043B47"
        alt="GCash QR"
        style={{ borderRadius: '10px', marginBottom: '12px', border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}
      />
      <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: '600' }}>GCash Number</div>
      <div style={{ fontSize: '22px', fontWeight: '800', color: '#111', marginBottom: '4px', letterSpacing: '1px' }}>0917 811 2332</div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>Account Name: <strong>Lawiswis Kawayan Garden Resort</strong></div>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', fontSize: '11px', color: '#6b7280' }}>
        📸 Send screenshot of payment to <strong>info@lawiswiskawayanresort.com</strong> or via our chat after paying
      </div>
    </div>
  )}

  {form.paymentMethod === 'bank' && (
    <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '1px solid #bbf7d0' }}>
      <div style={{ fontWeight: '700', fontSize: '14px', color: '#15803d', marginBottom: '14px', textAlign: 'center' }}>🏦 Bank Transfer Details</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        {[
          { bank: 'BDO', account: '1234 5678 9012' },
          { bank: 'BPI', account: '9876 5432 1098' },
          { bank: 'Metrobank', account: '5555 6666 7777' },
          { bank: 'UnionBank', account: '1111 2222 3333' },
        ].map(b => (
          <div key={b.bank} style={{ background: '#fff', borderRadius: '10px', padding: '12px 16px', border: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#15803d' }}>{b.bank}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111', letterSpacing: '1px' }}>{b.account}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Account Name: <strong>Lawiswis Kawayan Garden Resort Corp.</strong></div>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', fontSize: '11px', color: '#6b7280', textAlign: 'center', marginTop: '8px' }}>
        📧 Send proof of payment to <strong>info@lawiswiskawayanresort.com</strong><br />
        Use your <strong>Booking Reference</strong> as transfer reference/note
      </div>
    </div>
  )}

  {form.paymentMethod === 'card' && (
    <div style={{ background: '#faf5ff', borderRadius: '12px', padding: '16px', border: '1px solid #e9d5ff', textAlign: 'center', fontSize: '13px', color: '#7c3aed' }}>
      💳 Card payment will be processed at the resort upon check-in.
    </div>
  )}

  {form.paymentMethod === 'cash' && (
    <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '16px', border: '1px solid #fde68a', textAlign: 'center', fontSize: '13px', color: '#a16207' }}>
      💵 Please prepare exact amount upon arrival at the resort.
    </div>
  )}
</div>

            <button type="submit" disabled={submitting}
              style={{ width: '100%', background: DARK, color: '#d4f550', border: 'none', borderRadius: '14px', padding: '16px', fontSize: '15px', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Submitting...' : 'Confirm Booking →'}
            </button>
          </form>
        </div>

        {/* Room Summary */}
        <div>
          <div className="sticky-summary" style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', position: 'sticky', top: '20px' }}>
            <div style={{ height: '180px', background: `linear-gradient(135deg, ${DARK}, #2d5a2d)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>
              🛏
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
                🔒 Secure booking · Free cancellation applies based on policy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}