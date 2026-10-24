import {
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
  test('moves one step forward or back', () => {
    expect(getStatusTransitionError('pending', 'confirmed')).toBe('');
    expect(getStatusTransitionError('confirmed', 'pending')).toBe('');
    expect(getStatusTransitionError('confirmed', 'checked-in')).toBe('');
    expect(getStatusTransitionError('checked-in', 'checked-out')).toBe('');
    expect(getStatusTransitionError('checked-out', 'checked-in')).toBe('');
  });
  test('refuses to skip steps either way', () => {
    expect(getStatusTransitionError('pending', 'checked-out')).toMatch(/Confirmed first/);
    expect(getStatusTransitionError('pending', 'checked-in')).toMatch(/can't be skipped/);
    expect(getStatusTransitionError('checked-out', 'pending')).toMatch(/Checked in first/);
  });
  test('cancelling and reopening', () => {
    expect(getStatusTransitionError('confirmed', 'cancelled')).toBe('');
    expect(getStatusTransitionError('checked-out', 'cancelled')).not.toBe('');
    expect(getStatusTransitionError('cancelled', 'pending')).toBe('');
    expect(getStatusTransitionError('cancelled', 'confirmed')).toMatch(/Pending first/);
    expect(getStatusTransitionError('approved', 'checked-in')).toBe('');
  });
});
