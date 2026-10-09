export const OVERNIGHT_TIME_SLOTS = [
  { id: 'morning', label: '10:00 AM / 11:00 AM check-in → 8:00 AM check-out', checkIn: '10:00 AM / 11:00 AM', checkOut: '8:00 AM' },
  { id: 'afternoon', label: '2:00 PM / 3:00 PM check-in → 12:00 PM check-out', checkIn: '2:00 PM / 3:00 PM', checkOut: '12:00 PM' },
  { id: 'evening', label: '6:00 PM / 7:00 PM check-in → 4:00 PM check-out', checkIn: '6:00 PM / 7:00 PM', checkOut: '4:00 PM' },
];

export const DAYTOUR_TIME_SLOT = {
  id: 'day',
  label: '8:00 AM check-in → 5:00 PM check-out',
  checkIn: '8:00 AM',
  checkOut: '5:00 PM',
};

export const NIGHTTOUR_TIME_SLOT = {
  id: 'night',
  label: '5:00 PM check-in → 10:00 PM / 12:00 MN check-out',
  checkIn: '5:00 PM',
  checkOut: '10:00 PM / 12:00 MN',
};

export const COTTAGE_OPTIONS = [
  { id: '', label: 'No cottage', prices: [0] },
  { id: 'umbrella-hut', label: 'Umbrella Hut / Daybed (up to 6 guests)', prices: [500, 1000] },
  { id: 'cabana', label: 'Garden / Poolside Cabana (up to 10 guests)', prices: [1000, 1500] },
  { id: 'pavilion', label: 'Pavilion (up to 20 guests)', prices: [3000] },
];

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
  const cottage = COTTAGE_OPTIONS.find(option => option.id === cottageId);
  const fee = Number(cottageFee);

  if (!Number.isInteger(nights) || nights < 1) throw new Error('Choose valid stay dates.');
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    throw new Error('Guest counts must be whole numbers.');
  }
  if (!cottage || !cottage.prices.includes(fee)) throw new Error('Choose a valid cottage rate.');

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
