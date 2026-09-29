import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { BRASS, CREAM, FOREST, INK, LINE, MOSS, PAPER, SERIF, SANS, FALLBACK_ROOM_IMAGES, resolveRoomImage } from '../components/clientTheme';
import OccupancyBadge from '../components/OccupancyBadge';

/* ------------------------------------------------------------------ */
/* Room catalog copied from lawiswiskawayanresort.com/regular-rooms    */
/* Matched to Firestore rooms by name (room.name or room.roomNumber).  */
/* Firestore values (price, description, image, amenities) win when    */
/* present; the catalog fills in whatever is missing.                  */
/* ------------------------------------------------------------------ */
const UP = 'https://lawiswiskawayanresort.com/wp-content/uploads/';
const HERO_IMAGE = `${UP}2020/01/hero192x-scaled.jpg`;

const GROUPS = [
  {
    title: 'Couple Rooms',
    price: 3000,
    capacity: 'Couple',
    intro: 'Cozy, intimate rooms for two. Each room is sanitized and set up for your comfort in a peaceful, nature-inspired setting.',
  },
  {
    title: 'Couple Rooms with Extra Bed',
    price: 3000,
    capacity: 'Couple + optional extra bed',
    intro: 'Room for a small family. Choose the option to add an extra bed. Available in both our new and old buildings.',
  },
  {
    title: 'Family Rooms for 4',
    price: 4600,
    capacity: 'Up to 4 guests',
    intro: 'Spacious family rooms for relaxing and bonding, in the new or old building.',
  },
  {
    title: 'Family Rooms for 6',
    price: 6200,
    capacity: 'Up to 6 guests',
    intro: 'Deluxe rooms with space for the whole family to rest, reconnect, and enjoy the garden.',
  },
];

// [name, image path, group index, description]
const CATALOG_ROWS = [
  ['Himbing', '2024/10/Himbing-01-1400x700-1.jpeg', 0, 'Slip into deep relaxation in Himbing, one of our deluxe couple rooms. Offering a blend of elegance and coziness, this room is designed for couples looking to recharge and reconnect.'],
  ['Tahimik', '2024/10/Tahimik-02-1400x700-1.jpeg', 0, 'True to its name, Tahimik is a haven of peace. These deluxe rooms are thoughtfully designed for couples who value tranquility and restfulness during their stay.'],
  ['Minamahal', '2024/10/MInamahal-01-1400x700-1.jpeg', 0, 'Minamahal is where couples can find ultimate comfort. With its well-designed interiors and a tranquil atmosphere on the second floor, this room is perfect for those seeking both privacy and luxury.'],
  ['Bituin', '2024/10/Bituin-02-1400x700-2.jpeg', 0, 'For those who want a touch of romance, Bituin, located on the second floor, offers stunning views of the surrounding landscape. Let the beauty of the night sky accompany your stay in this elevated and cozy space.'],
  ['Dilag', '2024/10/Dilag-03-1400x700-1.jpeg', 0, 'Step into the bright and inviting space of Dilag. Located on the first floor, this couple’s retreat ensures privacy and relaxation, ideal for unwinding after a day of resort activities.'],
  ['Tadhana', '2024/10/Tadhana-02-1400x700-1.jpeg', 0, 'Tadhana is your serene escape nestled on the first floor. Whether you’re celebrating a special moment or simply seeking time away together, Tadhana brings a sense of calm with all the essentials to make your stay delightful.'],
  ['Hirang', '2020/04/Hirang-02-1400x700-1.jpeg', 0, 'Hirang offers modern comforts on the first floor of our new building. Its strategic location offers easy access to resort amenities, making it the perfect spot for couples looking for relaxation and convenience.'],
  ['Panaginip', '2024/10/Panaginip-05.jpeg', 1, 'True to its name, Panaginip offers a dreamy escape for families. With ample space and a relaxing atmosphere on the first floor, it’s designed for families who want both convenience and privacy.'],
  ['Aruga', '2024/10/Aruga-02-1400x700-1.jpeg', 1, 'Aruga embodies care and comfort. Situated on the first floor of the old building, this room is perfect for families seeking a cozy, well-appointed space to relax after a day of adventure.'],
  ['Giliw', '2024/10/Giliw-01-1400x700-1.jpeg', 1, 'Giliw, located on the first floor of our charming old building, is a family-friendly space that blends modern comforts with a touch of classic design. A perfect base for families to explore and enjoy resort activities.'],
  ['Lambingan', '2024/10/Lambingan-01-1400x700-1.jpeg', 1, 'Located in the heart of the new building, Lambingan is a sanctuary for families looking for both comfort and easy access to resort amenities. A serene environment awaits your family’s stay, ensuring peace and relaxation.'],
  ['Irog', '2024/10/Irog-01-1400x700-1.jpeg', 1, 'Irog is a perfect retreat for families, offering modern amenities and a tranquil ambiance on the first floor of our new building. Spacious and comfortable, it’s a room designed for quality family time.'],
  ['Pag-ibig', '2024/10/Pag-ibig-04-1400x700-1.jpeg', 2, 'Pag-ibig brings a sense of love and togetherness to your family’s vacation. With spacious interiors and a relaxing ambiance, it’s the perfect setting for families to bond and create lasting memories.'],
  ['Kalinga', '2024/10/Kalinga-02-1400x700-1.jpeg', 2, 'Kalinga offers warmth and care, providing a cozy and restful environment on the second floor. This family room is ideal for those looking for a peaceful escape with all the essentials for comfort.'],
  ['Ugoy', '2024/10/Ugoy-02-1400x700-1.jpeg', 2, 'Ugoy, located on the second floor of the old building, provides an inviting and serene space for families to unwind. Its elevated position offers quietness, making it perfect for a peaceful family retreat.'],
  ['Aliwalas', '2024/10/Aliwalas-02-1400x700-1.jpeg', 2, 'Aliwalas brings light and openness to your family’s vacation. Situated on the first floor, it’s a bright and airy room, perfect for families who appreciate spacious and relaxing environments.'],
  ['Ginhawa', '2024/10/Ginhawa-03-1400x700-1.jpeg', 2, 'Ginhawa offers comfort and ease for families on the first floor of the old building. Its spacious layout ensures that your family has everything they need for a restful stay.'],
  ['Iglipan', '2024/10/Iglipan-05-1400x700-1.jpeg', 2, 'Iglipan provides a homely atmosphere in the old building. This room offers a cozy space for families to bond and unwind in a peaceful and comfortable setting.'],
  ['Panatag', '2024/10/Panatag-01-1400x700-1.jpeg', 3, 'True to its name, Panatag offers a serene and peaceful escape for families. This deluxe room is ideal for a restful stay, with a spacious layout that allows for bonding and relaxation.'],
  ['Payapa', '2024/10/Payapa-01-1400x700-1.jpeg', 3, 'Payapa is a sanctuary of tranquility for families. Designed with ample space, this deluxe room ensures comfort and relaxation for all members of the family.'],
];

const CATALOG = Object.fromEntries(
  CATALOG_ROWS.map(([name, path, group, description]) => [
    name.toLowerCase(),
    { name, image: UP + path, group, description },
  ])
);

// Extra photos we know about (Tahimik has a 5-photo gallery on the resort site).
const EXTRA_GALLERY = {
  tahimik: [1, 2, 3, 4, 5].map(n => `${UP}2024/10/Tahimik-0${n}.jpeg`),
};

const DEFAULT_AMENITIES = 'Air conditioning, Wi-Fi, Hot shower';
const OTHER_GROUP = { title: 'Other Rooms', capacity: '', intro: '' };

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */
const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`;

/* Merge a Firestore room with the catalog entry that matches its name. */
function decorateRoom(room, index) {
  const key = String(room.name || room.roomNumber || '').trim().toLowerCase();
  const entry = CATALOG[key];
  const group = entry ? GROUPS[entry.group] : null;
  const groupTitle = group ? group.title : (room.type ? String(room.type) : OTHER_GROUP.title);
  const cover = entry?.image || resolveRoomImage(room) || FALLBACK_ROOM_IMAGES[index % FALLBACK_ROOM_IMAGES.length];
  const gallery = EXTRA_GALLERY[key] || [cover];
  return {
    ...room,
    key,
    title: entry?.name || room.name || `Room ${room.roomNumber}`,
    groupTitle,
    capacity: group?.capacity || '',
    cover,
    gallery,
    price: Number(room.price) || group?.price || 0,
    description: room.description || entry?.description || 'A comfortable stay surrounded by the quiet rhythm of the garden.',
    amenities: String(room.amenities || DEFAULT_AMENITIES).split(',').map(item => item.trim()).filter(Boolean),
  };
}

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const [availableRoomIds, setAvailableRoomIds] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const datesRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatDate(today);
  const maxDate = addMonths(today, 2);
  const maxDateKey = formatDate(maxDate);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [checkIn, setCheckIn] = useState(params.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(params.get('checkOut') || '');

  useEffect(() => {
    getDocs(collection(db, 'rooms'))
      .then(snapshot => {
        setRooms(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/room-availability')
      .then(response => {
        if (!response.ok) throw new Error('Availability unavailable');
        return response.json();
      })
      .then(data => { if (active) setFullyBookedDates(data.fullyBookedDates || []); })
      .catch(() => { if (active) setCalendarError(true); })
      .finally(() => { if (active) setCalendarLoading(false); });
    return () => { active = false; };
  }, []);

  const rangeIsValid = Boolean(checkIn && checkOut && checkIn >= todayKey && checkOut > checkIn && checkOut <= maxDateKey);
  useEffect(() => {
    if (!rangeIsValid) {
      setAvailableRoomIds([]);
      setAvailabilityLoading(false);
      setAvailabilityError(false);
      return undefined;
    }
    const range = new URLSearchParams({ startDate: checkIn, endDate: checkOut });
    let active = true;
    setAvailabilityLoading(true);
    setAvailabilityError(false);
    fetch(`/api/room-availability?${range.toString()}`)
      .then(response => {
        if (!response.ok) throw new Error('Availability unavailable');
        return response.json();
      })
      .then(data => { if (active) setAvailableRoomIds(data.availableRoomIds || []); })
      .catch(() => { if (active) { setAvailableRoomIds([]); setAvailabilityError(true); } })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [checkIn, checkOut, rangeIsValid]);

  // Close the detail dialog with Escape.
  useEffect(() => {
    if (!selectedRoom) return undefined;
    const onKey = event => { if (event.key === 'Escape') setSelectedRoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRoom]);

  /* Every room is always listed, with its own price and description.  */
  /* Dates only add an availability badge and enable the Book button.  */
  const allRooms = useMemo(() => rooms.map(decorateRoom), [rooms]);

  const statusOf = room => {
    if (!rangeIsValid) return 'unknown';
    if (availabilityLoading) return 'checking';
    if (availabilityError) return 'error';
    return availableRoomIds.includes(room.id) ? 'available' : 'booked';
  };

  const groupTitles = useMemo(() => {
    const present = new Set(allRooms.map(room => room.groupTitle));
    const ordered = GROUPS.map(group => group.title).filter(title => present.has(title));
    const extras = [...present].filter(title => !ordered.includes(title));
    return [...ordered, ...extras];
  }, [allRooms]);

  const visible = allRooms.filter(room => {
    const text = `${room.title} ${room.groupTitle} ${room.description} ${room.amenities.join(' ')}`.toLowerCase();
    const matchesText = !search || text.includes(search.toLowerCase());
    const matchesGroup = filter === 'all' || room.groupTitle === filter;
    const matchesDates = !(onlyAvailable && rangeIsValid) || statusOf(room) === 'available';
    return matchesText && matchesGroup && matchesDates;
  });

  const sections = groupTitles
    .map(title => ({
      title,
      info: GROUPS.find(group => group.title === title) || OTHER_GROUP,
      items: visible.filter(room => room.groupTitle === title),
    }))
    .filter(section => section.items.length);

  const availableCount = rangeIsValid && !availabilityLoading && !availabilityError
    ? allRooms.filter(room => availableRoomIds.includes(room.id)).length
    : null;

  /* Calendar */
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarDays = Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) =>
    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)
  );
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const monthLabel = calendarMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' });

  const selectDate = dateKey => {
    if (!checkIn || checkOut || dateKey <= checkIn) {
      setCheckIn(dateKey);
      setCheckOut('');
      return;
    }
    setCheckOut(dateKey);
  };
  const resetDates = () => {
    setCheckIn('');
    setCheckOut('');
    setOnlyAvailable(false);
  };
  const openRoom = room => { setPhotoIndex(0); setSelectedRoom(room); };
  const goToDates = () => {
    setSelectedRoom(null);
    datesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const bookRoom = room => {
    if (!rangeIsValid) { goToDates(); return; }
    window.location.href = `/book/${room.id}?checkIn=${checkIn}&checkOut=${checkOut}`;
  };

  const badgeFor = room => {
    switch (statusOf(room)) {
      case 'available': return { label: 'Available', bg: CREAM, color: FOREST };
      case 'booked': return { label: 'Not available', bg: 'rgba(35,42,27,.82)', color: '#fff' };
      case 'checking': return { label: 'Checking…', bg: 'rgba(255,255,255,.9)', color: MOSS };
      case 'error': return { label: 'Unverified', bg: 'rgba(255,255,255,.9)', color: '#b91c1c' };
      default: return null;
    }
  };
  const bookLabel = room => {
    const status = statusOf(room);
    if (status === 'unknown') return 'Select dates';
    if (status === 'available') return 'Book room';
    if (status === 'checking') return 'Checking…';
    return 'Unavailable';
  };
  const bookDisabled = room => ['checking', 'booked', 'error'].includes(statusOf(room));

  const bookButtonStyle = room => {
    const disabled = bookDisabled(room);
    return {
      background: disabled ? '#e5e1d4' : FOREST,
      color: disabled ? '#989382' : '#fff',
      border: 0,
      borderRadius: '999px',
      padding: '11px 16px',
      font: `600 11px ${SANS}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    };
  };

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK }}>
      <style>{`
        .rooms-page-shell * { box-sizing: border-box; }
        .rooms-hero-grid { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 28px; align-items: end; }
        .rooms-tag { letter-spacing: 0.2em; text-transform: uppercase; font-size: 11px; font-weight: 600; }
        .rooms-filter-chip { border: 1px solid ${LINE}; background: transparent; color: ${FOREST}; padding: 11px 14px; border-radius: 999px; font: 600 11px ${SANS}; cursor: pointer; transition: all 0.2s ease; }
        .rooms-filter-chip.active { background: ${FOREST}; color: #fff; border-color: ${FOREST}; }
        .rooms-card { background: #fff; border: 1px solid ${LINE}; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .rooms-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(35,42,27,.13); }
        .rooms-card-photo { padding: 0; border: 0; background: none; display: block; width: 100%; cursor: pointer; }
        .rooms-link { border: 0; background: transparent; color: ${FOREST}; text-decoration: underline; cursor: pointer; font: 600 11px ${SANS}; padding: 0; }
        .rooms-modal-backdrop { position: fixed; inset: 0; background: rgba(20,25,15,.6); z-index: 1000; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; overflow-y: auto; }
        .rooms-modal { background: #fff; border-radius: 18px; width: 100%; max-width: 900px; overflow: hidden; position: relative; }
        .rooms-modal-body { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; padding: 28px; }
        .rooms-thumb { border: 2px solid transparent; padding: 0; background: none; cursor: pointer; border-radius: 6px; overflow: hidden; width: 64px; height: 44px; flex: none; }
        .rooms-thumb.active { border-color: ${FOREST}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${BRASS}; outline-offset: 2px; }
        @media (max-width: 900px) {
          .rooms-hero-grid { grid-template-columns: 1fr; }
          .rooms-modal-body { grid-template-columns: 1fr; padding: 20px; }
        }
      `}</style>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          background: `linear-gradient(90deg, rgba(20,25,15,0.76) 0%, rgba(20,25,15,0.48) 40%, rgba(20,25,15,0.62) 100%), url('${HERO_IMAGE}') center/cover no-repeat`,
          padding: '120px 24px 64px',
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="rooms-hero-grid">
            <div style={{ color: '#fff' }}>
              <div className="rooms-tag" style={{ color: '#e9ddb0', marginBottom: '16px' }}>Accommodations</div>
              <h1 style={{ margin: '0 0 18px', color: '#fff', font: `500 clamp(40px, 6vw, 72px)/0.96 ${SERIF}`, maxWidth: '680px' }}>
                A room for the way you want to stay.
              </h1>
              <p style={{ margin: '0 0 22px', maxWidth: '560px', color: 'rgba(255,255,255,0.82)', font: `14px/1.8 ${SANS}` }}>
                {rangeIsValid
                  ? `Showing availability for ${checkIn} to ${checkOut}.`
                  : 'Sleep beneath the bamboo canopy, with room to gather, rest, and breathe.'}
              </p>
              <OccupancyBadge startDate={checkIn || undefined} endDate={checkOut || undefined} style={{ fontFamily: SANS, background: 'rgba(255,255,255,0.9)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', maxWidth: '340px', background: 'rgba(247,242,235,0.96)', borderRadius: '18px', padding: '24px 22px', border: '1px solid rgba(35,42,27,0.08)', boxShadow: '0 20px 50px rgba(20,25,15,0.16)' }}>
                <div className="rooms-tag" style={{ color: MOSS, marginBottom: '12px' }}>At a glance</div>
                <div style={{ fontFamily: SERIF, fontSize: '30px', lineHeight: 1.1, color: FOREST }}>
                  {availableCount !== null ? availableCount : allRooms.length || '—'}
                </div>
                <div style={{ font: `600 11px ${SANS}`, letterSpacing: '0.12em', color: '#6d675f', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {availableCount !== null ? 'Rooms for your stay' : 'Rooms in the resort'}
                </div>
                <div style={{ color: '#777363', font: `12px/1.6 ${SANS}` }}>
                  {rangeIsValid ? `${checkIn} to ${checkOut}` : 'Pick dates below to check availability'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 100px' }}>
        {/* Dates (optional) */}
        <div ref={datesRef} style={{ scrollMarginTop: '24px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div>
            <div className="rooms-tag" style={{ color: BRASS, marginBottom: '8px' }}>Plan your stay</div>
            <h2 style={{ color: INK, margin: 0, font: `500 32px ${SERIF}` }}>Check availability</h2>
          </div>
          <div style={{ color: '#777363', font: `12px ${SANS}` }}>
            Booking dates are available through {maxDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <section aria-label="Choose check-in and check-out dates" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: '12px', padding: '24px', marginBottom: '48px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: FOREST, font: `600 15px ${SANS}`, marginBottom: '5px' }}>Stay dates</div>
              <div style={{ color: '#777363', font: `12px ${SANS}` }}>{checkIn ? (checkOut ? `${checkIn} to ${checkOut}` : 'Choose a check-out date') : 'Choose a check-in date'}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button type="button" aria-label="Previous month" disabled={calendarMonth <= minMonth} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} style={{ border: `1px solid ${LINE}`, background: '#fff', color: FOREST, width: '36px', height: '36px', cursor: calendarMonth <= minMonth ? 'not-allowed' : 'pointer' }}>‹</button>
              <span style={{ minWidth: '145px', textAlign: 'center', color: INK, font: `600 13px ${SANS}` }}>{monthLabel}</span>
              <button type="button" aria-label="Next month" disabled={calendarMonth >= maxMonth} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} style={{ border: `1px solid ${LINE}`, background: '#fff', color: FOREST, width: '36px', height: '36px', cursor: calendarMonth >= maxMonth ? 'not-allowed' : 'pointer' }}>›</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', maxWidth: '480px' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} style={{ textAlign: 'center', color: '#777363', font: `600 10px ${SANS}`, padding: '6px 0' }}>{day}</div>)}
            {Array.from({ length: monthStart.getDay() }, (_, index) => <span key={`blank-${index}`} />)}
            {calendarDays.map(date => {
              const dateKey = formatDate(date);
              const soldOut = fullyBookedDates.includes(dateKey);
              const outsideWindow = dateKey < todayKey || dateKey > maxDateKey;
              const beforeCheckOut = Boolean(checkIn && !checkOut && dateKey <= checkIn);
              const disabled = calendarLoading || calendarError || outsideWindow || soldOut || beforeCheckOut;
              const selected = dateKey === checkIn || dateKey === checkOut;
              const inRange = checkIn && checkOut && dateKey > checkIn && dateKey < checkOut;
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={disabled}
                  aria-label={`${date.toLocaleDateString('en', { month: 'long', day: 'numeric' })}${soldOut ? ', fully booked' : ''}`}
                  onClick={() => selectDate(dateKey)}
                  style={{ minWidth: 0, aspectRatio: '1', border: selected ? `1px solid ${FOREST}` : '1px solid transparent', background: selected ? FOREST : inRange ? CREAM : 'transparent', color: selected ? '#fff' : disabled ? '#bbb7aa' : INK, font: `500 12px ${SANS}`, cursor: disabled ? 'not-allowed' : 'pointer', opacity: outsideWindow ? 0.45 : 1, textDecoration: soldOut ? 'line-through' : 'none' }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', maxWidth: '480px', marginTop: '14px' }}>
            <span role={calendarError ? 'alert' : undefined} style={{ color: calendarError ? '#b91c1c' : '#777363', font: `11px ${SANS}` }}>
              {calendarError ? 'Availability could not be checked. Refresh to try again.' : 'Crossed-out dates are fully booked.'}
            </span>
            {(checkIn || checkOut) && <button type="button" className="rooms-link" onClick={resetDates}>Clear dates</button>}
          </div>
          {availabilityError && (
            <div role="alert" style={{ marginTop: '14px', color: '#b91c1c', font: `12px ${SANS}` }}>
              Room availability could not be verified. Please select your dates again.
            </div>
          )}
        </section>

        {/* Rooms */}
        <div style={{ marginBottom: '20px' }}>
          <div className="rooms-tag" style={{ color: BRASS, marginBottom: '8px' }}>Our rooms</div>
          <h2 style={{ color: INK, margin: 0, font: `500 32px ${SERIF}` }}>
            {rangeIsValid && onlyAvailable ? `${visible.length} available rooms` : 'Rooms & rates'}
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by room name or amenity"
            aria-label="Search rooms"
            style={{ flex: '1 1 260px', minWidth: '220px', border: `1px solid ${LINE}`, borderRadius: '999px', background: '#fff', padding: '14px 18px', color: INK, font: `12px ${SANS}`, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '40px' }}>
          {['all', ...groupTitles].map(title => (
            <button key={title} type="button" onClick={() => setFilter(title)} className={`rooms-filter-chip ${filter === title ? 'active' : ''}`}>
              {title === 'all' ? 'All rooms' : title}
            </button>
          ))}
          {rangeIsValid && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', color: FOREST, font: `600 12px ${SANS}`, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyAvailable} onChange={event => setOnlyAvailable(event.target.checked)} />
              Show available rooms only
            </label>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: MOSS, font: `14px ${SANS}` }}>Gathering our rooms...</div>
        ) : sections.length === 0 ? (
          <div style={{ padding: '70px 0', textAlign: 'center', color: '#777363', font: `14px ${SANS}` }}>
            {rooms.length === 0 ? 'No rooms could be loaded right now. Please refresh the page.' : 'No rooms match those filters.'}
          </div>
        ) : (
          sections.map(section => (
            <section key={section.title} style={{ marginBottom: '56px' }}>
              <div style={{ marginBottom: '20px', maxWidth: '720px' }}>
                <h3 style={{ margin: '0 0 6px', color: FOREST, font: `500 26px ${SERIF}` }}>{section.title}</h3>
                {section.info.intro && <p style={{ margin: 0, color: '#6b6a5c', font: `13px/1.7 ${SANS}` }}>{section.info.intro}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {section.items.map(room => {
                  const badge = badgeFor(room);
                  return (
                    <article key={room.id} className="rooms-card">
                      <button type="button" className="rooms-card-photo" onClick={() => openRoom(room)} aria-label={`View ${room.title}`}>
                        <div style={{ height: '220px', position: 'relative', overflow: 'hidden' }}>
                          <img src={room.cover} alt={room.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(20,25,15,.66))' }} />
                          <span style={{ position: 'absolute', left: '16px', bottom: '16px', color: '#fff', font: `500 24px ${SERIF}` }}>{room.title}</span>
                          {badge && (
                            <span style={{ position: 'absolute', right: '14px', top: '14px', background: badge.bg, color: badge.color, padding: '6px 10px', borderRadius: '999px', font: `600 10px ${SANS}`, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                      </button>

                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>
                          {room.groupTitle}{room.capacity ? ` · ${room.capacity}` : ''}
                        </div>
                        <p style={{ color: '#6b6a5c', font: `12px/1.7 ${SANS}`, margin: '0 0 16px', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {room.description}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                          {room.amenities.slice(0, 3).map(amenity => (
                            <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '5px 8px', font: `10px ${SANS}`, borderRadius: '3px' }}>{amenity}</span>
                          ))}
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                          <button type="button" className="rooms-link" onClick={() => openRoom(room)} style={{ marginBottom: '14px' }}>View room details</button>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: '16px' }}>
                            <span style={{ color: INK, font: `600 20px ${SERIF}` }}>
                              {peso(room.price)}
                              <small style={{ color: '#8d8877', font: `10px ${SANS}` }}> / night</small>
                            </span>
                            <button type="button" disabled={bookDisabled(room)} onClick={() => bookRoom(room)} style={bookButtonStyle(room)}>
                              {bookLabel(room)}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Room detail dialog */}
      {selectedRoom && (
        <div className="rooms-modal-backdrop" onClick={() => setSelectedRoom(null)}>
          <div className="rooms-modal" role="dialog" aria-modal="true" aria-label={selectedRoom.title} onClick={event => event.stopPropagation()}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedRoom(null)}
              style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, width: '36px', height: '36px', borderRadius: '50%', border: 0, background: 'rgba(255,255,255,.92)', color: FOREST, font: `20px ${SANS}`, cursor: 'pointer' }}
            >×</button>

            <div style={{ height: 'clamp(220px, 40vw, 380px)', background: '#000' }}>
              <img src={selectedRoom.gallery[photoIndex] || selectedRoom.cover} alt={`${selectedRoom.title} photo ${photoIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {selectedRoom.gallery.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px 28px 0', overflowX: 'auto' }}>
                {selectedRoom.gallery.map((src, index) => (
                  <button key={src} type="button" aria-label={`Show photo ${index + 1}`} className={`rooms-thumb ${index === photoIndex ? 'active' : ''}`} onClick={() => setPhotoIndex(index)}>
                    <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}

            <div className="rooms-modal-body">
              <div>
                <div style={{ color: MOSS, font: `600 10px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>{selectedRoom.groupTitle}</div>
                <h3 style={{ margin: '0 0 12px', color: INK, font: `500 34px ${SERIF}` }}>{selectedRoom.title}</h3>
                <p style={{ margin: '0 0 20px', color: '#6b6a5c', font: `14px/1.8 ${SANS}` }}>{selectedRoom.description}</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedRoom.amenities.map(amenity => (
                    <span key={amenity} style={{ background: CREAM, color: FOREST, padding: '6px 10px', font: `11px ${SANS}`, borderRadius: '3px' }}>{amenity}</span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ color: INK, font: `600 30px ${SERIF}`, marginBottom: '4px' }}>
                  {peso(selectedRoom.price)}
                  <small style={{ color: '#8d8877', font: `12px ${SANS}` }}> / night</small>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0 22px', font: `13px ${SANS}` }}>
                  <tbody>
                    {[
                      ['Category', selectedRoom.groupTitle],
                      selectedRoom.capacity && ['Guests', selectedRoom.capacity],
                      selectedRoom.bedType && ['Bed type', selectedRoom.bedType],
                      selectedRoom.view && ['View', selectedRoom.view],
                      rangeIsValid && ['Your dates', `${checkIn} to ${checkOut}`],
                    ].filter(Boolean).map(([label, value]) => (
                      <tr key={label} style={{ borderTop: `1px solid ${LINE}` }}>
                        <th scope="row" style={{ textAlign: 'left', padding: '10px 0', color: '#777363', fontWeight: 600, width: '40%' }}>{label}</th>
                        <td style={{ padding: '10px 0', color: INK }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(() => {
                  const badge = badgeFor(selectedRoom);
                  return badge ? (
                    <div style={{ marginBottom: '14px', color: badge.color === CREAM ? FOREST : badge.color, font: `600 12px ${SANS}` }}>
                      {badge.label} for your dates
                    </div>
                  ) : null;
                })()}

                <button type="button" disabled={bookDisabled(selectedRoom)} onClick={() => bookRoom(selectedRoom)} style={{ ...bookButtonStyle(selectedRoom), width: '100%', padding: '14px 16px' }}>
                  {bookLabel(selectedRoom)}
                </button>
                {!rangeIsValid && (
                  <p style={{ margin: '12px 0 0', color: '#777363', font: `12px/1.6 ${SANS}` }}>
                    Choose your check-in and check-out dates to book this room.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}