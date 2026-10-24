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
  it('blocks check-in times that have passed today', () => {
    expect(getOvernightCutoffError('2026-10-24', 'morning', lunchtime)).toMatch(/10:00 AM/);
    expect(getOvernightCutoffError('2026-10-24', 'afternoon', lunchtime)).toBe('');
    expect(getOvernightCutoffError('2026-10-25', 'morning', lunchtime)).toBe('');
  });
  it('closes today entirely after the last check-in time', () => {
    const evening = new Date('2026-10-24T10:30:00Z'); // 6:30 PM in Manila
    expect(areOvernightCheckInsClosed('2026-10-24', lunchtime)).toBe(false);
    expect(areOvernightCheckInsClosed('2026-10-24', evening)).toBe(true);
    expect(getOvernightCutoffError('2026-10-24', 'evening', evening)).toMatch(/All of today/);
  });
});

describe('cottage selection', () => {
  it('uses the published cottage rates', () => {
    expect(getCottageFee('')).toBe(0);
    expect(getCottageFee('umbrella-hut')).toBe(500);
    expect(getCottageFee('garden-cabana')).toBe(1000);
    expect(getCottageFee('poolside-cabana')).toBe(1500);
    expect(getCottageFee('pavilion')).toBe(3000);
    expect(getCottageFee('bogus')).toBeNull();
  });
  it('still reprices bookings saved with the old cabana rates', () => {
    const base = { room: { name: 'Couple Room' }, bookingType: 'overnight', nights: 1, adults: 2, children: 0 };
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
      maxAdults: 3, maxChildren: 1, maxGuests: 4,
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
    [{ name: 'Paraiso Suite for 8', type: 'PresidentialSuite' }, 10000, 12000, 8],
    [{ name: 'Halimuyak Suite for 8', type: 'PresidentialSuite' }, 10000, 12000, 8],
    [{ name: 'Main Villa for 20', type: 'MainVilla' }, 16500, 24500, 20],
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
      extraChildRate: 400,
      extraGuestCharge: 2400,
      cottageFee: 500,
      subtotalAmount: 12100,
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
      extraGuestCharge: 750,
      subtotalAmount: 7250,
    });
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
      extraChildRate: 275,
      extraGuestCharge: 1300,
      subtotalAmount: 5300,
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
