import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { WALK_IN_CATEGORIES, getRoomsForCategory, normalizeRoomType } from '../utils/roomCatalog';
import { NAME_ALLOWED_CHARACTERS, NAME_PATTERN, joinGuestName } from '../../lib/nameValidation';
import {
  MAX_STAY_NIGHTS, OVERNIGHT_TIME_SLOTS, getRoomBaseRate, getRoomMaximumGuests, isCheckInPassed, isCoupleRoom, isTourStartPassed, stayRangesOverlap,
} from '../../lib/bookingPricing';
import { BOOKING_OPTIONS, normalizeBookingDetails, priceBookingDetails } from '../../lib/bookingDetails';
import { COTTAGE_OPTIONS, getCottageFee } from '../../lib/bookingPricing';
import { groupTooLargeNote, suggestCottage, suggestRooms } from '../../lib/bookingSuggestions';
import DateOccupancy from '../../components/ui/date-occupancy';
import { PREFERRED_CONTACT_METHODS, isPreferredContactMethod } from '../../lib/preferredContactMethods';
import { staffApi } from '../lib/staffApi';
import { appAlert } from '../../components/ui/app-dialog';
import { IMAGE_WIDTHS, optimizeImageMap } from '../../lib/imageUrl';

const COUPLE_ROOM_LIMIT_MESSAGE = 'Couple Room accommodates a maximum of 1 extra adult or child. For larger groups, we suggest booking the Family Suite for 6.';

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getLocalToday = () => toIso(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

/* ── Availability (the double-booking guard) ─────────────────────
   A room is taken for [checkIn, checkOut) when ANY active reservation
   (online or walk-in) for that room overlaps. A new guest may arrive on
   the day another guest leaves. Cancelled and checked-out bookings free
   the room. Matching is by roomId, or by roomNumber when roomId is missing. */
const isActiveReservation = (r) => !['cancelled', 'checked-out'].includes(String(r.status || '').toLowerCase());
const sameRoom = (r, room) => (r.roomId ? r.roomId === room.id : !!r.roomNumber && r.roomNumber === room.roomNumber);
const overlaps = (r, checkIn, checkOut) => {
  if (typeof r.checkIn !== 'string' || !r.checkIn) return false;
  const end = typeof r.checkOut === 'string' && r.checkOut ? r.checkOut.slice(0, 10) : r.checkIn.slice(0, 10);
  // Same-day bookings (tours) hold their whole date.
  return stayRangesOverlap(checkIn, checkOut, r.checkIn.slice(0, 10), end);
};
const isBooked = (reservations, room, checkIn, checkOut) =>
  reservations.some(r => isActiveReservation(r) && sameRoom(r, room) && overlaps(r, checkIn, checkOut));
const blockedByStatus = (room, checkIn, today) => {
  const s = String(room.status || '').toLowerCase();
  if (/maint|out.?of.?(service|order)|blocked|closed/.test(s)) return true;
  return s === 'cleaning' && checkIn === today; // cleaning only matters for same-day arrivals
};

// Same real room photos used in RoomManagement — keyed by room name/number (lowercased).
const ROOM_IMAGES = optimizeImageMap({
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
}, IMAGE_WIDTHS.card);
const getRoomImage = (name) => (name ? ROOM_IMAGES[name.trim().toLowerCase()] || null : null);

const gridItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: 'easeOut' } }),
};
const stepVariants = {
  enter:  { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit:   { opacity: 0, x: -20, transition: { duration: 0.18, ease: 'easeIn' } },
};
const bannerVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
};

export default function WalkIn() {
  const { settings, formatDate } = useSettings();
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
  const IMG_BG     = dark ? '#0d1f0d' : '#f0fdf4';
  const IMG_BORDER = dark ? '#2a3a2a' : '#dcfce7';
  const SUCCESS_BG   = dark ? '#14532d' : '#dcfce7';
  const SUCCESS_TEXT = dark ? '#86efac' : '#15803d';
  const AVAIL_BG    = dark ? '#14532d' : '#dcfce7';
  const AVAIL_TEXT  = dark ? '#86efac' : '#15803d';

  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [catFilter, setCatFilter] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [step, setStep] = useState(1); // 1 = dates & room, 2 = guest details
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [nameErrors, setNameErrors] = useState({});
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', address: '', preferredContactMethod: '',
    roomId: '', checkIn: '', checkOut: '',
    bookingOption: 'overnight', overnightTimeSlot: 'morning', cottageId: '',
    adults: 1, children: 0,
    paymentMethod: 'cash', paymentStatus: 'paid', notes: '',
  });

  const today = getLocalToday();
  const guestName = joinGuestName(form.firstName, form.lastName);
  const coupleGuestLimit = isCoupleRoom(selectedRoom) ? getRoomMaximumGuests(selectedRoom) : null;

  // Live data: new online bookings show up here immediately, so availability stays current.
  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'),
      snap => setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Rooms could not be loaded:', err.message));
    const unsubRes = onSnapshot(collection(db, 'reservations'),
      snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Reservations could not be loaded:', err.message));
    return () => { unsubRooms(); unsubRes(); };
  }, []);

  // ── Booking type & dates ──
  // Day and night tours are single-day bookings (check-out = check-in date).
  // Same checks as the server: tour hours, today's cutoffs, minimum one night.
  const bookingOption = BOOKING_OPTIONS.find(option => option.id === form.bookingOption) || BOOKING_OPTIONS[0];
  const isTour = bookingOption.bookingType === 'daytour';
  const stayUnit = isTour ? 'day' : 'night';
  const detailsCheck = form.checkIn && (isTour || form.checkOut)
    ? normalizeBookingDetails({
      bookingType: bookingOption.bookingType,
      tourPeriod: bookingOption.tourPeriod,
      overnightTimeSlot: form.overnightTimeSlot,
      checkIn: form.checkIn,
      checkOut: isTour ? form.checkIn : form.checkOut,
      adults: Number(form.adults) || 1,
      children: Number(form.children) || 0,
    })
    : null;
  const stayError = detailsCheck?.error || '';
  const details = detailsCheck?.details || null;
  const datesReady = Boolean(details);
  const stayCheckOut = details ? details.checkOut : form.checkOut;
  const nights = details ? details.nights : 0;
  // Estimate only, using the same price rules as the server; the server
  // calculates the real total when the booking is saved.
  const totalAmount = (() => {
    if (!selectedRoom || !details) return 0;
    try { return priceBookingDetails(selectedRoom, details, { cottageId: form.cottageId, cottageFee: getCottageFee(form.cottageId) || 0 }).subtotalAmount; } catch { return 0; }
  })();
  // Today's times that have passed: move to the next open one.
  useEffect(() => {
    if (!form.checkIn) return;
    if (form.bookingOption === 'day' && isTourStartPassed(form.checkIn, 'day') && !isTourStartPassed(form.checkIn, 'night')) {
      setForm(p => ({ ...p, bookingOption: 'night' }));
    }
    if (form.bookingOption === 'overnight') {
      const current = OVERNIGHT_TIME_SLOTS.find(slot => slot.id === form.overnightTimeSlot);
      const next = OVERNIGHT_TIME_SLOTS.find(slot => !isCheckInPassed(form.checkIn, slot));
      if (current && isCheckInPassed(form.checkIn, current) && next) setForm(p => ({ ...p, overnightTimeSlot: next.id }));
    }
  }, [form.checkIn, form.bookingOption, form.overnightTimeSlot]);

  const rateOf = room => {
    try { return getRoomBaseRate(room, bookingOption.bookingType).amount; } catch { return Number(room?.price) || 0; }
  };

  // ── Rooms that are actually free for the chosen dates ──
  const { availableRooms, bookedCount } = useMemo(() => {
    if (!datesReady) return { availableRooms: [], bookedCount: 0 };
    const bookable = rooms.filter(r => !blockedByStatus(r, form.checkIn, today));
    const free = bookable.filter(r => !isBooked(reservations, r, form.checkIn, stayCheckOut));
    return { availableRooms: free, bookedCount: bookable.length - free.length };
  }, [rooms, reservations, datesReady, form.checkIn, stayCheckOut, today]);

  // ── Smart suggestion: best-fitting free rooms and cottage for the group ──
  const guestTotal = (Number(form.adults) || 0) + (Number(form.children) || 0);
  const roomSuggestions = useMemo(() => suggestRooms(availableRooms, details), [availableRooms, details]);
  const cottageSuggestion = guestTotal > 0 ? suggestCottage(guestTotal) : null;

  const categoryOf = (room) => WALK_IN_CATEGORIES.find(c => getRoomsForCategory([room], c).length > 0);
  const activeCategory = WALK_IN_CATEGORIES.find(c => c.category === catFilter);
  const shownRooms = activeCategory ? getRoomsForCategory(availableRooms, activeCategory) : availableRooms;

  // If the chosen room becomes taken (dates changed, or someone just booked it), drop it.
  useEffect(() => {
    if (selectedRoom && datesReady && !availableRooms.some(r => r.id === selectedRoom.id)) {
      setSelectedRoom(null);
      setForm(f => ({ ...f, roomId: '' }));
    }
  }, [availableRooms, selectedRoom, datesReady]);

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    setForm(f => ({ ...f, roomId: room.id }));
  };

  const changeGuests = (key, value) => {
    const other = Number(form[key === 'adults' ? 'children' : 'adults']) || 0;
    if (coupleGuestLimit !== null && (Number(value) || 0) + other > coupleGuestLimit) {
      setUpsellOpen(true);
      return;
    }
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const switchToFamilySuite = () => {
    const familySuite = WALK_IN_CATEGORIES.find(item => item.category === 'Family Suite for 6');
    setUpsellOpen(false);
    if (familySuite) setCatFilter(familySuite.category);
    setSelectedRoom(null);
    setForm(f => ({ ...f, roomId: '' }));
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!selectedRoom) return appAlert('Choose a room for this guest first.', { title: 'No room selected', tone: 'warning' });
    if (stayError || !details) return appAlert(stayError || 'Choose the booking date first.', { title: 'Check the dates', tone: 'warning' });
    if (!isPreferredContactMethod(form.preferredContactMethod)) return appAlert('Choose how the guest prefers to be contacted.', { title: 'Contact method needed', tone: 'warning' });
    if (coupleGuestLimit !== null && (Number(form.adults) || 0) + (Number(form.children) || 0) > coupleGuestLimit) {
      setUpsellOpen(true);
      return;
    }
    const errors = {
      firstName: NAME_PATTERN.test(form.firstName.trim()) ? '' : 'Enter 2-35 valid letters.',
      lastName: NAME_PATTERN.test(form.lastName.trim()) ? '' : 'Enter 2-35 valid letters.',
    };
    setNameErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSaving(true);
    try {
      // The server re-checks the room for double bookings, calculates the
      // price from the room's nightly rate, and records any payment.
      let created;
      try {
        created = await staffApi('staff-billing', {
          action: 'create-walk-in',
          booking: { ...form, checkOut: stayCheckOut, category: categoryOf(selectedRoom)?.category || '' },
        });
      } catch (createError) {
        if (/just booked/.test(createError.message)) {
          setSelectedRoom(null);
          setForm(f => ({ ...f, roomId: '' }));
          setStep(1);
        }
        appAlert(createError.message, { title: 'Couldn’t create the booking', tone: 'danger' });
        return;
      }
      const arrivesToday = created.arrivesToday;
      const receiptMessage = created.amountPaid > 0
        ? (created.receiptError ? ` Payment receipt failed: ${created.receiptError}` : ' Payment receipt emailed.')
        : '';

      let confirmationMessage = '';
      try {
        const result = await staffApi('send-reservation-confirmation', { reservationId: created.reservationId });
        confirmationMessage = result.sent
          ? ' Confirmation email sent.'
          : result.alreadySent ? ' Confirmation email was already sent.' : ' Confirmation email is being sent.';
      } catch (confirmationError) {
        confirmationMessage = ` Confirmation email failed: ${confirmationError.message || 'email delivery error'}`;
      }
      setSuccess(`Reservation created for ${guestName}. Room ${selectedRoom.roomNumber} is ${arrivesToday ? 'now occupied' : `reserved for ${isTour ? `${bookingOption.label} on ${formatDate(form.checkIn)}` : `${formatDate(form.checkIn)} – ${formatDate(form.checkOut)}`}`}.${confirmationMessage}${receiptMessage}`);
      setForm({ firstName:'', lastName:'', email:'', phone:'', address:'', preferredContactMethod:'', roomId:'', checkIn:'', checkOut:'', bookingOption:'overnight', overnightTimeSlot:'morning', cottageId:'', adults:1, children:0, paymentMethod:'cash', paymentStatus:'paid', notes:'' });
      setNameErrors({});
      setSelectedRoom(null);
      setCatFilter('all');
      setStep(1);
    } catch (submitError) {
      appAlert(submitError.message || 'Unknown error.', { title: 'Couldn’t save the reservation', tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  /* ── shared styles ── */
  const inp = {
    width: '100%', padding: '10px 12px', background: CARD2, border: `1px solid ${BORDER2}`,
    borderRadius: '10px', fontSize: '13px', fontFamily: "'Poppins', sans-serif",
    color: TEXT, outline: 'none', boxSizing: 'border-box',
  };
  const label = { fontSize: '11px', fontWeight: '600', color: MUTED, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const card  = { background: CARD, borderRadius: '14px', border: `1px solid ${BORDER}`, padding: '18px' };
  const tag   = { background: CARD2, color: MUTED, borderRadius: '6px', padding: '2px 8px', fontSize: '10px' };
  const amenitiesOf = (room) => (room.amenities || 'AC, TV, WiFi').split(',');
  const maxGuests = selectedRoom ? getRoomMaximumGuests(selectedRoom) : null;

  const Breadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '12px' }}>
      {[{ n: 1, label: 'Dates & room' }, { n: 2, label: 'Guest details' }].map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: step > s.n ? 'pointer' : 'default' }}
            onClick={() => step > s.n && setStep(s.n)}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step >= s.n ? ACCENT : CARD2, color: step >= s.n ? ACCENT_TEXT : MUTED, fontSize: 10, fontWeight: 700 }}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ color: step >= s.n ? TEXT : MUTED, fontWeight: step === s.n ? 600 : 400 }}>{s.label}</span>
          </div>
          {i < 1 && <span style={{ color: BORDER2 }}>›</span>}
        </React.Fragment>
      ))}
    </div>
  );

  const roomPhoto = (room, height) => {
    const photo = getRoomImage(room.roomNumber);
    return (
      <div style={{
        height, borderRadius: 12, border: `1px solid ${IMG_BORDER}`,
        background: photo ? `url(${photo}) center/cover no-repeat` : IMG_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!photo && <i className="ti ti-bed" style={{ fontSize: 36, color: ACCENT }} />}
      </div>
    );
  };

  const maxCheckOut = form.checkIn ? addDays(form.checkIn, MAX_STAY_NIGHTS) : undefined;

  return (
    <PageLayout>
      <div style={{ fontFamily: "'Poppins', sans-serif", background: BG, minHeight: '100vh', padding: '20px' }}>
        <div style={{ marginBottom: 6, fontSize: 18, fontWeight: 700, color: TEXT }}>Walk-in Reservation</div>
        <p style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>Lawiswis Kawayan Garden Resort · Pick the stay dates first to see rooms that are free</p>

        <AnimatePresence>
          {success && (
            <motion.div variants={bannerVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              style={{ background: SUCCESS_BG, color: SUCCESS_TEXT, padding: '14px 18px', borderRadius: 12, marginBottom: 20, fontSize: 13, fontWeight: 500 }}>
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <Breadcrumb />

        <AnimatePresence mode="wait">
          <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit">

            {/* ═════════ STEP 1 — Dates, then available rooms ═════════ */}
            {step === 1 && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                  {/* Dates */}
                  <div style={{ ...card, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Find a room 🏡</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 8 }}>How many guests?</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={label}>Adults *</label>
                        <input type="number" min="1" value={form.adults} onChange={e => changeGuests('adults', e.target.value)} style={inp} />
                      </div>
                      <div>
                        <label style={label}>Children (under 10)</label>
                        <input type="number" min="0" value={form.children} onChange={e => changeGuests('children', e.target.value)} style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
                      <div>
                        <label style={label}>Booking type *</label>
                        <select value={form.bookingOption} style={inp}
                          onChange={e => setForm(p => ({ ...p, bookingOption: e.target.value }))}>
                          {BOOKING_OPTIONS.map(option => {
                            const closed = option.bookingType === 'daytour' && isTourStartPassed(form.checkIn, option.tourPeriod);
                            return <option key={option.id} value={option.id} disabled={closed}>{option.label}{closed ? ' — closed for today' : ''}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label style={label}>{isTour ? 'Date *' : 'Check-in *'}</label>
                        <input type="date" min={today} value={form.checkIn} style={inp}
                          onChange={e => {
                            const checkIn = e.target.value;
                            setForm(p => ({ ...p, checkIn, checkOut: p.checkOut && checkIn && p.checkOut <= checkIn ? '' : p.checkOut }));
                          }} />
                      </div>
                      {!isTour && (
                        <>
                          <div>
                            <label style={label}>Check-out *</label>
                            <input type="date" disabled={!form.checkIn}
                              min={form.checkIn ? addDays(form.checkIn, 1) : today} max={maxCheckOut}
                              value={form.checkOut} style={{ ...inp, opacity: form.checkIn ? 1 : 0.6 }}
                              onChange={e => setForm(p => ({ ...p, checkOut: e.target.value }))} />
                          </div>
                          <div>
                            <label style={label}>Check-in time *</label>
                            <select value={form.overnightTimeSlot} style={inp}
                              onChange={e => setForm(p => ({ ...p, overnightTimeSlot: e.target.value }))}>
                              {OVERNIGHT_TIME_SLOTS.map(slot => {
                                const passed = isCheckInPassed(form.checkIn, slot);
                                return <option key={slot.id} value={slot.id} disabled={passed}>{slot.label}{passed ? ' — passed for today' : ''}</option>;
                              })}
                            </select>
                          </div>
                        </>
                      )}
                      <div style={{ fontSize: 12, color: MUTED, paddingBottom: 10 }}>
                        {datesReady ? (isTour ? `Single-day ${bookingOption.label.toLowerCase()}` : `${nights} night${nights !== 1 ? 's' : ''}`) : isTour ? 'Choose the date' : 'Choose both dates'}
                      </div>
                    </div>
                    {stayError && <div role="alert" style={{ color: '#dc2626', fontSize: 11, marginTop: 8 }}>{stayError}</div>}
                    {form.checkIn && (
                      <DateOccupancy
                        date={form.checkIn}
                        focus={isTour ? bookingOption.tourPeriod : 'overnight'}
                        colors={{ text: TEXT, muted: MUTED, border: BORDER2, background: CARD2, accent: ACCENT }}
                        style={{ marginTop: 12 }}
                      />
                    )}
                  </div>

                  {/* Smart suggestion */}
                  {datesReady && guestTotal > 0 && (
                    <div style={{ ...card, marginBottom: 16, border: `1px solid ${ACCENT}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>✨ Suggested for {guestTotal} guest{guestTotal === 1 ? '' : 's'}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Free rooms that fit the whole group, cheapest first for this {isTour ? bookingOption.label.toLowerCase() : 'stay'} (estimate).</div>
                      {roomSuggestions.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#b45309' }}>{groupTooLargeNote(availableRooms, details)}</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {roomSuggestions.map(({ room, total, reason }, index) => (
                            <div key={room.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: CARD2, borderRadius: 10, padding: '10px 12px' }}>
                              <div style={{ fontSize: 12, color: TEXT }}>
                                <strong>{index === 0 ? 'Best fit: ' : ''}{room.roomNumber}</strong> · {normalizeRoomType(room.type) || room.type}
                                <div style={{ fontSize: 11, color: MUTED }}>{reason} · est. ₱{total.toLocaleString()}</div>
                              </div>
                              <button type="button" onClick={() => handleSelectRoom(room)}
                                style={{ background: selectedRoom?.id === room.id ? ACCENT : 'transparent', color: selectedRoom?.id === room.id ? ACCENT_TEXT : TEXT, border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {selectedRoom?.id === room.id ? 'Selected' : 'Choose'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {cottageSuggestion?.cottage && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                          <div style={{ fontSize: 12, color: TEXT }}>
                            Cottage: <strong>{cottageSuggestion.cottage.label}</strong> · ₱{cottageSuggestion.cottage.price.toLocaleString()}
                            {cottageSuggestion.note && <div style={{ fontSize: 11, color: '#b45309' }}>{cottageSuggestion.note}</div>}
                          </div>
                          <button type="button"
                            onClick={() => setForm(p => ({ ...p, cottageId: p.cottageId === cottageSuggestion.cottage.id ? '' : cottageSuggestion.cottage.id }))}
                            style={{ background: form.cottageId === cottageSuggestion.cottage.id ? ACCENT : 'transparent', color: form.cottageId === cottageSuggestion.cottage.id ? ACCENT_TEXT : TEXT, border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {form.cottageId === cottageSuggestion.cottage.id ? 'Added' : 'Add cottage'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Results */}
                  {!datesReady ? (
                    <div style={{ ...card, textAlign: 'center', padding: '44px 20px', color: MUTED, fontSize: 13 }}>
                      <i className="ti ti-calendar-event" style={{ fontSize: 30, color: ACCENT, display: 'block', marginBottom: 10 }} />
                      Pick check-in and check-out dates to see which rooms are free.
                      <div style={{ fontSize: 11, marginTop: 6 }}>Rooms already booked online or walk-in for those dates are hidden, so they can’t be double-booked.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                          Rooms available <span style={{ color: MUTED, fontWeight: 500 }}>({shownRooms.length})</span>
                        </div>
                        {bookedCount > 0 && <div style={{ fontSize: 11, color: MUTED }}>{bookedCount} room{bookedCount !== 1 ? 's' : ''} already booked for these dates</div>}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                        {[{ category: 'all', n: availableRooms.length, name: 'All' },
                          ...WALK_IN_CATEGORIES.map(c => ({ category: c.category, name: c.category, n: getRoomsForCategory(availableRooms, c).length }))].map(c => (
                          <button key={c.category} type="button" disabled={c.n === 0 && c.category !== 'all'}
                            onClick={() => setCatFilter(c.category)}
                            style={{
                              border: `1px solid ${catFilter === c.category ? ACCENT : BORDER2}`, borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                              fontFamily: 'inherit', cursor: c.n === 0 && c.category !== 'all' ? 'not-allowed' : 'pointer',
                              opacity: c.n === 0 && c.category !== 'all' ? 0.45 : 1,
                              background: catFilter === c.category ? ACCENT : CARD, color: catFilter === c.category ? ACCENT_TEXT : TEXT,
                            }}>
                            {c.name} ({c.n})
                          </button>
                        ))}
                      </div>

                      {shownRooms.length === 0 ? (
                        <div style={{ ...card, textAlign: 'center', padding: 40, color: MUTED, fontSize: 13 }}>
                          No rooms are free for these dates{activeCategory ? ' in this category' : ''}. Try other dates{activeCategory ? ' or another category' : ''}.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                          {shownRooms.map((room, i) => {
                            const picked = selectedRoom?.id === room.id;
                            return (
                              <motion.div key={room.id} custom={i} variants={gridItemVariants} initial="hidden" animate="visible"
                                whileHover={{ y: -3 }} whileTap={{ scale: 0.99 }}
                                onClick={() => handleSelectRoom(room)}
                                style={{ ...card, padding: 10, cursor: 'pointer', border: `2px solid ${picked ? ACCENT : BORDER}` }}>
                                {roomPhoto(room, 110)}
                                <div style={{ padding: '10px 4px 2px' }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{room.roomNumber}</div>
                                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{normalizeRoomType(room.type) || room.type}</div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <div>
                                      <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>₱{rateOf(room).toLocaleString()}</span>
                                      <span style={{ fontSize: 10, color: MUTED }}> / {stayUnit}</span>
                                    </div>
                                    <span style={{ background: AVAIL_BG, color: AVAIL_TEXT, borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700 }}>Free</span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Selected room panel */}
                <aside style={{ ...card, flex: '0 0 320px', maxWidth: '100%', position: 'sticky', top: 20 }}>
                  {!selectedRoom ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: MUTED, fontSize: 12 }}>
                      <i className="ti ti-bed" style={{ fontSize: 30, color: ACCENT, display: 'block', marginBottom: 8 }} />
                      Select a room to see its details and continue.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{selectedRoom.roomNumber}</div>
                      <div style={{ fontSize: 11, color: MUTED, margin: '2px 0 12px' }}>{selectedRoom.type}{categoryOf(selectedRoom) ? ` · ${categoryOf(selectedRoom).category}` : ''}</div>
                      {roomPhoto(selectedRoom, 150)}
                      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, margin: '14px 0 6px' }}>Overview</div>
                      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                        {selectedRoom.description || 'A comfortable room at Lawiswis Kawayan Garden Resort.'}
                      </div>
                      {maxGuests ? <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Up to {maxGuests} guests</div> : null}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                        {amenitiesOf(selectedRoom).map(a => <span key={a} style={tag}>{a.trim()}</span>)}
                      </div>
                      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginBottom: 12, fontSize: 12, color: MUTED }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isTour ? bookingOption.label : 'Stay'}</span><span>{isTour ? formatDate(form.checkIn) : `${formatDate(form.checkIn)} → ${formatDate(form.checkOut)}`}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span>{nights} {stayUnit}{nights !== 1 ? 's' : ''} · est.</span><span style={{ color: TEXT, fontWeight: 700 }}>₱{totalAmount.toLocaleString()}</span></div>
                      </div>
                      <button type="button" onClick={() => setStep(2)}
                        style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Continue · ₱{rateOf(selectedRoom).toLocaleString()} / {stayUnit}
                      </button>
                    </>
                  )}
                </aside>
              </div>
            )}

            {/* ═════════ STEP 2 — Guest form ═════════ */}
            {step === 2 && selectedRoom && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 460px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setStep(1)}
                      style={{ ...inp, width: 'auto', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: MUTED }}>← Back</motion.button>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>Guest Information</div>
                      <div style={{ fontSize: 11, color: MUTED }}>Room {selectedRoom.roomNumber} · {formatDate(form.checkIn)} → {formatDate(form.checkOut)}</div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={card}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 14 }}>👤 Guest Details</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {[
                          { lbl: 'First Name *', key: 'firstName', ph: 'Juan', req: true },
                          { lbl: 'Last Name *',  key: 'lastName',  ph: 'dela Cruz', req: true },
                          { lbl: 'Phone *',      key: 'phone',     ph: '09XX XXX XXXX', req: true },
                          { lbl: 'Email',        key: 'email',     ph: 'juan@email.com', type: 'email' },
                          { lbl: 'Address',      key: 'address',   ph: 'City, Province' },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={label}>{f.lbl}</label>
                            <input required={f.req} type={f.type || 'text'} value={form[f.key]}
                              maxLength={['firstName', 'lastName'].includes(f.key) ? 35 : undefined}
                              onChange={e => {
                                if (['firstName', 'lastName'].includes(f.key)) {
                                  const raw = e.target.value;
                                  const clean = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, '').slice(0, 35);
                                  setForm(previous => ({ ...previous, [f.key]: clean }));
                                  setNameErrors(previous => ({
                                    ...previous,
                                    [f.key]: !NAME_ALLOWED_CHARACTERS.test(raw) ? 'Numbers and special symbols are not allowed' : '',
                                  }));
                                } else {
                                  setForm(previous => ({ ...previous, [f.key]: e.target.value }));
                                }
                              }}
                              placeholder={f.ph} style={inp} />
                            {['firstName', 'lastName'].includes(f.key) && (
                              <div role={nameErrors[f.key] ? 'alert' : undefined} style={{ color: nameErrors[f.key] ? '#b91c1c' : MUTED, fontSize: 10, marginTop: 4 }}>
                                {nameErrors[f.key] || 'Use 2-35 letters, spaces, hyphens, or apostrophes.'}
                              </div>
                            )}
                          </div>
                        ))}
                        <div>
                          <label style={label}>Preferred Contact Method *</label>
                          <select required value={form.preferredContactMethod}
                            onChange={e => setForm(previous => ({ ...previous, preferredContactMethod: e.target.value }))} style={inp}>
                            <option value="">Select contact method</option>
                            {PREFERRED_CONTACT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div style={card}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 14 }}>👥 Guests</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={label}>Adults</label>
                          <input type="number" min="1" value={form.adults} onChange={e => changeGuests('adults', e.target.value)} style={inp} />
                        </div>
                        <div>
                          <label style={label}>Children</label>
                          <input type="number" min="0" value={form.children} onChange={e => changeGuests('children', e.target.value)} style={inp} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={label}>Cottage (optional)</label>
                          <select value={form.cottageId} onChange={e => setForm(p => ({ ...p, cottageId: e.target.value }))} style={inp}>
                            {COTTAGE_OPTIONS.map(option => (
                              <option key={option.id || 'none'} value={option.id}>
                                {option.id ? `${option.label} · ₱${option.price.toLocaleString()}` : option.label}
                              </option>
                            ))}
                          </select>
                          {cottageSuggestion?.cottage && form.cottageId !== cottageSuggestion.cottage.id && (
                            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Suggested for {guestTotal}: {cottageSuggestion.cottage.label}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={card}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 14 }}>💳 Payment</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={label}>Payment Method</label>
                          <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} style={inp}>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="card">Credit/Debit Card</option>
                            <option value="bank">Bank Transfer</option>
                          </select>
                        </div>
                        <div>
                          <label style={label}>Payment Status</label>
                          <select value={form.paymentStatus} onChange={e => setForm({ ...form, paymentStatus: e.target.value })} style={inp}>
                            <option value="paid">Paid</option>
                            <option value="partial">Partial</option>
                            <option value="pending">Pending</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div style={card}>
                      <label style={label}>Special Requests / Notes</label>
                      <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="Special requests, extra beds, dietary needs, etc." rows={3} style={{ ...inp, resize: 'vertical' }} />
                    </div>

                    <motion.button type="submit" disabled={saving} whileHover={{ scale: saving ? 1 : 1.01 }} whileTap={{ scale: saving ? 1 : 0.98 }}
                      style={{ width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'Poppins', sans-serif" }}>
                      {saving ? 'Saving…' : '✅ Confirm Walk-in Reservation'}
                    </motion.button>
                  </form>
                </div>

                {/* Booking summary */}
                <aside style={{ ...card, flex: '0 0 300px', maxWidth: '100%', position: 'sticky', top: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 14 }}>📋 Booking Summary</div>
                  {roomPhoto(selectedRoom, 120)}
                  <div style={{ background: CARD2, borderRadius: 10, padding: 12, margin: '14px 0' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{selectedRoom.roomNumber}</div>
                    <div style={{ fontSize: 11, color: MUTED, margin: '2px 0 6px' }}>{selectedRoom.type}{categoryOf(selectedRoom) ? ` · ${categoryOf(selectedRoom).category}` : ''}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>
                      ₱{rateOf(selectedRoom).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>/{stayUnit}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {amenitiesOf(selectedRoom).map(a => <span key={a} style={tag}>{a.trim()}</span>)}
                  </div>
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 6 }}>
                      <span>{isTour ? bookingOption.label : 'Dates'}</span><span>{isTour ? formatDate(form.checkIn) : `${formatDate(form.checkIn)} → ${formatDate(form.checkOut)}`}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 6 }}>
                      <span>Duration</span><span>{nights} {stayUnit}{nights !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                      <span style={{ color: TEXT }}>Estimated total</span><span style={{ color: ACCENT }}>₱{totalAmount.toLocaleString()}</span>
                    </div>
                    <button type="button" onClick={() => setStep(1)}
                      style={{ marginTop: 12, width: '100%', ...inp, cursor: 'pointer', color: MUTED, textAlign: 'center' }}>
                      Change dates or room
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {upsellOpen && (
        <div role="presentation" onClick={() => setUpsellOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="walkin-upsell-title" onClick={e => e.stopPropagation()} style={{ ...card, maxWidth: 420, width: '100%' }}>
            <div id="walkin-upsell-title" style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Need more space?</div>
            <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: MUTED }}>{COUPLE_ROOM_LIMIT_MESSAGE}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setUpsellOpen(false)} style={{ ...inp, width: 'auto', cursor: 'pointer' }}>Keep Couple Room</button>
              <button type="button" onClick={switchToFamilySuite} style={{ background: ACCENT, color: ACCENT_TEXT, border: 0, borderRadius: 10, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>Switch to Family Suite for 6</button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}