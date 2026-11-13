import {
  getUnannouncedOverstayCharge,
  getOverstay,
  getOverstayStats,
  getPeriodRange,
  getQuarterlyBreakdown,
  getReservationAverages,
  getScheduledCheckOutMs,
  getStatusTransitionError,
  hadOverstay,
  hasOutstandingBalance,
  manilaDateKey,
} from './reservationStatus';

describe('overstay detection (Philippine time)', () => {
  const stay = { status: 'checked-in', checkOut: '2026-10-24', checkOutTime: '12:00 PM' };

  test('reads the scheduled check-out in Manila time, not server time', () => {
    // 12:00 PM in Manila is 04:00 UTC.
    expect(new Date(getScheduledCheckOutMs(stay)).toISOString()).toBe('2026-10-24T04:00:00.000Z');
    expect(getScheduledCheckOutMs({ checkOut: '2026-10-24', checkOutTime: '10:00 PM / 12:00 MN' }))
      .toBe(Date.parse('2026-10-24T14:00:00Z'));
  });

  test('flags checked-in guests only after check-out time', () => {
    expect(getOverstay(stay, new Date('2026-10-24T03:59:00Z'))).toBeNull();
    expect(getOverstay(stay, new Date('2026-10-24T05:30:00Z'))).toMatchObject({ minutes: 90, label: '1h 30m' });
    expect(getOverstay({ ...stay, status: 'checked-out' }, new Date('2026-10-25T00:00:00Z'))).toBeNull();
    expect(getOverstay({ status: 'checked-in' }, new Date())).toBeNull();
  });

  test('recognises past overstays from any record kept on the booking', () => {
    expect(hadOverstay({})).toBe(false);
    expect(hadOverstay({ overstayMinutes: 45 })).toBe(true);
    expect(hadOverstay({ lateCheckoutChargeTotal: 500 })).toBe(true);
    expect(hadOverstay({ overstay: { flaggedAt: 'x' } })).toBe(true);
  });

  test('counts late fees in the outstanding balance', () => {
    expect(hasOutstandingBalance({ totalAmount: 3000, amountPaid: 3000 })).toBe(false);
    expect(hasOutstandingBalance({ totalAmount: 3000, extraCharges: 500, amountPaid: 3000 })).toBe(true);
  });
});

describe('reservation analytics', () => {
  const now = new Date('2026-10-24T04:00:00Z');
  const reservations = [
    { status: 'confirmed', checkIn: '2026-10-01', checkOut: '2026-10-02' },
    { status: 'checked-out', checkIn: '2026-10-10', checkOut: '2026-10-11', overstayMinutes: 30, lateCheckoutChargeTotal: 500 },
    { status: 'checked-out', checkIn: '2026-10-20', checkOut: '2026-10-21' },
    { status: 'cancelled', checkIn: '2026-10-15', checkOut: '2026-10-16' },
    { status: 'checked-in', checkIn: '2026-10-22', checkOut: '2026-10-23', checkOutTime: '12:00 PM' },
    { status: 'confirmed', checkIn: '2026-04-05', checkOut: '2026-04-06' },
  ];

  test('uses the Philippine date for "today"', () => {
    expect(manilaDateKey(new Date('2026-10-24T17:00:00Z'))).toBe('2026-10-25');
  });

  test('averages reservations over the period, skipping cancellations', () => {
    const range = getPeriodRange(reservations, '30', now);
    expect(range).toEqual({ from: '2026-09-25', to: '2026-10-24' });
    const averages = getReservationAverages(reservations, range);
    expect(averages.count).toBe(4);
    expect(averages.perDay).toBeCloseTo(4 / 30);
    expect(averages.perWeek).toBeCloseTo(4 / (30 / 7));
    expect(getPeriodRange(reservations, 'all', now).from).toBe('2026-04-05');
  });

  test('compares quarters by reservations per month of history', () => {
    const quarters = getQuarterlyBreakdown(reservations, now);
    const q2 = quarters.find(q => q.id === 'Q2');
    const q4 = quarters.find(q => q.id === 'Q4');
    expect(q2).toMatchObject({ count: 1, months: 3 });
    expect(q4).toMatchObject({ count: 4, months: 1, peak: true });
  });

  test('reports active and past overstays with late fees', () => {
    const stats = getOverstayStats(reservations, getPeriodRange(reservations, '30', now), now);
    expect(stats.activeCount).toBe(1);
    expect(stats.historicalCount).toBe(1);
    expect(stats.rate).toBeCloseTo(1 / 2);
    expect(stats.lateFeeTotal).toBe(500);
  });
});

describe('status steps', () => {
  test('moves forward one step at a time', () => {
    expect(getStatusTransitionError('pending', 'confirmed')).toBe('');
    expect(getStatusTransitionError('confirmed', 'checked-in')).toBe('');
    expect(getStatusTransitionError('checked-in', 'checked-out')).toBe('');
  });
  test('never goes backwards', () => {
    expect(getStatusTransitionError('confirmed', 'pending')).toMatch(/backwards/);
    expect(getStatusTransitionError('checked-in', 'confirmed')).toMatch(/backwards/);
    expect(getStatusTransitionError('checked-out', 'checked-in')).toMatch(/backwards/);
  });
  test('refuses to skip steps', () => {
    expect(getStatusTransitionError('pending', 'checked-out')).toMatch(/Confirmed first/);
    expect(getStatusTransitionError('pending', 'checked-in')).toMatch(/can't be skipped/);
  });
  test('cancelling is final', () => {
    expect(getStatusTransitionError('confirmed', 'cancelled')).toBe('');
    expect(getStatusTransitionError('checked-out', 'cancelled')).not.toBe('');
    expect(getStatusTransitionError('cancelled', 'pending')).toMatch(/can’t be reopened/);
    expect(getStatusTransitionError('approved', 'checked-in')).toBe('');
  });
});

describe('ready to check in (paid in full)', () => {
  const { isReadyToCheckIn } = require('./reservationStatus');
  const now = new Date('2026-11-05T04:00:00Z'); // noon, Nov 5, Philippine time
  const paid = { status: 'confirmed', checkIn: '2026-11-05', checkOut: '2026-11-06', totalAmount: 4600, amountPaid: 4600 };

  test('confirmed, fully paid and arriving today', () => {
    expect(isReadyToCheckIn(paid, now)).toBe(true);
    expect(isReadyToCheckIn({ ...paid, checkIn: '2026-11-05', checkOut: '2026-11-05' }, now)).toBe(true);
  });

  test('not when money is owed, the date is wrong or the guest is already in', () => {
    expect(isReadyToCheckIn({ ...paid, amountPaid: 2300 }, now)).toBe(false);
    expect(isReadyToCheckIn({ ...paid, extraCharges: 500 }, now)).toBe(false);
    expect(isReadyToCheckIn({ ...paid, checkIn: '2026-11-06', checkOut: '2026-11-07' }, now)).toBe(false);
    expect(isReadyToCheckIn({ ...paid, status: 'checked-in' }, now)).toBe(false);
    expect(isReadyToCheckIn({ ...paid, status: 'pending' }, now)).toBe(false);
  });
});

describe("front desk daily sheet", () => {
  const { getDailySheet } = require('../admin/lib/printDailySheet');
  const now = new Date('2026-11-05T04:00:00Z');
  test('sorts bookings into arrivals, departures and in-house', () => {
    const sheet = getDailySheet([
      { id: 'a1', status: 'confirmed', checkIn: '2026-11-05', checkOut: '2026-11-06' },
      { id: 'a2', status: 'cancelled', checkIn: '2026-11-05', checkOut: '2026-11-06' },
      { id: 'd1', status: 'checked-in', checkIn: '2026-11-03', checkOut: '2026-11-05' },
      { id: 'h1', status: 'checked-in', checkIn: '2026-11-04', checkOut: '2026-11-07' },
      { id: 'x', status: 'confirmed', checkIn: '2026-11-09', checkOut: '2026-11-10' },
    ], now);
    expect(sheet.arrivals.map(r => r.id)).toEqual(['a1']);
    expect(sheet.departures.map(r => r.id)).toEqual(['d1']);
    expect(sheet.inHouse.map(r => r.id)).toEqual(['h1']);
  });
});

test('ID shown at check-in keeps only the type and last 4', () => {
  const { normalizeIdCheck } = require('./checkInId');
  expect(normalizeIdCheck({ type: 'Passport', last4: 'p12x' })).toEqual({ type: 'Passport', last4: 'P12X' });
  expect(normalizeIdCheck({ type: 'Passport', last4: '1234567' })).toBeNull();
  expect(normalizeIdCheck({ type: 'Library card', last4: '1234' })).toBeNull();
  expect(normalizeIdCheck(null)).toBeNull();
});

describe('overstay without notice (10% of the room rate)', () => {
  // Check-out 12:00 PM Manila on Nov 12 = 04:00 UTC.
  const guest = { status: 'checked-in', checkIn: '2026-11-11', checkOut: '2026-11-12', checkOutTime: '12:00 PM', baseRate: 4600, totalAmount: 4600 };
  const at = utc => new Date(`2026-11-12T${utc}Z`);

  it('is not charged within the grace period', () => {
    expect(getUnannouncedOverstayCharge(guest, at('04:20:00'))).toBeNull();
  });

  it('charges 10% of the room rate once the guest is past check-out without notice', () => {
    expect(getUnannouncedOverstayCharge(guest, at('05:00:00'))).toMatchObject({ amount: 460, roomRate: 4600 });
  });

  it('waits for an agreed late check-out to run out', () => {
    const extended = { ...guest, lateCheckoutUntil: Date.parse('2026-11-12T07:00:00Z') };
    expect(getUnannouncedOverstayCharge(extended, at('06:00:00'))).toBeNull();
    expect(getUnannouncedOverstayCharge(extended, at('08:00:00'))).toMatchObject({ amount: 460 });
  });

  it('is charged only once, and only for checked-in guests', () => {
    expect(getUnannouncedOverstayCharge({ ...guest, overstayPenalty: { amount: 460 } }, at('05:00:00'))).toBeNull();
    expect(getUnannouncedOverstayCharge({ ...guest, status: 'checked-out' }, at('05:00:00'))).toBeNull();
  });

  it('uses the total per night for group packages without a room rate', () => {
    const group = { ...guest, baseRate: 0, checkIn: '2026-11-10', totalAmount: 60000 };
    expect(getUnannouncedOverstayCharge(group, at('05:00:00'))).toMatchObject({ roomRate: 30000, amount: 3000 });
  });
});
