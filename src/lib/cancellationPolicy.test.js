import {
  getCancellationPolicyOutcome,
  getDateChangeBlock,
  getDateRangeNights,
  getDaysBeforeArrival,
  getStaffCancellationFee,
  normalizeCancellationPolicy,
} from './cancellationPolicy';

// Noon, 24 Oct 2026, Philippine time.
const now = new Date('2026-10-24T04:00:00Z');

describe('Lawiswis Kawayan cancellation policy', () => {
  test('counts days to arrival in Philippine time', () => {
    expect(getDaysBeforeArrival('2026-10-24', now)).toBe(0);
    expect(getDaysBeforeArrival('2026-11-23', now)).toBe(30);
    expect(getDaysBeforeArrival('2026-10-22', now)).toBe(-2);
  });

  test('no penalty 30+ days out, 50% under 30 days, full charge under 7 days and on arrival', () => {
    expect(getStaffCancellationFee({ checkIn: '2026-11-23', totalAmount: 6000, now })).toMatchObject({ rate: 0, fee: 0, refund: 6000 });
    expect(getStaffCancellationFee({ checkIn: '2026-11-22', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 29, rate: 50, fee: 3000, refund: 3000 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-31', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 7, rate: 50 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-30', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 6, rate: 100, refund: 0 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-24', totalAmount: 6000, now })).toMatchObject({ rate: 100, noShow: true });
  });

  test('guest refunds are capped at what was paid', () => {
    expect(getCancellationPolicyOutcome({ checkIn: '2026-11-22', amount: 10000, amountPaid: 3000, now }))
      .toMatchObject({ outcome: 'eligible', policyRate: 50, feeAmount: 5000, refundableAmount: 3000 });
    const late = getCancellationPolicyOutcome({ checkIn: '2026-10-26', amount: 10000, amountPaid: 5000, now });
    expect(late).toMatchObject({ outcome: 'not_eligible', refundableAmount: 0 });
    expect(getCancellationPolicyOutcome({ checkIn: '2026-10-24', amount: 10000, amountPaid: 5000, now }).reason).toMatch(/no-show/);
  });

  test('older saved settings fall back to the official rates; bad rates go to review', () => {
    expect(normalizeCancellationPolicy({ moreThan7Days: 20, between4And7Days: 50, lessThan3Days: 100 }))
      .toEqual({ atLeast30Days: 0, lessThan30Days: 50, lessThan7Days: 100 });
    expect(normalizeCancellationPolicy({ lessThan30Days: 150, lessThan7Days: 100 })).toBeNull();
    expect(getCancellationPolicyOutcome({ policy: { lessThan30Days: 150, lessThan7Days: 100 }, checkIn: '2027-01-01', amount: 1000, amountPaid: 500, now }).outcome).toBe('needs_review');
  });

  test('dates can only move 30+ days before arrival', () => {
    expect(getDateChangeBlock({ originalCheckIn: '2026-12-01', newCheckIn: '2026-12-05', now })).toBe('');
    expect(getDateChangeBlock({ originalCheckIn: '2026-11-10', newCheckIn: '2026-11-12', now })).toMatch(/30 days or more/);
    expect(getDateChangeBlock({ originalCheckIn: '2026-10-24', newCheckIn: '2026-10-27', now })).toMatch(/on or after the arrival date/);
    // Keeping the arrival date (e.g. extending the stay) isn't a date move.
    expect(getDateChangeBlock({ originalCheckIn: '2026-10-24', newCheckIn: '2026-10-24', now })).toBe('');
  });
});

describe('reservation date ranges', () => {
  test('calculates valid nights and rejects equal or malformed dates', () => {
    expect(getDateRangeNights('2027-01-01', '2027-01-04')).toBe(3);
    expect(getDateRangeNights('2027-01-01', '2027-01-01')).toBeNull();
    expect(getDateRangeNights('not-a-date', '2027-01-04')).toBeNull();
  });

  test('rejects bad dates for staff fees', () => {
    expect(getStaffCancellationFee({ checkIn: 'soon', totalAmount: 5000, now })).toBeNull();
  });
});
