import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, FOREST_DEEP, INK, LINE, MOSS, PAPER, SERIF, SANS } from '../components/clientTheme';
import { useResortAvailability } from '../components/ResortAvailabilityContext';
import BookingSteps from '../components/BookingSteps';
import { decorateRoom } from '../lib/roomCatalog';
import {
  calculateBookingPrice, getGuestCountViolation, getResortNow, getRoomCapacityPolicy,
  getStayDurationError, getStayUnits, getTourCutoffError,
} from '../../lib/bookingPricing';
import { MIN_GROUP_GUESTS } from '../../lib/corporatePackages';

// Step-by-step start of a booking: 1 Type (personal or group), 2 When (stay
// type, dates, guests), 3 Choose a room (only rooms free on those dates,
// best fits first) — or, for day and night tours, just a cottage. The rest
// (stay details, your details, review & pay) happens on /book/:roomId.

const STAYS = [
  { id: 'overnight', name: 'Overnight stay', hint: 'Sleep over · check out another day' },
  { id: 'day', name: 'Day tour', hint: 'Same day · 8:00 AM – 5:00 PM' },
  { id: 'night', name: 'Night tour', hint: 'Same day · 5:00 PM – 10:00 PM' },
];
const MAX_PERSONAL_GUESTS = MIN_GROUP_GUESTS - 1;

const addDaysKey = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};
const addMonthsKey = (key, months) => {
  const [y, m, d] = key.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d, lastDay));
  return result.toISOString().slice(0, 10);
};
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;
const longDate = key => (key ? new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function BookingWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { available: resortOpen, loading: resortLoading } = useResortAvailability();
  const today = getResortNow().dateKey;
  const maxDate = addMonthsKey(today, 2);
  const presetRoomId = params.get('room') || '';

  const [step, setStep] = useState(() => {
    const wanted = params.get('step');
    if (wanted === 'room' && params.get('checkIn')) return 2;
    return presetRoomId || params.get('type') === 'personal' ? 1 : 0;
  });
  const [stay, setStay] = useState(() => (['overnight', 'day', 'night'].includes(params.get('stay')) ? params.get('stay') : 'overnight'));
  const [checkIn, setCheckIn] = useState(() => params.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(() => params.get('checkOut') || '');
  const [adults, setAdults] = useState(() => Math.max(1, Number(params.get('adults')) || 2));
  const [children, setChildren] = useState(() => Math.max(0, Number(params.get('children')) || 0));
  const [whenError, setWhenError] = useState('');

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [availableIds, setAvailableIds] = useState(null);
  const [availabilityError, setAvailabilityError] = useState('');

  const isTour = stay !== 'overnight';
  const stayEnd = isTour ? checkIn : checkOut;
  const guests = Number(adults) + Number(children);

  useEffect(() => {
    getDocs(collection(db, 'rooms'))
      .then(snapshot => setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).map(decorateRoom)))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  // Scroll to the top whenever the step changes.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  // Keep the address in step so Back and refresh work. Only while this page
  // is showing: once the guest moves on to a room or cottage, leave the new
  // page's address (and the details passed to it) alone.
  useEffect(() => {
    if (location.pathname !== '/book') return;
    const next = new URLSearchParams();
    if (presetRoomId) next.set('room', presetRoomId);
    if (step >= 1) next.set('type', 'personal');
    next.set('stay', stay);
    if (checkIn) next.set('checkIn', checkIn);
    if (!isTour && checkOut) next.set('checkOut', checkOut);
    next.set('adults', String(adults));
    next.set('children', String(children));
    if (step === 2) next.set('step', 'room');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [step, stay, checkIn, checkOut, adults, children, isTour, presetRoomId, setParams, params, location.pathname]);

  const presetRoom = rooms.find(room => room.id === presetRoomId) || null;

  const validateWhen = () => {
    if (!checkIn) return isTour ? 'Choose the date of your tour.' : 'Choose your check-in date.';
    if (checkIn < today || checkIn > maxDate) return `Choose a date from today up to ${longDate(maxDate)}.`;
    if (isTour) {
      const cutoff = getTourCutoffError(checkIn, stay);
      if (cutoff) return cutoff;
    } else {
      if (!checkOut) return 'Choose your check-out date.';
      if (checkOut > maxDate) return `Check-out can be up to ${longDate(maxDate)}.`;
      const duration = getStayDurationError(checkIn, checkOut);
      if (duration) return duration;
    }
    if (!(Number(adults) >= 1)) return 'At least one adult is needed.';
    if (guests > MAX_PERSONAL_GUESTS) return `For ${MIN_GROUP_GUESTS} or more guests, please use a group booking.`;
    return '';
  };

  const goToRooms = () => {
    const error = validateWhen();
    setWhenError(error);
    if (!error) setStep(2);
  };

  // Which rooms are free on the chosen dates.
  useEffect(() => {
    if (step !== 2 || !checkIn || !stayEnd) return undefined;
    let active = true;
    setAvailableIds(null);
    setAvailabilityError('');
    fetch(`/api/room-availability?${new URLSearchParams({ startDate: checkIn, endDate: stayEnd })}`)
      .then(response => response.json().then(data => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) throw new Error(data.error || 'Availability could not be checked.');
        setAvailableIds(data.availableRoomIds || []);
      })
      .catch(error => { if (active) { setAvailableIds([]); setAvailabilityError(error.message || 'Availability could not be checked.'); } });
    return () => { active = false; };
  }, [step, checkIn, stayEnd]);

  const nights = isTour ? 1 : getStayUnits(checkIn, checkOut);
  const priceFor = room => {
    try {
      return calculateBookingPrice({
        room, bookingType: isTour ? 'daytour' : 'overnight', nights: Math.max(1, nights || 1),
        adults: Number(adults), children: Number(children), tourPeriod: isTour ? stay : 'day',
      }).subtotalAmount;
    } catch { return null; }
  };

  const { fitting, tooSmall } = useMemo(() => {
    if (!availableIds) return { fitting: [], tooSmall: 0 };
    const free = rooms.filter(room => availableIds.includes(room.id));
    const fits = free
      .filter(room => !getGuestCountViolation(room, Number(adults), Number(children)))
      .map(room => ({ room, price: priceFor(room), kind: getRoomCapacityPolicy(room)?.label || room.groupTitle }))
      .filter(entry => entry.price !== null)
      .sort((a, b) => a.price - b.price || String(a.room.title).localeCompare(String(b.room.title)));
    return { fitting: fits, tooSmall: free.length - fits.length };
  }, [rooms, availableIds, adults, children, stay, nights]); // eslint-disable-line react-hooks/exhaustive-deps

  const presetEntry = presetRoom ? fitting.find(entry => entry.room.id === presetRoom.id) : null;
  const recommended = fitting.filter(entry => entry.room.id !== presetRoomId).slice(0, 3);
  const others = fitting.filter(entry => entry.room.id !== presetRoomId).slice(3);

  const chooseRoom = room => {
    navigate(`/book/${room.id}?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(stayEnd)}`, {
      state: {
        bookingForm: {
          bookingType: isTour ? 'daytour' : 'overnight',
          tourPeriod: isTour ? stay : 'day',
          adults: Number(adults),
          children: Number(children),
          checkIn,
          checkOut: stayEnd,
        },
      },
    });
  };
  const chooseCottageOnly = () => {
    navigate(`/book-cottage?${new URLSearchParams({ date: checkIn, tour: stay, adults: String(adults), children: String(children) })}`);
  };

  const card = { background: '#fff', border: `1px solid ${LINE}`, padding: 'clamp(18px, 4vw, 28px)', minWidth: 0 };
  const choice = active => ({ textAlign: 'left', border: `1.5px solid ${active ? FOREST : LINE}`, background: active ? CREAM : '#fff', padding: '16px 18px', cursor: 'pointer', fontFamily: SANS, color: FOREST_DEEP, minWidth: 0 });
  const label = { display: 'grid', gap: 6, color: FOREST_DEEP, font: `600 11px/1.4 ${SANS}`, letterSpacing: '.06em', textTransform: 'uppercase', minWidth: 0 };
  const input = { border: `1px solid ${LINE}`, padding: '12px', font: `14px ${SANS}`, color: INK, background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box' };
  const primary = { border: 0, background: FOREST, color: '#fff', padding: '14px 22px', font: `600 13px ${SANS}`, letterSpacing: '.05em', cursor: 'pointer' };
  const secondary = { border: `1px solid ${LINE}`, background: '#fff', color: FOREST, padding: '13px 18px', font: `600 13px ${SANS}`, cursor: 'pointer' };
  const counter = (value, setValue, min, name) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" aria-label={`Fewer ${name}`} disabled={value <= min} onClick={() => setValue(Math.max(min, value - 1))} style={{ ...secondary, padding: '10px 14px', opacity: value <= min ? 0.5 : 1 }}>−</button>
      <span style={{ minWidth: 28, textAlign: 'center', font: `600 16px ${SANS}`, color: INK }} aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${name}`} disabled={value + (name === 'adults' ? Number(children) : Number(adults)) >= MAX_PERSONAL_GUESTS} onClick={() => setValue(value + 1)} style={{ ...secondary, padding: '10px 14px' }}>+</button>
    </div>
  );

  const roomCard = (entry, badge) => {
    const { room, price } = entry;
    return (
      <article key={room.id} style={{ background: '#fff', border: `1px solid ${badge === 'Your pick' ? FOREST : LINE}`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ position: 'relative', height: 170, overflow: 'hidden' }}>
          <img src={room.cover} alt={room.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {badge && <span style={{ position: 'absolute', top: 12, left: 12, background: badge === 'Your pick' ? FOREST : BRASS, color: '#fff', padding: '5px 10px', font: `600 10px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>{badge}</span>}
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase' }}>{entry.kind}</div>
          <strong style={{ font: `500 20px ${SERIF}`, color: INK }}>{room.title}</strong>
          <span style={{ font: `12px ${SANS}`, color: '#6b6a5c' }}>Up to {getRoomCapacityPolicy(room)?.maxGuests || '—'} guests · {room.amenities.slice(0, 3).join(' · ')}</span>
          <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: `1px solid ${LINE}` }}>
            <span style={{ font: `600 18px ${SERIF}`, color: FOREST }}>{peso(price)}<small style={{ font: `11px ${SANS}`, color: '#8d8877' }}> for your group</small></span>
            <button type="button" onClick={() => chooseRoom(room)} style={{ ...primary, padding: '10px 16px', fontSize: 12 }}>Choose</button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <main style={{ background: PAPER, minHeight: '70vh', padding: 'clamp(28px, 6vw, 64px) 16px', fontFamily: SANS }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <BookingSteps current={step} onStep={index => setStep(index)} />

        {!resortLoading && !resortOpen && (
          <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', padding: 14, marginBottom: 18, font: `13px ${SANS}` }}>Reservations are temporarily closed.</div>
        )}

        {step === 0 && (
          <section style={card}>
            <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10 }}>Step 1 of 6</div>
            <h1 style={{ color: FOREST_DEEP, font: `500 clamp(28px, 5vw, 40px)/1.15 ${SERIF}`, margin: '0 0 8px' }}>What kind of booking?</h1>
            <p style={{ color: '#6b6a5c', font: `14px/1.7 ${SANS}`, margin: '0 0 22px' }}>Pick the one that fits your group.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <button type="button" onClick={() => setStep(1)} style={choice(false)}>
                <span style={{ display: 'block', color: FOREST, font: `600 11px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>Personal booking</span>
                <strong style={{ display: 'block', font: `500 24px ${SERIF}`, marginBottom: 6 }}>1–{MAX_PERSONAL_GUESTS} guests</strong>
                <span style={{ color: '#6b6a5c', font: `13px/1.6 ${SANS}` }}>Overnight stay, or a day or night tour — with a room or just a cottage.</span>
              </button>
              <button type="button" onClick={() => navigate('/corporate-booking')} style={{ ...choice(false), background: FOREST, color: '#fff', borderColor: FOREST }}>
                <span style={{ display: 'block', color: '#e4d4a7', font: `600 11px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>Corporate / big group</span>
                <strong style={{ display: 'block', font: `500 24px ${SERIF}`, marginBottom: 6 }}>{MIN_GROUP_GUESTS}–250 guests</strong>
                <span style={{ color: 'rgba(255,255,255,.8)', font: `13px/1.6 ${SANS}` }}>Group packages priced per guest. Book at least 1 week ahead.</span>
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section style={card}>
            <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10 }}>Step 2 of 6</div>
            <h1 style={{ color: FOREST_DEEP, font: `500 clamp(28px, 5vw, 40px)/1.15 ${SERIF}`, margin: '0 0 8px' }}>When are you coming?</h1>
            {presetRoom && <p style={{ color: '#6b6a5c', font: `14px ${SANS}`, margin: '0 0 6px' }}>You picked <strong style={{ color: FOREST }}>{presetRoom.title}</strong>. We'll check it's free for your dates.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '18px 0' }}>
              {STAYS.map(option => {
                const closed = option.id !== 'overnight' && checkIn === today && Boolean(getTourCutoffError(today, option.id));
                return (
                  <button key={option.id} type="button" aria-pressed={stay === option.id} onClick={() => { setStay(option.id); setWhenError(''); }} style={choice(stay === option.id)}>
                    <strong style={{ display: 'block', font: `600 15px ${SANS}` }}>{option.name}</strong>
                    <span style={{ font: `12px ${SANS}`, color: '#6b6a5c' }}>{closed ? 'Closed for today — pick another date' : option.hint}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <label style={label}>{isTour ? 'Date' : 'Check-in'}
                <input type="date" min={today} max={maxDate} value={checkIn} onChange={e => { const value = e.target.value; setCheckIn(value); if (checkOut && checkOut <= value) setCheckOut(''); setWhenError(''); }} style={input} />
              </label>
              {!isTour && (
                <label style={label}>Check-out
                  <input type="date" min={checkIn ? addDaysKey(checkIn, 1) : addDaysKey(today, 1)} max={maxDate} value={checkOut} onChange={e => { setCheckOut(e.target.value); setWhenError(''); }} style={input} />
                </label>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 18 }}>
              <div style={label}>Adults{counter(Number(adults), setAdults, 1, 'adults')}</div>
              <div style={label}>Children (under 10){counter(Number(children), setChildren, 0, 'children')}</div>
            </div>
            {!isTour && checkIn && checkOut && !getStayDurationError(checkIn, checkOut) && (
              <p style={{ color: FOREST, font: `600 13px ${SANS}`, margin: '16px 0 0' }}>{nights} night{nights === 1 ? '' : 's'} · {longDate(checkIn)} → {longDate(checkOut)}</p>
            )}
            {whenError && <p role="alert" style={{ color: '#b42318', font: `13px ${SANS}`, margin: '14px 0 0' }}>{whenError}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => (presetRoomId ? navigate('/rooms') : setStep(0))} style={secondary}>← Back</button>
              <button type="button" onClick={goToRooms} disabled={!resortOpen} style={{ ...primary, opacity: resortOpen ? 1 : 0.6 }}>See available rooms →</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ color: BRASS, font: `600 11px ${SANS}`, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 10 }}>Step 3 of 6</div>
              <h1 style={{ color: FOREST_DEEP, font: `500 clamp(28px, 5vw, 40px)/1.15 ${SERIF}`, margin: '0 0 6px' }}>Choose a room</h1>
              <p style={{ color: '#6b6a5c', font: `14px/1.6 ${SANS}`, margin: 0 }}>
                {STAYS.find(option => option.id === stay).name} · {isTour ? longDate(checkIn) : `${longDate(checkIn)} → ${longDate(checkOut)}`} · {adults} adult{Number(adults) === 1 ? '' : 's'}{Number(children) ? `, ${children} child${Number(children) === 1 ? '' : 'ren'}` : ''}
                {' '}<button type="button" onClick={() => setStep(1)} style={{ border: 0, background: 'none', color: FOREST, textDecoration: 'underline', cursor: 'pointer', font: `600 13px ${SANS}`, padding: 0 }}>Change</button>
              </p>
            </div>

            {/* No room: only for tours */}
            <button type="button" onClick={isTour ? chooseCottageOnly : undefined} disabled={!isTour}
              style={{ ...choice(false), width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 18, opacity: isTour ? 1 : 0.6, cursor: isTour ? 'pointer' : 'not-allowed' }}>
              <span>
                <strong style={{ display: 'block', font: `600 15px ${SANS}` }}>No room — just a cottage</strong>
                <span style={{ font: `12px/1.6 ${SANS}`, color: '#6b6a5c' }}>
                  {isTour ? 'Swim and relax for the tour with your own cottage. Entrance per person + cottage.' : 'Only for day and night tours. Overnight stays need a room.'}
                </span>
              </span>
              {isTour && <span style={{ font: `600 13px ${SANS}`, color: FOREST, whiteSpace: 'nowrap' }}>See cottages →</span>}
            </button>

            {roomsLoading || availableIds === null ? (
              <div style={{ ...card, textAlign: 'center', color: MOSS }}>Checking which rooms are free…</div>
            ) : availabilityError ? (
              <div role="alert" style={{ ...card, color: '#b42318' }}>{availabilityError} <button type="button" onClick={() => setStep(1)} style={{ ...secondary, marginLeft: 8, padding: '8px 12px' }}>Change dates</button></div>
            ) : (
              <>
                {presetRoom && (
                  presetEntry ? (
                    <div style={{ marginBottom: 22 }}>
                      <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 10px' }}>Your room is free</h2>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>{roomCard(presetEntry, 'Your pick')}</div>
                    </div>
                  ) : (
                    <div role="status" style={{ ...card, marginBottom: 18, color: '#9a3412', background: '#fff7ed', borderColor: '#fed7aa' }}>
                      {presetRoom.title} {getGuestCountViolation(presetRoom, Number(adults), Number(children)) && availableIds.includes(presetRoom.id)
                        ? `is too small for ${guests} guests.`
                        : 'is already booked for those dates.'} Here are rooms that fit instead.
                    </div>
                  )
                )}
                {fitting.length === 0 ? (
                  <div style={{ ...card, color: '#6b6a5c' }}>
                    No room is free for {guests} guest{guests === 1 ? '' : 's'} on those dates. Try other dates{isTour ? ', or book just a cottage above' : ''}.
                  </div>
                ) : (
                  <>
                    {recommended.length > 0 && (
                      <>
                        <h2 style={{ font: `500 22px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 4px' }}>Recommended for your group</h2>
                        <p style={{ color: '#6b6a5c', font: `12px ${SANS}`, margin: '0 0 12px' }}>Free on your dates and fit {guests} guest{guests === 1 ? '' : 's'}, best value first.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 26 }}>
                          {recommended.map((entry, index) => roomCard(entry, index === 0 ? 'Best value' : 'Recommended'))}
                        </div>
                      </>
                    )}
                    {others.length > 0 && (
                      <>
                        <h2 style={{ font: `500 20px ${SERIF}`, color: FOREST_DEEP, margin: '0 0 12px' }}>Other available rooms</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                          {others.map(entry => roomCard(entry, ''))}
                        </div>
                      </>
                    )}
                  </>
                )}
                {tooSmall > 0 && <p style={{ color: '#8d8877', font: `12px ${SANS}`, margin: '16px 0 0' }}>{tooSmall} free room{tooSmall === 1 ? ' is' : 's are'} hidden because {tooSmall === 1 ? 'it is' : 'they are'} too small for your group.</p>}
              </>
            )}
            <div style={{ marginTop: 22 }}>
              <button type="button" onClick={() => setStep(1)} style={secondary}>← Back</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
