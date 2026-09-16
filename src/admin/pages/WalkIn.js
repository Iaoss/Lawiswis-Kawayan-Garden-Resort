import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, addDoc, getDocs, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { WALK_IN_CATEGORIES, getRoomsForCategory, normalizeRoomType } from '../utils/roomCatalog';

// Same real room photos used in RoomManagement — keyed by room name/number
// (lowercased) so the walk-in flow shows the same picture as the rest of
// the app. Falls back to the bed icon when a room name doesn't match.
const ROOM_IMAGES = {
  himbing:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Himbing-01-1400x700-1.jpeg',
  tahimik:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Tahimik-02-1400x700-1.jpeg',
  minamahal:  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/MInamahal-01-1400x700-1.jpeg',
  bituin:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Bituin-02-1400x700-2.jpeg',
  dilag:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Dilag-03-1400x700-1.jpeg',
  tadhana:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Tadhana-02-1400x700-1.jpeg',
  hirang:     'https://lawiswiskawayanresort.com/wp-content/uploads/2020/04/Hirang-02-1400x700-1.jpeg',
  panaginip:  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Panaginip-05.jpeg',
  aruga:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Aruga-02-1400x700-1.jpeg',
  giliw:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Giliw-01-1400x700-1.jpeg',
  lambingan:  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Lambingan-01-1400x700-1.jpeg',
  irog:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Irog-01-1400x700-1.jpeg',
  'pag-ibig': 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Pag-ibig-04-1400x700-1.jpeg',
  kalinga:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Kalinga-02-1400x700-1.jpeg',
  ugoy:       'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ugoy-02-1400x700-1.jpeg',
  aliwalas:   'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Aliwalas-02-1400x700-1.jpeg',
  ginhawa:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ginhawa-03-1400x700-1.jpeg',
  iglipan:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Iglipan-05-1400x700-1.jpeg',
  panatag:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Panatag-01-1400x700-1.jpeg',
  payapa:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Payapa-01-1400x700-1.jpeg',
  hiwaga:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Hiwaga-02-1400x700-1.jpeg',
  simoy:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Simoy-01-1400x700-1.jpeg',
  ligaya:     'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Ligaya-01-1400x700-1.jpeg',
  hapag:      'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Hapag-06-1400x700-1.jpeg',
  dalisay:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Dalisay-05-1400x700-1.jpeg',
  halimuyak:  'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Halimuyak-04-1400x700-1.jpeg',
  paraiso:    'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Paraiso-03-1400x700-1.jpeg',
  'main villa': 'https://lawiswiskawayanresort.com/wp-content/uploads/2024/10/Main-Villa-08-1400x700-1.jpeg',
};

function getRoomImage(name) {
  if (!name) return null;
  return ROOM_IMAGES[name.trim().toLowerCase()] || null;
}

// Category icons — Tabler Icons, the same icon font already used everywhere
// else in the app (ti-search, ti-bed, ti-users, etc.), swapped in for the
// old emoji. Matched against the category name so it keeps working however
// WALK_IN_CATEGORIES is worded, with a sensible fallback.
const CATEGORY_ICON_RULES = [
  { test: /presidential/i,        icon: 'ti-crown' },
  { test: /villa/i,                icon: 'ti-building-castle' },
  { test: /suite/i,                icon: 'ti-sofa' },
  { test: /family/i,               icon: 'ti-users' },
  { test: /deluxe/i,               icon: 'ti-star' },
  { test: /standard/i,             icon: 'ti-bed' },
];
function getCategoryIcon(category = '') {
  const hit = CATEGORY_ICON_RULES.find(r => r.test.test(category));
  return hit ? hit.icon : 'ti-home';
}

// ── Motion variants ──────────────────────────────────────────
const stepVariants = {
  enter:  { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit:   { opacity: 0, x: -20, transition: { duration: 0.18, ease: 'easeIn' } },
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: 'easeOut' },
  }),
};

const bannerVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
};

export default function WalkIn() {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors PageLayout's light/dark palette) ──
  const ACCENT      = settings?.accentColor || '#9cb56f';
  const ACCENT_TEXT = '#0a1a0a';
  const BG      = dark ? '#020b09' : '#f4f6f4';
  const CARD    = dark ? '#1c1c1c' : '#ffffff';
  const CARD2   = dark ? '#282827' : '#f4f6f4';
  const BORDER  = dark ? '#2a2a28' : '#e5e7eb';
  const BORDER2 = dark ? '#3a3a38' : '#e5e7eb';
  const TEXT    = dark ? '#f0f0f0' : '#111827';
  const MUTED   = dark ? '#9ca3af' : '#6b7280';
  const IMG_BG    = dark ? '#0d1f0d' : '#f0fdf4';
  const IMG_BORDER= dark ? '#2a3a2a' : '#dcfce7';
  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#15803d';
  const AVAIL_BG    = dark ? '#14532d' : '#dcfce7';
  const AVAIL_TEXT  = dark ? '#86efac' : '#15803d';
  const UNAVAIL_BG   = dark ? '#7f1d1d' : '#fee2e2';
  const UNAVAIL_TEXT = dark ? '#fca5a5' : '#b91c1c';
  const ICON_BOX_BG  = dark ? 'rgba(156,181,111,0.14)' : '#eef6e4';

  const [rooms,            setRooms]            = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedRoom,     setSelectedRoom]     = useState(null);
  const [step,             setStep]             = useState(1);
  const [success,          setSuccess]          = useState('');
  const [form, setForm] = useState({
    guestName: '', email: '', phone: '', address: '',
    roomId: '', checkIn: '', checkOut: '',
    adults: 1, children: 0,
    paymentMethod: 'cash', paymentStatus: 'paid', notes: '',
  });
  const [totalAmount, setTotalAmount] = useState(0);
  const [nights,      setNights]      = useState(0);

  const today = new Date().toISOString().split('T')[0];

  const isVacant = (r) => ['vacant', 'available'].includes(r.status);

  useEffect(() => {
    const fetchRooms = async () => {
      const snap = await getDocs(collection(db, 'rooms'));
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isVacant));
    };
    fetchRooms();
  }, []);

  useEffect(() => {
    if (selectedRoom && form.checkIn && form.checkOut) {
      const n = Math.ceil((new Date(form.checkOut) - new Date(form.checkIn)) / (1000 * 60 * 60 * 24));
      setNights(n > 0 ? n : 0);
      setTotalAmount(n > 0 ? n * Number(selectedRoom.price) : 0);
    }
  }, [selectedRoom, form.checkIn, form.checkOut]);

  const getRoomsByCategory = (cat) => getRoomsForCategory(rooms, cat);

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat);
    setSelectedRoom(null);
    setForm(f => ({ ...f, roomId: '' }));
    setStep(2);
  };

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    setForm(f => ({ ...f, roomId: room.id }));
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoom)    return alert('Please select a room.');
    if (totalAmount <= 0) return alert('Check-out must be after check-in.');
    await addDoc(collection(db, 'reservations'), {
      ...form,
      roomNumber: selectedRoom.roomNumber,
      roomType:   selectedRoom.type,
      category:   selectedCategory?.category,
      totalAmount, nights,
      type: 'walk-in', status: 'confirmed',
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'rooms', form.roomId), { status: 'occupied' });
    setSuccess(`✅ Reservation created for ${form.guestName}! Room ${selectedRoom.roomNumber} is now occupied.`);
    setForm({ guestName:'', email:'', phone:'', address:'', roomId:'', checkIn:'', checkOut:'', adults:1, children:0, paymentMethod:'cash', paymentStatus:'paid', notes:'' });
    setSelectedRoom(null); setSelectedCategory(null);
    setStep(1); setTotalAmount(0); setNights(0);
    const snap = await getDocs(collection(db, 'rooms'));
    setRooms(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(isVacant));
  };

  /* ── shared styles ── */
  const inp = {
    width: '100%', padding: '10px 12px',
    background: CARD2, border: `1px solid ${BORDER2}`,
    borderRadius: '10px', fontSize: '13px',
    fontFamily: "'Poppins', sans-serif",
    color: TEXT, outline: 'none', boxSizing: 'border-box',
  };
  const label = { fontSize: '11px', fontWeight: '600', color: MUTED, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const card  = { background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '18px' };

  /* ── step breadcrumb ── */
  const Breadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '12px' }}>
      {[{ n:1, label:'Category' }, { n:2, label:'Room' }, { n:3, label:'Details' }].map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', cursor: step > s.n ? 'pointer' : 'default' }}
            onClick={() => step > s.n && setStep(s.n)}>
            <motion.div
              animate={{ scale: step === s.n ? 1.08 : 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ width:'22px', height:'22px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: step >= s.n ? ACCENT : CARD2, color: step >= s.n ? ACCENT_TEXT : MUTED, fontSize:'10px', fontWeight:'700' }}>
              {step > s.n ? '✓' : s.n}
            </motion.div>
            <span style={{ color: step >= s.n ? TEXT : MUTED, fontWeight: step === s.n ? '600' : '400' }}>{s.label}</span>
          </div>
          {i < 2 && <span style={{ color: BORDER2 }}>›</span>}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <div style={{ marginBottom: '6px', fontSize: '18px', fontWeight: '700', color: TEXT }}>Walk-in Reservation</div>
        <p style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>Lawiswis Kawayan Garden Resort · Select room category to begin</p>

        <AnimatePresence>
          {success && (
            <motion.div
              variants={bannerVariants}
              initial="hidden" animate="visible" exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              style={{ background: SUCCESS_BG, color: SUCCESS_TEXT, padding: '14px 18px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', fontWeight: '500' }}>
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <Breadcrumb />

        <AnimatePresence mode="wait">
          <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit">

            {/* ══════════════════════════════════
                STEP 1 — Category
            ══════════════════════════════════ */}
            {step === 1 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: TEXT, marginBottom: '14px' }}>Choose Room Category</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {WALK_IN_CATEGORIES.map((cat, i) => {
                    const available = getRoomsByCategory(cat).length;
                    return (
                      <motion.div key={cat.category}
                        custom={i}
                        variants={gridItemVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={available > 0 ? { y: -3, borderColor: ACCENT, boxShadow: dark ? '0 8px 22px rgba(0,0,0,0.35)' : '0 8px 20px rgba(0,0,0,0.06)' } : {}}
                        whileTap={available > 0 ? { scale: 0.98 } : {}}
                        onClick={() => available > 0 && handleSelectCategory(cat)}
                        style={{
                          background: CARD, borderRadius: '14px',
                          border: `1px solid ${available > 0 ? BORDER2 : BORDER}`,
                          padding: '16px 18px',
                          cursor: available > 0 ? 'pointer' : 'not-allowed',
                          opacity: available === 0 ? 0.45 : 1,
                          display: 'flex', alignItems: 'center', gap: '14px',
                        }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                          background: ICON_BOX_BG,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <i className={`ti ${getCategoryIcon(cat.category)}`} style={{ fontSize: 24, color: ACCENT }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: TEXT, marginBottom: '2px' }}>{cat.category}</div>
                          <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>{cat.description}</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ background: available > 0 ? AVAIL_BG : UNAVAIL_BG, color: available > 0 ? AVAIL_TEXT : UNAVAIL_TEXT, borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '600' }}>
                              {available > 0 ? `${available} room${available > 1 ? 's' : ''} available` : 'No rooms available'}
                            </span>
                            <span style={{ background: CARD2, color: MUTED, borderRadius: '20px', padding: '2px 10px', fontSize: '10px' }}>
                              {cat.capacity}
                            </span>
                          </div>
                        </div>
                        {available > 0 && <span style={{ color: MUTED, fontSize: '18px', flexShrink: 0 }}>›</span>}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════
                STEP 2 — Room
            ══════════════════════════════════ */}
            {step === 2 && selectedCategory && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setStep(1)}
                    style={{ ...inp, width: 'auto', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', color: MUTED }}>
                    ← Back
                  </motion.button>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>{selectedCategory.category}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Select an available room</div>
                  </div>
                </div>

                {getRoomsByCategory(selectedCategory).length === 0 ? (
                  <div style={{ ...card, textAlign: 'center', padding: '40px', color: MUTED }}>No vacant rooms in this category.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {getRoomsByCategory(selectedCategory).map((room, i) => {
                      const photo = getRoomImage(room.roomNumber);
                      return (
                        <motion.div key={room.id}
                          custom={i}
                          variants={gridItemVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ y: -3, borderColor: ACCENT, boxShadow: dark ? '0 10px 26px rgba(0,0,0,0.35)' : '0 10px 22px rgba(0,0,0,0.07)' }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => handleSelectRoom(room)}
                          style={{ ...card, cursor: 'pointer' }}>
                          <div style={{
                            height: '100px', borderRadius: '10px', marginBottom: '12px',
                            border: `1px solid ${IMG_BORDER}`,
                            background: photo ? `url(${photo}) center/cover no-repeat` : IMG_BG,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {!photo && <i className="ti ti-bed" style={{ fontSize: '36px', color: ACCENT }} />}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontWeight: '700', fontSize: '15px', color: TEXT }}>{room.roomNumber}</div>
                              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{normalizeRoomType(room.type) || room.type}</div>
                            </div>
                            <span style={{ background: AVAIL_BG, color: AVAIL_TEXT, borderRadius: '20px', padding: '3px 10px', fontSize: '10px', fontWeight: '700' }}>Available</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                            {(room.amenities || 'AC, TV, WiFi').split(',').map(a => (
                              <span key={a} style={{ background: CARD2, color: MUTED, borderRadius: '6px', padding: '2px 8px', fontSize: '10px' }}>
                                {a.trim()}
                              </span>
                            ))}
                          </div>
                          {room.description && (
                            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px', lineHeight: '1.5' }}>{room.description}</div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontSize: '20px', fontWeight: '800', color: ACCENT }}>₱{Number(room.price).toLocaleString()}</span>
                              <span style={{ fontSize: '11px', color: MUTED }}>/night</span>
                            </div>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                              Select →
                            </motion.button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════
                STEP 3 — Guest form
            ══════════════════════════════════ */}
            {step === 3 && selectedRoom && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setStep(2)}
                      style={{ ...inp, width: 'auto', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', color: MUTED }}>
                      ← Back
                    </motion.button>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT }}>Guest Information</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>Room {selectedRoom.roomNumber} · {selectedCategory?.category}</div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Guest info */}
                    <div style={card}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT, marginBottom: '14px' }}>👤 Guest Details</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                          { lbl: 'Full Name *',    key: 'guestName', ph: 'Juan dela Cruz', req: true },
                          { lbl: 'Phone *',        key: 'phone',     ph: '09XX XXX XXXX',  req: true },
                          { lbl: 'Email',          key: 'email',     ph: 'juan@email.com', type: 'email' },
                          { lbl: 'Address',        key: 'address',   ph: 'City, Province' },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={label}>{f.lbl}</label>
                            <input required={f.req} type={f.type || 'text'} value={form[f.key]}
                              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                              placeholder={f.ph} style={inp} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dates */}
                    <div style={card}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT, marginBottom: '14px' }}>📅 Stay Dates</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={label}>Check-in *</label>
                          <input required type="date" min={today} value={form.checkIn}
                            onChange={e => setForm({ ...form, checkIn: e.target.value })} style={inp} />
                        </div>
                        <div>
                          <label style={label}>Check-out *</label>
                          <input required type="date" min={form.checkIn || today} value={form.checkOut}
                            onChange={e => setForm({ ...form, checkOut: e.target.value })} style={inp} />
                        </div>
                        <div>
                          <label style={label}>Adults</label>
                          <input type="number" min="1" value={form.adults}
                            onChange={e => setForm({ ...form, adults: e.target.value })} style={inp} />
                        </div>
                        <div>
                          <label style={label}>Children</label>
                          <input type="number" min="0" value={form.children}
                            onChange={e => setForm({ ...form, children: e.target.value })} style={inp} />
                        </div>
                      </div>
                    </div>

                    {/* Payment */}
                    <div style={card}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT, marginBottom: '14px' }}>💳 Payment</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={label}>Payment Method</label>
                          <select value={form.paymentMethod}
                            onChange={e => setForm({ ...form, paymentMethod: e.target.value })} style={inp}>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="card">Credit/Debit Card</option>
                            <option value="bank">Bank Transfer</option>
                          </select>
                        </div>
                        <div>
                          <label style={label}>Payment Status</label>
                          <select value={form.paymentStatus}
                            onChange={e => setForm({ ...form, paymentStatus: e.target.value })} style={inp}>
                            <option value="paid">Paid</option>
                            <option value="partial">Partial</option>
                            <option value="pending">Pending</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div style={card}>
                      <label style={label}>Special Requests / Notes</label>
                      <textarea value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="Special requests, extra beds, dietary needs, etc."
                        rows={3}
                        style={{ ...inp, resize: 'vertical' }} />
                    </div>

                    {/* Total banner */}
                    <AnimatePresence>
                      {totalAmount > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ overflow: 'hidden' }}>
                          <div style={{ background: IMG_BG, border: `1px solid ${ACCENT}`, borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: dark ? ACCENT : '#166534' }}>{nights} night{nights !== 1 ? 's' : ''} × ₱{Number(selectedRoom.price).toLocaleString()}</div>
                              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{form.checkIn} → {form.checkOut}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '11px', color: MUTED }}>Total Amount</div>
                              <div style={{ fontSize: '24px', fontWeight: '800', color: dark ? ACCENT : '#166534' }}>₱{totalAmount.toLocaleString()}</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.button type="submit" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      ✅ Confirm Walk-in Reservation
                    </motion.button>
                  </form>
                </div>

                {/* Room Summary */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  style={{ ...card, position: 'sticky', top: '20px', alignSelf: 'flex-start' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT, marginBottom: '14px' }}>📋 Booking Summary</div>

                  <div style={{
                    height: '120px', borderRadius: '10px', marginBottom: '14px',
                    border: `1px solid ${IMG_BORDER}`,
                    background: getRoomImage(selectedRoom.roomNumber)
                      ? `url(${getRoomImage(selectedRoom.roomNumber)}) center/cover no-repeat`
                      : IMG_BG,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!getRoomImage(selectedRoom.roomNumber) && (
                      <i className="ti ti-bed" style={{ fontSize: '48px', color: ACCENT }} />
                    )}
                  </div>

                  <div style={{ background: CARD2, borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: TEXT, marginBottom: '2px' }}>{selectedRoom.roomNumber}</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>{selectedRoom.type} · {selectedCategory?.category}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: ACCENT }}>
                      ₱{Number(selectedRoom.price).toLocaleString()}
                      <span style={{ fontSize: '11px', fontWeight: '400', color: MUTED }}>/night</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                    {(selectedRoom.amenities || 'AC, TV, WiFi').split(',').map(a => (
                      <span key={a} style={{ background: CARD2, color: MUTED, borderRadius: '6px', padding: '3px 8px', fontSize: '10px' }}>
                        {a.trim()}
                      </span>
                    ))}
                  </div>

                  <AnimatePresence>
                    {totalAmount > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: MUTED, marginBottom: '6px' }}>
                            <span>Duration</span>
                            <span>{nights} night{nights !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700' }}>
                            <span style={{ color: TEXT }}>Total</span>
                            <span style={{ color: ACCENT }}>₱{totalAmount.toLocaleString()}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageLayout>
  );
}