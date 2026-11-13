import { calculateBookingPrice, getGuestCountViolation, getRoomBaseRate, getRoomCapacityPolicy, getRoomMaximumGuests, areOvernightCheckInsClosed, getCottageFee, getOccupiedEndDate, getOvernightCutoffError, getResortNow, getStayDurationError, getTourCutoffError, isTourStartPassed, getStayUnits, isCoupleRoom, isSingleDayStay, stayRangesOverlap } from './bookingPricing';
import { isPreferredContactMethod, PREFERRED_CONTACT_METHODS } from './preferredContactMethods';

describe('stay duration guardrails', () => {
  it('accepts stays up to 30 nights', () => {
    expect(getStayDurationError('2026-01-01', '2026-01-31')).toBe('');
  });
  it('rejects stays over 30 nights, absurd years, and inverted dates', () => {
    expect(getStayDurationError('2026-01-01', '2026-02-01')).toMatch(/30/);
    expect(getStayDurationError('2026-01-01', '2226-01-01')).not.toBe('');
    expect(getStayDurationError('2026-01-05', '2026-01-05')).not.toBe('');
    expect(getStayDurationError('', '2026-01-05')).not.toBe('');
  });
});

describe('single-day stays', () => {
  it('accepts the same check-in and check-out date only when allowed', () => {
    expect(getStayDurationError('2026-01-05', '2026-01-05', { allowSingleDay: true })).toBe('');
    expect(getStayDurationError('2026-01-06', '2026-01-05', { allowSingleDay: true })).not.toBe('');
    expect(isSingleDayStay('2026-01-05', '2026-01-05')).toBe(true);
    expect(isSingleDayStay('2026-01-05', '2026-01-06')).toBe(false);
  });
  it('bills a single-day stay as one day', () => {
    expect(getStayUnits('2026-01-05', '2026-01-05')).toBe(1);
    expect(getStayUnits('2026-01-05', '2026-01-08')).toBe(3);
    expect(getStayUnits('2026-01-08', '2026-01-05')).toBe(0);
  });
  it('treats a single-day stay as occupying its whole date', () => {
    expect(getOccupiedEndDate('2026-01-31', '2026-01-31')).toBe('2026-02-01');
    expect(stayRangesOverlap('2026-01-05', '2026-01-05', '2026-01-04', '2026-01-06')).toBe(true);
    expect(stayRangesOverlap('2026-01-05', '2026-01-05', '2026-01-05', '2026-01-05')).toBe(true);
    expect(stayRangesOverlap('2026-01-05', '2026-01-05', '2026-01-03', '2026-01-05')).toBe(false);
    expect(stayRangesOverlap('2026-01-05', '2026-01-05', '2026-01-06', '2026-01-07')).toBe(false);
  });
});

describe('same-day tour cutoff (Philippine time)', () => {
  // 2026-10-24 12:35 PM in Manila is 04:35 UTC.
  const lunchtime = new Date('2026-10-24T04:35:00Z');
  it('blocks today\'s day tour after 8:00 AM but allows the night tour', () => {
    expect(getResortNow(lunchtime)).toEqual({ dateKey: '2026-10-24', minutes: 12 * 60 + 35 });
    expect(isTourStartPassed('2026-10-24', 'day', lunchtime)).toBe(true);
    expect(getTourCutoffError('2026-10-24', 'day', lunchtime)).toMatch(/8:00 AM/);
    expect(getTourCutoffError('2026-10-24', 'night', lunchtime)).toBe('');
    expect(getTourCutoffError('2026-10-25', 'day', lunchtime)).toBe('');
  });
  it('allows today\'s day tour before 8:00 AM and blocks the night tour after 5:00 PM', () => {
    expect(getTourCutoffError('2026-10-24', 'day', new Date('2026-10-23T23:59:00Z'))).toBe('');
    expect(getTourCutoffError('2026-10-24', 'night', new Date('2026-10-24T09:00:00Z'))).toMatch(/5:00 PM/);
  });
});

describe('same-day overnight cutoff (Philippine time)', () => {
  const lunchtime = new Date('2026-10-24T04:35:00Z'); // 12:35 PM in Manila
  it('keeps a check-in time open until the next one starts (flexible check-in)', () => {
    const afterTwo = new Date('2026-10-24T06:35:00Z'); // 2:35 PM in Manila
    expect(getOvernightCutoffError('2026-10-24', 'morning', lunchtime)).toBe('');
    expect(getOvernightCutoffError('2026-10-24', 'morning', afterTwo)).toMatch(/11:00 AM/);
    expect(getOvernightCutoffError('2026-10-24', 'afternoon', afterTwo)).toBe('');
    expect(getOvernightCutoffError('2026-10-25', 'morning', afterTwo)).toBe('');
  });
  it('still takes late arrivals after 9 PM, so today never fully closes', () => {
    const night = new Date('2026-10-24T13:30:00Z'); // 9:30 PM in Manila
    expect(areOvernightCheckInsClosed('2026-10-24', night)).toBe(false);
    expect(getOvernightCutoffError('2026-10-24', 'evening', night)).toMatch(/later check-in time/);
    expect(getOvernightCutoffError('2026-10-24', 'late', night)).toBe('');
  });
});

describe('cottage selection', () => {
  it('uses the cottage rates', () => {
    expect(getCottageFee('')).toBe(0);
    expect(getCottageFee('umbrella-hut')).toBe(500);
    expect(getCottageFee('garden-cabana')).toBe(1000);
    expect(getCottageFee('poolside-cabana')).toBe(1500);
    expect(getCottageFee('pavilion')).toBe(3000);
    expect(getCottageFee('daybed')).toBeNull();
    expect(getCottageFee('bogus')).toBeNull();
  });
  it('still reprices bookings saved with the old cottages', () => {
    const base = { room: { name: 'Couple Room' }, bookingType: 'overnight', nights: 1, adults: 2, children: 0 };
    expect(calculateBookingPrice({ ...base, cottageId: 'daybed', cottageFee: 1000 }).cottageFee).toBe(1000);
    expect(calculateBookingPrice({ ...base, cottageId: 'cabana', cottageFee: 1500 }).cottageFee).toBe(1500);
    expect(() => calculateBookingPrice({ ...base, cottageId: 'pavilion', cottageFee: 500 })).toThrow();
  });
});

describe('couple room occupancy', () => {
  test('caps a standard couple room at two adults and one child', () => {
    expect(isCoupleRoom({ type: 'Deluxe' })).toBe(true);
    expect(isCoupleRoom({ name: 'Couple Room' })).toBe(true);
    expect(getRoomMaximumGuests({ name: 'Couple Room' })).toBe(3);
    expect(getGuestCountViolation({ name: 'Couple Room' }, 3, 0)).toContain('maximum of 2 adults');
    expect(getGuestCountViolation({ name: 'Couple Room' }, 2, 2)).toContain('maximum of 1 child');
  });

  test('uses per-room defaults and configured capacity limits', () => {
    expect(isCoupleRoom({ name: 'Family Suite for 6' })).toBe(false);
    expect(getRoomMaximumGuests({ name: 'Family Suite for 6' })).toBe(6);
    expect(getRoomMaximumGuests({ name: 'Family Suite', maxGuests: 6 })).toBe(6);
    expect(getRoomCapacityPolicy({ name: 'Couple Room with Extra Bed' })).toMatchObject({
      maxAdults: 3, maxChildren: 1, maxGuests: 3,
    });
    expect(getGuestCountViolation({ type: 'FamilyRoom', baseCapacity: 4 }, 4, 1)).toContain('maximum of 4 guests');
    expect(getGuestCountViolation({ type: 'MainVilla', maxGuests: 25 }, 20, 6)).toContain('maximum of 25 guests');
  });
});

describe('preferred contact method', () => {
  test('accepts only the listed methods', () => {
    PREFERRED_CONTACT_METHODS.forEach(method => expect(isPreferredContactMethod(method)).toBe(true));
    expect(isPreferredContactMethod('Fax')).toBe(false);
    expect(isPreferredContactMethod('')).toBe(false);
  });
});

describe('booking pricing', () => {
  it('uses the configured daytour and overnight room rates', () => {
    const coupleRoom = { type: 'Deluxe', price: 3000 };

    expect(getRoomBaseRate(coupleRoom, 'daytour')).toEqual({ amount: 2000, baseCapacity: 2 });
    expect(getRoomBaseRate(coupleRoom, 'overnight')).toEqual({ amount: 3000, baseCapacity: 2 });
  });

  it.each([
    [{ type: 'FamilyRoom', baseCapacity: 4 }, 3600, 4600, 4],
    [{ type: 'FamilyRoom', baseCapacity: 6 }, 5200, 6200, 6],
    [{ type: 'FamilySuite', baseCapacity: 4 }, 4600, 5600, 4],
    [{ type: 'FamilySuite', baseCapacity: 6 }, 6200, 7200, 6],
    [{ type: 'JuniorSuite4' }, 6500, 8000, 4],
    [{ name: 'Paraiso Suite for 12', type: 'PresidentialSuite' }, 10000, 12000, 12],
    [{ name: 'Halimuyak Suite for 8', type: 'PresidentialSuite' }, 10000, 12000, 8],
    [{ name: 'Main Villa for 25', type: 'MainVilla' }, 16500, 22000, 25],
  ])('configures %o at both stay rates', (room, daytour, overnight, capacity) => {
    expect(getRoomBaseRate(room, 'daytour')).toEqual({ amount: daytour, baseCapacity: capacity });
    expect(getRoomBaseRate(room, 'overnight')).toEqual({ amount: overnight, baseCapacity: capacity });
  });

  it('charges adult and child overnight extras per night and adds cottage fees', () => {
    expect(calculateBookingPrice({
      room: { type: 'FamilyRoom', baseCapacity: 4, price: 4600 },
      bookingType: 'overnight',
      nights: 2,
      adults: 5,
      children: 1,
      cottageId: 'umbrella-hut',
      cottageFee: 500,
    })).toMatchObject({
      baseRate: 4600,
      baseCapacity: 4,
      totalGuests: 6,
      extraGuests: 2,
      extraAdults: 1,
      extraChildren: 1,
      extraAdultRate: 800,
      extraChildRate: 800,
      extraGuestCharge: 3200,
      cottageFee: 500,
      subtotalAmount: 12900,
    });
  });

  it('uses child and adult night-swimming rates for daytour extra guests', () => {
    expect(calculateBookingPrice({
      room: { name: 'Hiwaga', type: 'JuniorSuite4', price: 8000 },
      bookingType: 'daytour',
      nights: 1,
      adults: 4,
      children: 2,
      tourPeriod: 'night',
    })).toMatchObject({
      baseRate: 6500,
      baseCapacity: 4,
      extraGuests: 2,
      extraGuestCharge: 950,
      subtotalAmount: 7450,
    });
  });

  it('adds a ₱350 meal per extra guest on tours only, when chosen', () => {
    const tour = { room: { name: 'Hiwaga', type: 'JuniorSuite4', price: 8000 }, bookingType: 'daytour', nights: 1, adults: 4, children: 2, tourPeriod: 'night' };
    expect(calculateBookingPrice(tour)).toMatchObject({ extraGuestMeal: false, extraMealGuests: 0, extraMealCharge: 0, subtotalAmount: 7450 });
    expect(calculateBookingPrice({ ...tour, extraGuestMeal: true })).toMatchObject({ extraGuestMeal: true, extraMealGuests: 2, extraMealCharge: 700, subtotalAmount: 8150 });
    // No extra guests: nothing to add.
    expect(calculateBookingPrice({ ...tour, adults: 4, children: 0, extraGuestMeal: true })).toMatchObject({ extraMealGuests: 0, extraMealCharge: 0 });
    // Overnight extra guests already get breakfast in the ₱800.
    expect(calculateBookingPrice({ ...tour, bookingType: 'overnight', extraGuestMeal: true })).toMatchObject({ extraMealCharge: 0 });
  });

  it('multiplies daytour extra-adult and extra-child charges by the number of booked days', () => {
    expect(calculateBookingPrice({
      room: { name: 'Couple Room', price: 3000 },
      bookingType: 'daytour',
      nights: 2,
      adults: 3,
      children: 1,
      tourPeriod: 'day',
    })).toMatchObject({
      extraAdults: 1,
      extraChildren: 1,
      extraAdultRate: 375,
      extraChildRate: 375,
      extraGuestCharge: 1500,
      subtotalAmount: 5500,
    });
  });

  it('rejects cottage fees that do not match the selected cottage', () => {
    expect(() => calculateBookingPrice({
      room: { type: 'Deluxe', price: 3000 },
      bookingType: 'overnight',
      nights: 1,
      adults: 2,
      children: 0,
      cottageId: 'pavilion',
      cottageFee: 1000,
    })).toThrow('Choose a valid cottage rate.');
  });
});

describe('room capacity wording', () => {
  const { describeRoomCapacity } = require('./bookingPricing');
  test('couple rooms read "2 adults + 1 child", others "Up to N guests"', () => {
    expect(describeRoomCapacity({ maxAdults: 2, maxChildren: 1, maxGuests: 3 })).toBe('2 adults + 1 child');
    expect(describeRoomCapacity({ maxAdults: 2, maxChildren: 1, maxGuests: 2 })).toBe('Up to 2 guests');
    expect(describeRoomCapacity({ maxAdults: 6, maxChildren: 6, maxGuests: 6 })).toBe('Up to 6 guests');
    expect(describeRoomCapacity({ maxAdults: 3, maxChildren: 1, maxGuests: 4 })).toBe('3 adults + 1 child');
    expect(describeRoomCapacity(null)).toBe('');
  });
});
