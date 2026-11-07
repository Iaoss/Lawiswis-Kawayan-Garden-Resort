import { getSeasonalAdjustment } from './seasonalRates';
// Overnight check-in times. Check-in is flexible: a slot can still be booked
// for today until the next slot starts (cutoffMinutes). Guests arriving after
// 9:00 PM (walk-ins or late arrivals, even near midnight) book the late
// arrival slot, which adds a 10% surcharge on the room rate.
export const LATE_ARRIVAL_SLOT_ID = 'late';
export const LATE_ARRIVAL_SURCHARGE_RATE = 0.10;
export const OVERNIGHT_TIME_SLOTS = [
  // startMinutes: when check-in opens; cutoffMinutes: last time it can be booked for today.
  { id: 'morning', label: '10:00 AM / 11:00 AM check-in → 8:00 AM check-out', checkIn: '10:00 AM / 11:00 AM', checkOut: '8:00 AM', startMinutes: 10 * 60, cutoffMinutes: 14 * 60 },
  { id: 'afternoon', label: '2:00 PM / 3:00 PM check-in → 12:00 PM check-out', checkIn: '2:00 PM / 3:00 PM', checkOut: '12:00 PM', startMinutes: 14 * 60, cutoffMinutes: 18 * 60 },
  { id: 'evening', label: '6:00 PM / 7:00 PM check-in → 4:00 PM check-out', checkIn: '6:00 PM / 7:00 PM', checkOut: '4:00 PM', startMinutes: 18 * 60, cutoffMinutes: 21 * 60 },
  { id: LATE_ARRIVAL_SLOT_ID, label: 'Late arrival after 9:00 PM → 12:00 PM check-out (+10% room rate)', checkIn: 'After 9:00 PM', checkOut: '12:00 PM', startMinutes: 21 * 60, cutoffMinutes: 24 * 60, lateArrival: true },
];

export function isLateArrivalTime(checkInTime) {
  return checkInTime === OVERNIGHT_TIME_SLOTS.find(slot => slot.lateArrival).checkIn;
}

// Every rate already includes 12% VAT. Splits a VAT-inclusive amount into
// the net amount and the VAT: 3,000 = 2,678.57 net + 321.43 VAT.
export const VAT_RATE = 0.12;
export function getVatBreakdown(total) {
  const amount = Math.round(Number(total || 0) * 100) / 100;
  const net = Math.round((amount / (1 + VAT_RATE)) * 100) / 100;
  return { total: amount, net, vat: Math.round((amount - net) * 100) / 100 };
}

export const DAYTOUR_TIME_SLOT = {
  id: 'day',
  label: '8:00 AM check-in → 5:00 PM check-out',
  checkIn: '8:00 AM',
  checkOut: '5:00 PM',
  startMinutes: 8 * 60,
};

export const NIGHTTOUR_TIME_SLOT = {
  id: 'night',
  label: '5:00 PM check-in → 10:00 PM check-out',
  checkIn: '5:00 PM',
  checkOut: '10:00 PM',
  startMinutes: 17 * 60,
};

// The resort's local time zone. Server code runs in UTC, so same-day
// cutoffs are always checked against Philippine time.
export const RESORT_TIME_ZONE = 'Asia/Manila';

// Today's date (YYYY-MM-DD) and minutes past midnight at the resort.
export function getResortNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: RESORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// True when `date` is today at the resort and the slot can no longer be
// booked (its cutoff, or for tours its start time, has passed).
export function isCheckInPassed(date, slot, now = new Date()) {
  const resortNow = getResortNow(now);
  return Boolean(slot) && date === resortNow.dateKey && resortNow.minutes >= (slot.cutoffMinutes ?? slot.startMinutes);
}

// True when `date` is today at the resort and that tour's check-in time has passed.
export function isTourStartPassed(date, tourPeriod = 'day', now = new Date()) {
  return isCheckInPassed(date, tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT, now);
}

// True when every overnight check-in time for `date` has already passed.
export function areOvernightCheckInsClosed(date, now = new Date()) {
  return OVERNIGHT_TIME_SLOTS.every(slot => isCheckInPassed(date, slot, now));
}

// Error message when today's overnight check-in time has already passed, or ''.
export function getOvernightCutoffError(date, slotId, now = new Date()) {
  const slot = OVERNIGHT_TIME_SLOTS.find(item => item.id === slotId);
  if (!isCheckInPassed(date, slot, now)) return '';
  return areOvernightCheckInsClosed(date, now)
    ? "All of today's overnight check-in times have passed. Please choose another check-in date."
    : `Today's ${slot.checkIn} check-in can no longer be booked. Please choose a later check-in time.`;
}

// Error message when a same-day tour is booked after its check-in time, or ''.
export function getTourCutoffError(date, tourPeriod = 'day', now = new Date()) {
  if (!isTourStartPassed(date, tourPeriod, now)) return '';
  return tourPeriod === 'night'
    ? `Today's night tour started at ${NIGHTTOUR_TIME_SLOT.checkIn}, so it can no longer be booked. Please choose another date.`
    : `Today's day tour started at ${DAYTOUR_TIME_SLOT.checkIn}, so it can no longer be booked. Please choose another date or the night swimming tour.`;
}

// Walk-ins: a guest who arrives after the day tour has started (say 9 AM)
// can still book it until the tour ends at 5 PM. Check-out stays at 5 PM.
// The night tour keeps its normal rule.
export function getWalkInTourCutoffError(date, tourPeriod = 'day', now = new Date()) {
  if (tourPeriod === 'night') return getTourCutoffError(date, 'night', now);
  const resortNow = getResortNow(now);
  if (date === resortNow.dateKey && resortNow.minutes >= 17 * 60) {
    return "Today's day tour has ended (check-out is 5:00 PM). Choose the night tour or another date.";
  }
  return '';
}
export const isWalkInTourClosed = (date, tourPeriod, now = new Date()) => Boolean(getWalkInTourCutoffError(date, tourPeriod, now));

// "9:12 AM" in resort time, for recording when a walk-in actually arrived.
export function formatResortClock(now = new Date()) {
  const { minutes } = getResortNow(now);
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Cottages ───────────────────────────────────────────────────────────
// The cottage list is set by an admin (Settings → Resort Status → Cottages)
// and saved in settings/cottageTypes as
//   { cottages: [{ id, name, maxGuests, price, archived? }] }
// These defaults are used until then. The server (api/[...route].js) and the
// browser (useCottageCatalog) load the saved list and call
// applyCottageCatalog(), which updates COTTAGE_OPTIONS and COTTAGE_IDS in
// place, so every page and price check uses the same list.
// Removed cottages are kept as "archived": they can't be booked any more,
// but old bookings keep their name and price.
export const DEFAULT_COTTAGES = [
  { id: 'umbrella-hut', name: 'Umbrella Hut', maxGuests: 6, price: 500 },
  { id: 'garden-cabana', name: 'Garden Cabana', maxGuests: 10, price: 1000 },
  { id: 'poolside-cabana', name: 'Poolside Cabana', maxGuests: 10, price: 1500 },
  { id: 'pavilion', name: 'Pavilion', maxGuests: 20, price: 3000 },
];
const NO_COTTAGE = { id: '', label: 'No cottage', price: 0, maxGuests: 0 };
const cottageOption = c => ({ id: c.id, name: c.name, label: `${c.name} (up to ${c.maxGuests} guests)`, price: c.price, maxGuests: c.maxGuests });

export const COTTAGE_OPTIONS = [NO_COTTAGE, ...DEFAULT_COTTAGES.map(cottageOption)];
export const COTTAGE_IDS = DEFAULT_COTTAGES.map(c => c.id);
const ARCHIVED_COTTAGES = {};
let cottageCatalogVersion = 0;
export const getCottageCatalogVersion = () => cottageCatalogVersion;

const COTTAGE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
// Cleans a saved list: valid ids, names, sizes and prices only.
export function normalizeCottageCatalog(doc) {
  const list = Array.isArray(doc?.cottages) ? doc.cottages : null;
  if (!list) return null;
  const seen = new Set();
  return list
    .map(c => ({
      id: String(c?.id || ''),
      name: String(c?.name || '').trim().slice(0, 40),
      maxGuests: Math.round(Number(c?.maxGuests)),
      price: Math.round(Number(c?.price) * 100) / 100,
      archived: c?.archived === true,
    }))
    .filter(c => COTTAGE_ID.test(c.id) && !seen.has(c.id) && seen.add(c.id) && c.name.length >= 2
      && Number.isInteger(c.maxGuests) && c.maxGuests >= 1 && c.maxGuests <= 200
      && Number.isFinite(c.price) && c.price > 0 && c.price <= 100000);
}

export function getCottageCatalogError(cottage, others = []) {
  const name = String(cottage.name || '').trim();
  if (name.length < 2) return 'Give the cottage a name (at least 2 letters).';
  if (others.some(o => o.id !== cottage.id && !o.archived && o.name.trim().toLowerCase() === name.toLowerCase())) return 'Another cottage already has that name.';
  const guests = Number(cottage.maxGuests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 200) return 'Enter how many guests it fits (1 to 200).';
  const price = Number(cottage.price);
  if (!Number.isFinite(price) || price <= 0 || price > 100000) return 'Enter a price from ₱1 to ₱100,000.';
  return '';
}

// Uses a saved list (from settings/cottageTypes). null keeps the defaults.
export function applyCottageCatalog(doc) {
  const list = normalizeCottageCatalog(doc);
  if (!list) return false;
  const active = list.filter(c => !c.archived);
  COTTAGE_OPTIONS.splice(0, COTTAGE_OPTIONS.length, NO_COTTAGE, ...active.map(cottageOption));
  COTTAGE_IDS.splice(0, COTTAGE_IDS.length, ...active.map(c => c.id));
  Object.keys(ARCHIVED_COTTAGES).forEach(id => { delete ARCHIVED_COTTAGES[id]; });
  list.filter(c => c.archived).forEach(c => { ARCHIVED_COTTAGES[c.id] = cottageOption(c); });
  cottageCatalogVersion += 1;
  return true;
}

// Rates saved on bookings made before the cottage list changed. They're only
// accepted when repricing those existing bookings (e.g. a date change).
const LEGACY_COTTAGE_RATES = {
  'umbrella-hut': [1000],
  daybed: [1000],
  cabana: [1000, 1500],
};
const LEGACY_COTTAGE_LABELS = {
  daybed: 'Daybed (up to 6 guests)',
  cabana: 'Cabana (up to 10 guests)',
};

// Older cottage ids, counted as the cottage that replaced them when
// working out how many are still free.
export const LEGACY_COTTAGE_IDS = { daybed: 'umbrella-hut', cabana: 'poolside-cabana' };

// Looks up the fee for the cottage the guest picked, or null if it isn't on
// the list. The browser only ever sends the cottage id, never the price.
export function getCottageFee(cottageId) {
  const option = COTTAGE_OPTIONS.find(item => item.id === (cottageId || ''));
  return option ? option.price : null;
}

export function getCottageLabel(cottageId) {
  return COTTAGE_OPTIONS.find(item => item.id === cottageId)?.label || ARCHIVED_COTTAGES[cottageId]?.label
    || LEGACY_COTTAGE_LABELS[cottageId] || 'Cottage';
}

// Resort rate card. `daytour` is the room rate for both day tours and night
// tours; extra guests pay the swimming rate per person on top.
const ROOM_RATES = {
  couple: { baseCapacity: 2, daytour: 2000, overnight: 3000 },
  familyRoom4: { baseCapacity: 4, daytour: 3600, overnight: 4600 },
  familyRoom6: { baseCapacity: 6, daytour: 5200, overnight: 6200 },
  familySuite4: { baseCapacity: 4, daytour: 4100, overnight: 5600 },
  familySuite6: { baseCapacity: 6, daytour: 5700, overnight: 7200 },
  hiwagaSuite4: { baseCapacity: 4, daytour: 6500, overnight: 8000 },
  paraisoSuite8: { baseCapacity: 8, daytour: 10000, overnight: 12000 },
  halimuyakSuite8: { baseCapacity: 8, daytour: 10000, overnight: 12000 },
  mainVilla20: { baseCapacity: 20, daytour: 18500, overnight: 24500 },
};

const normalizeText = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const MAX_STAY_NIGHTS = 30;
const MIN_STAY_YEAR = 2000;
const MAX_STAY_YEAR = 2100;

const toDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// A single-day booking (day tour) uses the same date for check-in and check-out.
export function isSingleDayStay(checkIn, checkOut) {
  return Boolean(checkIn) && checkIn === checkOut;
}

// Number of billable days/nights. A single-day stay counts as one day.
export function getStayUnits(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const days = Math.round((end - start) / 86400000);
  if (days < 0) return 0;
  return days === 0 ? 1 : days;
}

// Exclusive end date used for overlap checks. A single-day stay occupies its
// whole date, so it blocks until the next day.
export function getOccupiedEndDate(checkIn, checkOut) {
  if (!isSingleDayStay(checkIn, checkOut)) return checkOut;
  const start = new Date(`${checkIn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return checkOut;
  start.setDate(start.getDate() + 1);
  return toDateKey(start);
}

// True when two stays share at least one occupied day. Dates are YYYY-MM-DD.
export function stayRangesOverlap(aCheckIn, aCheckOut, bCheckIn, bCheckOut) {
  return aCheckIn < getOccupiedEndDate(bCheckIn, bCheckOut)
    && getOccupiedEndDate(aCheckIn, aCheckOut) > bCheckIn;
}

// Returns an error message for an invalid or overlong stay, or '' when valid.
// Pass { allowSingleDay: true } to accept the same check-in and check-out date.
export function getStayDurationError(checkIn, checkOut, { allowSingleDay = false } = {}) {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (!checkIn || !checkOut || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Please select a valid check-in and check-out date.';
  }
  if (start.getFullYear() < MIN_STAY_YEAR || end.getFullYear() > MAX_STAY_YEAR) {
    return 'Please select dates within a valid year range.';
  }
  const nights = Math.round((end - start) / 86400000);
  if (nights === 0 && allowSingleDay) return '';
  if (nights < 0) return 'Check-out cannot be before check-in.';
  if (nights === 0) return 'Check-out must be after check-in.';
  if (nights > MAX_STAY_NIGHTS) return `A stay cannot exceed ${MAX_STAY_NIGHTS} consecutive nights.`;
  return '';
}

export function isCoupleRoom(room) {
  if (!room) return false;
  return ['type', 'name', 'roomNumber', 'description', 'category']
    .some(key => normalizeText(room[key]).includes('couple'))
    || normalizeText(room.type) === 'deluxe';
}

export function getRoomMaximumGuests(room) {
  return getRoomCapacityPolicy(room)?.maxGuests ?? null;
}

const getConfiguredLimit = (room, keys) => {
  const limit = Number(keys.map(key => room?.[key]).find(value => value !== undefined && value !== ''));
  return Number.isInteger(limit) && limit >= 0 ? limit : null;
};

const getDescribedCapacity = room => {
  const roomText = [room?.name, room?.roomNumber, room?.type, room?.description, room?.capacity, room?.baseCapacity].join(' ');
  const match = roomText.match(/(?:up\s*to|for)\s*(\d+)/i);
  return [room?.baseCapacity, room?.capacity, match?.[1]]
    .map(Number)
    .find(capacity => Number.isInteger(capacity) && capacity > 0) ?? null;
};

export function getRoomCapacityPolicy(room) {
  if (!room) return null;

  const text = [room.type, room.name, room.roomNumber, room.description, room.category]
    .map(normalizeText)
    .join(' ');
  const configuredMaxGuests = getConfiguredLimit(room, ['maxCapacity', 'maximumCapacity', 'maxGuests']);
  const configuredMaxAdults = getConfiguredLimit(room, ['maxAdults', 'maximumAdults']);
  const configuredMaxChildren = getConfiguredLimit(room, ['maxChildren', 'maximumChildren']);
  const describedCapacity = getDescribedCapacity(room);
  let defaults;

  // Couple rooms that can take an extra bed (e.g. "Option to add bed"):
  // a third adult on the extra bed, plus one child.
  const extraBed = text.includes('extrabed') || text.includes('addbed') || text.includes('addabed');
  if (extraBed && (text.includes('couple') || isCoupleRoom(room))) {
    defaults = { maxAdults: 3, maxChildren: 1, maxGuests: 4, label: 'Couple Room with Extra Bed' };
  } else if (isCoupleRoom(room)) {
    defaults = { maxAdults: 2, maxChildren: 1, maxGuests: 3, label: 'Couple Room' };
  } else if (text.includes('mainvilla')) {
    defaults = { maxAdults: 20, maxChildren: 20, maxGuests: describedCapacity || 20, label: 'Main Villa' };
  } else if (text.includes('presidential')) {
    defaults = { maxAdults: describedCapacity || 8, maxChildren: describedCapacity || 8, maxGuests: describedCapacity || 8, label: 'Presidential Suite' };
  } else if (text.includes('familysuite')) {
    defaults = { maxAdults: describedCapacity || 6, maxChildren: describedCapacity || 6, maxGuests: describedCapacity || 6, label: 'Family Suite' };
  } else if (text.includes('juniorsuite')) {
    defaults = { maxAdults: 4, maxChildren: 4, maxGuests: 4, label: 'Junior Suite' };
  } else if (text.includes('familyroom')) {
    const maximum = describedCapacity || 4;
    defaults = { maxAdults: maximum, maxChildren: maximum, maxGuests: maximum, label: `Family Room for ${maximum}` };
  } else if (text.includes('standard') && (configuredMaxGuests || describedCapacity || 2) <= 2) {
    // Standard rooms are the resort's 2-guest couple rooms (no extra bed).
    defaults = { maxAdults: 2, maxChildren: 1, maxGuests: 2, label: 'Couple Room' };
  } else {
    const maximum = configuredMaxGuests || describedCapacity;
    if (!maximum) return null;
    defaults = { maxAdults: maximum, maxChildren: maximum, maxGuests: maximum, label: 'Selected room' };
  }

  return {
    ...defaults,
    maxAdults: configuredMaxAdults ?? defaults.maxAdults,
    maxChildren: configuredMaxChildren ?? defaults.maxChildren,
    maxGuests: configuredMaxGuests ?? defaults.maxGuests,
  };
}

// Who a room is for, in words guests understand: "2 adults + 1 child" for a
// couple room that also takes a child, otherwise "Up to 4 guests".
export function describeRoomCapacity(policy) {
  if (!policy || !policy.maxGuests) return '';
  const extraChildren = Math.min(policy.maxChildren || 0, policy.maxGuests - (policy.maxAdults || policy.maxGuests));
  if (policy.maxAdults && extraChildren > 0) {
    return `${policy.maxAdults} adult${policy.maxAdults === 1 ? '' : 's'} + ${extraChildren} child${extraChildren === 1 ? '' : 'ren'}`;
  }
  return `Up to ${policy.maxGuests} guest${policy.maxGuests === 1 ? '' : 's'}`;
}

export function getGuestCountViolation(room, adults, children) {
  const policy = getRoomCapacityPolicy(room);
  if (!policy) return null;
  if (adults > policy.maxAdults) {
    return `${policy.label} accommodates a maximum of ${policy.maxAdults} adult${policy.maxAdults === 1 ? '' : 's'}.`;
  }
  if (children > policy.maxChildren) {
    return `${policy.label} accommodates a maximum of ${policy.maxChildren} child${policy.maxChildren === 1 ? '' : 'ren'}.`;
  }
  if (adults + children > policy.maxGuests) {
    return `${policy.label} accommodates a maximum of ${policy.maxGuests} guests.`;
  }
  return null;
}

function getRoomRate(room = {}) {
  const roomText = [
    room.rateKey,
    room.type,
    room.name,
    room.roomNumber,
    room.description,
    room.capacity,
  ].join(' ');
  const description = normalizeText(roomText);
  const explicitCapacity = Number(room.baseCapacity || room.capacity);
  const describedCapacity = Number(roomText.match(/(?:up\s*to|for)\s*(\d+)/i)?.[1]) || 0;
  const capacity = explicitCapacity || describedCapacity;

  if (description.includes('hiwaga')) return ROOM_RATES.hiwagaSuite4;
  if (description.includes('paraiso')) return ROOM_RATES.paraisoSuite8;
  if (description.includes('halimuyak')) return ROOM_RATES.halimuyakSuite8;
  if (description.includes('mainvilla')) return ROOM_RATES.mainVilla20;
  if (description.includes('couple') || description.includes('deluxe')) return ROOM_RATES.couple;
  if (description.includes('familysuite')) {
    return capacity === 6 || description.includes('for6') ? ROOM_RATES.familySuite6 : ROOM_RATES.familySuite4;
  }
  if (description.includes('familyroom')) {
    return capacity === 6 || description.includes('for6') ? ROOM_RATES.familyRoom6 : ROOM_RATES.familyRoom4;
  }
  if (description.includes('presidentialsuite') || description.includes('paraiso') || description.includes('halimuyak')) {
    return ROOM_RATES.paraisoSuite8;
  }
  if (description.includes('juniorsuite')) return ROOM_RATES.hiwagaSuite4;

  return null;
}

export function getRoomBaseRate(room, bookingType) {
  const rate = getRoomRate(room);
  if (rate) return { amount: rate[bookingType], baseCapacity: rate.baseCapacity };

  const price = Number(room?.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('The selected room does not have a valid booking rate.');
  }
  const capacity = Number(room?.baseCapacity || room?.capacity);
  return {
    amount: price,
    baseCapacity: Number.isInteger(capacity) && capacity > 0 ? capacity : 2,
  };
}

// Swimming rate per person for a day tour or night tour.
export function getSwimmingRate(tourPeriod = 'day') {
  return tourPeriod === 'night' ? { adult: 475, child: 375 } : { adult: 375, child: 275 };
}

// Day visitors: people who join an overnight booking for a day tour or night
// tour but don't sleep in the room (e.g. a friend visiting a couple). They
// pay the swimming rate once and don't count toward the room's capacity.
export const MAX_DAY_VISITORS = 10;

export function normalizeDayVisitors(input) {
  if (!input) return null;
  const adults = Number(input.adults || 0);
  const children = Number(input.children || 0);
  const tourPeriod = input.tourPeriod === 'night' ? 'night' : 'day';
  if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0
    || adults + children > MAX_DAY_VISITORS) {
    throw new Error(`Day visitors must be whole numbers, up to ${MAX_DAY_VISITORS} people.`);
  }
  if (input.tourPeriod && !['day', 'night'].includes(input.tourPeriod)) {
    throw new Error('Choose a day tour or night tour for the day visitors.');
  }
  return adults + children > 0 ? { adults, children, tourPeriod } : null;
}

// Day visitors saved on a booking, for repricing it later.
export function getReservationDayVisitors(reservation = {}) {
  const adults = Number(reservation.dayVisitorAdults || 0);
  const children = Number(reservation.dayVisitorChildren || 0);
  return adults + children > 0 ? { adults, children, tourPeriod: reservation.dayVisitorPeriod || 'day' } : null;
}

export function getDayVisitorCharge(dayVisitors) {
  if (!dayVisitors) return 0;
  const rate = getSwimmingRate(dayVisitors.tourPeriod);
  return dayVisitors.adults * rate.adult + dayVisitors.children * rate.child;
}

export function calculateBookingPrice({
  room,
  bookingType,
  nights,
  adults,
  children,
  tourPeriod = 'day',
  cottageId = '',
  cottageFee = 0,
  dayVisitors = null,
  lateArrival = false,
  // { periods, checkIn, checkOut }: holiday / peak-season prices (optional).
  season = null,
  // Repricing an existing booking: keep the cottage fee it was booked at,
  // even if the admin has since changed or removed that cottage.
  keepCottageFee = false,
}) {
  const { amount: baseRate, baseCapacity } = getRoomBaseRate(room, bookingType);
  const totalGuests = adults + children;
  const extraGuests = Math.max(0, totalGuests - baseCapacity);
  const adultsWithinCapacity = Math.min(adults, baseCapacity);
  const childrenWithinCapacity = Math.min(children, Math.max(0, baseCapacity - adultsWithinCapacity));
  const extraAdults = adults - adultsWithinCapacity;
  const extraChildren = children - childrenWithinCapacity;
  const extraRate = bookingType === 'overnight'
    ? { adult: 800, child: 400 }
    : getSwimmingRate(tourPeriod);
  const extraGuestCharge = (extraAdults * extraRate.adult + extraChildren * extraRate.child) * nights;
  const fee = Number(cottageFee);
  // Removed (archived) cottages and older rates are only accepted when an
  // existing booking is repriced; new bookings can't choose them.
  const validCottageFee = getCottageFee(cottageId) === fee
    || (keepCottageFee && Boolean(cottageId) && Number.isFinite(fee) && fee >= 0)
    || ARCHIVED_COTTAGES[cottageId]?.price === fee
    || Boolean(LEGACY_COTTAGE_RATES[cottageId]?.includes(fee));

  if (!Number.isInteger(nights) || nights < 1) throw new Error('Choose valid stay dates.');
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    throw new Error('Guest counts must be whole numbers.');
  }
  if (!validCottageFee) throw new Error('Choose a valid cottage rate.');
  // Day visitors only apply to overnight stays (on a tour, everyone is a visitor).
  const visitors = bookingType === 'overnight' ? normalizeDayVisitors(dayVisitors) : null;
  const dayVisitorCharge = getDayVisitorCharge(visitors);
  // Arriving after 9:00 PM: 10% on the room rate (once, for the arrival night).
  const lateArrivalSurcharge = bookingType === 'overnight' && lateArrival
    ? Math.round(baseRate * LATE_ARRIVAL_SURCHARGE_RATE * 100) / 100
    : 0;

  // Holiday / peak season: a percentage on the room charge for the nights
  // (or tour day) inside the period. Cottages and visitors aren't affected.
  const seasonal = season?.periods?.length
    ? getSeasonalAdjustment({ periods: season.periods, checkIn: season.checkIn, checkOut: season.checkOut, bookingType, roomCharge: baseRate * nights + extraGuestCharge })
    : { amount: 0, label: '' };

  return {
    baseRate,
    baseCapacity,
    totalGuests,
    extraGuests,
    extraAdults,
    extraChildren,
    extraAdultRate: extraRate.adult,
    extraChildRate: extraRate.child,
    extraGuestCharge,
    cottageId,
    cottageFee: fee,
    dayVisitorAdults: visitors?.adults || 0,
    dayVisitorChildren: visitors?.children || 0,
    dayVisitorPeriod: visitors?.tourPeriod || '',
    dayVisitorCharge,
    lateArrivalSurcharge,
    seasonalSurcharge: seasonal.amount,
    seasonalLabel: seasonal.label,
    subtotalAmount: Math.round((baseRate * nights + extraGuestCharge + fee + dayVisitorCharge + lateArrivalSurcharge + seasonal.amount) * 100) / 100,
  };
}

// ── Cottage-only day / night tours ─────────────────────────────────────
// Tour guests may book just a cottage (no room). They pay the swimming
// entrance per person plus the cottage. The group must fit the cottage.
export const cottageName = cottage => String(cottage?.label || 'Cottage').replace(/\s*\(.*\)$/, '');

export function calculateCottageTourPrice({ adults, children = 0, tourPeriod = 'day', cottageId }) {
  const cottage = COTTAGE_OPTIONS.find(option => option.id && option.id === cottageId);
  if (!cottage) throw new Error('Choose a cottage for your day or night tour.');
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    throw new Error('Guest counts must be whole numbers, with at least one adult.');
  }
  if (adults + children > cottage.maxGuests) {
    throw new Error(`A ${cottageName(cottage)} seats up to ${cottage.maxGuests} guests. Choose a bigger cottage.`);
  }
  const rate = getSwimmingRate(tourPeriod);
  const entranceFee = adults * rate.adult + children * rate.child;
  return {
    cottageId,
    cottageLabel: cottageName(cottage),
    cottageFee: cottage.price,
    cottageMaxGuests: cottage.maxGuests,
    entranceAdultRate: rate.adult,
    entranceChildRate: rate.child,
    entranceFee,
    totalGuests: adults + children,
    subtotalAmount: entranceFee + cottage.price,
  };
}
