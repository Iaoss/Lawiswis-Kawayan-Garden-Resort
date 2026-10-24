export const OVERNIGHT_TIME_SLOTS = [
  // startMinutes: minutes after midnight when check-in opens (used for same-day cutoffs).
  { id: 'morning', label: '10:00 AM / 11:00 AM check-in → 8:00 AM check-out', checkIn: '10:00 AM / 11:00 AM', checkOut: '8:00 AM', startMinutes: 10 * 60 },
  { id: 'afternoon', label: '2:00 PM / 3:00 PM check-in → 12:00 PM check-out', checkIn: '2:00 PM / 3:00 PM', checkOut: '12:00 PM', startMinutes: 14 * 60 },
  { id: 'evening', label: '6:00 PM / 7:00 PM check-in → 4:00 PM check-out', checkIn: '6:00 PM / 7:00 PM', checkOut: '4:00 PM', startMinutes: 18 * 60 },
];

export const DAYTOUR_TIME_SLOT = {
  id: 'day',
  label: '8:00 AM check-in → 5:00 PM check-out',
  checkIn: '8:00 AM',
  checkOut: '5:00 PM',
  startMinutes: 8 * 60,
};

export const NIGHTTOUR_TIME_SLOT = {
  id: 'night',
  label: '5:00 PM check-in → 10:00 PM / 12:00 MN check-out',
  checkIn: '5:00 PM',
  checkOut: '10:00 PM / 12:00 MN',
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

// True when `date` is today at the resort and the slot's check-in time has passed.
export function isCheckInPassed(date, slot, now = new Date()) {
  const resortNow = getResortNow(now);
  return Boolean(slot) && date === resortNow.dateKey && resortNow.minutes >= slot.startMinutes;
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
    : `Today's ${slot.checkIn} check-in time has passed. Please choose a later check-in time.`;
}

// Error message when a same-day tour is booked after its check-in time, or ''.
export function getTourCutoffError(date, tourPeriod = 'day', now = new Date()) {
  if (!isTourStartPassed(date, tourPeriod, now)) return '';
  return tourPeriod === 'night'
    ? `Today's night tour started at ${NIGHTTOUR_TIME_SLOT.checkIn}, so it can no longer be booked. Please choose another date.`
    : `Today's day tour started at ${DAYTOUR_TIME_SLOT.checkIn}, so it can no longer be booked. Please choose another date or the night swimming tour.`;
}

export const COTTAGE_OPTIONS = [
  { id: '', label: 'No cottage', price: 0 },
  { id: 'umbrella-hut', label: 'Umbrella Hut (up to 6 guests)', price: 500 },
  { id: 'garden-cabana', label: 'Garden Cabana (up to 10 guests)', price: 1000 },
  { id: 'poolside-cabana', label: 'Poolside Cabana (up to 10 guests)', price: 1500 },
  { id: 'pavilion', label: 'Pavilion (up to 20 guests)', price: 3000 },
];

// Rates saved on bookings made before the cottage list changed. They're only
// accepted when repricing those existing bookings (e.g. a date change).
const LEGACY_COTTAGE_RATES = {
  'umbrella-hut': [1000],
  cabana: [1000, 1500],
};

// Looks up the fee for the cottage the guest picked, or null if it isn't on
// the list. The browser only ever sends the cottage id, never the price.
export function getCottageFee(cottageId) {
  const option = COTTAGE_OPTIONS.find(item => item.id === (cottageId || ''));
  return option ? option.price : null;
}

export function getCottageLabel(cottageId) {
  if (cottageId === 'cabana') return 'Garden / Poolside Cabana (up to 10 guests)';
  return COTTAGE_OPTIONS.find(item => item.id === cottageId)?.label || 'Cottage';
}

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

  if (text.includes('couple') && text.includes('extrabed')) {
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

export function calculateBookingPrice({
  room,
  bookingType,
  nights,
  adults,
  children,
  tourPeriod = 'day',
  cottageId = '',
  cottageFee = 0,
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
    : tourPeriod === 'night'
      ? { adult: 475, child: 375 }
      : { adult: 375, child: 275 };
  const extraGuestCharge = (extraAdults * extraRate.adult + extraChildren * extraRate.child) * nights;
  const fee = Number(cottageFee);
  const validCottageFee = getCottageFee(cottageId) === fee
    || Boolean(LEGACY_COTTAGE_RATES[cottageId]?.includes(fee));

  if (!Number.isInteger(nights) || nights < 1) throw new Error('Choose valid stay dates.');
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    throw new Error('Guest counts must be whole numbers.');
  }
  if (!validCottageFee) throw new Error('Choose a valid cottage rate.');

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
    subtotalAmount: baseRate * nights + extraGuestCharge + fee,
  };
}
