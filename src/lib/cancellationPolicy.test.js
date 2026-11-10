import {
  DEFAULT_CANCELLATION_POLICY,
  describePolicyTiers,
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

  test('20% more than 7 days out, 50% within 4-7 days, 100% 3 days or less and on arrival', () => {
    expect(getStaffCancellationFee({ checkIn: '2026-11-01', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 8, rate: 20, fee: 1200, refund: 4800 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-31', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 7, rate: 50, fee: 3000 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-28', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 4, rate: 50 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-27', totalAmount: 6000, now })).toMatchObject({ daysBeforeCheckIn: 3, rate: 100, refund: 0 });
    expect(getStaffCancellationFee({ checkIn: '2026-10-24', totalAmount: 6000, now })).toMatchObject({ rate: 100, noShow: true });
  });

  test('staff cancellation refunds what was paid minus the fee, never less than zero', () => {
    // 50% fee on ₱6,000 = ₱3,000. Paid in full: ₱3,000 back.
    expect(getStaffCancellationFee({ checkIn: '2026-10-31', totalAmount: 6000, amountPaid: 6000, now }))
      .toMatchObject({ fee: 3000, amountPaid: 6000, retained: 3000, refund: 3000 });
    // Paid only the ₱3,000 deposit: the deposit covers the fee, nothing back.
    expect(getStaffCancellationFee({ checkIn: '2026-10-31', totalAmount: 6000, amountPaid: 3000, now }))
      .toMatchObject({ fee: 3000, retained: 3000, refund: 0 });
    // Paid ₱1,000: the resort keeps ₱1,000 and the guest owes nothing more.
    expect(getStaffCancellationFee({ checkIn: '2026-10-31', totalAmount: 6000, amountPaid: 1000, now }))
      .toMatchObject({ retained: 1000, refund: 0 });
    // More than 7 days out: 20% (₱1,200) kept from a ₱3,000 deposit.
    expect(getStaffCancellationFee({ checkIn: '2026-11-23', totalAmount: 6000, amountPaid: 3000, now }))
      .toMatchObject({ fee: 1200, retained: 1200, refund: 1800 });
    // Nothing paid: nothing to refund.
    expect(getStaffCancellationFee({ checkIn: '2026-11-23', totalAmount: 6000, amountPaid: 0, now }))
      .toMatchObject({ refund: 0, retained: 0 });
  });

  test('guest refunds are capped at what was paid', () => {
    expect(getCancellationPolicyOutcome({ checkIn: '2026-10-31', amount: 10000, amountPaid: 3000, now }))
      .toMatchObject({ outcome: 'eligible', policyRate: 50, feeAmount: 5000, refundableAmount: 3000 });
    const late = getCancellationPolicyOutcome({ checkIn: '2026-10-26', amount: 10000, amountPaid: 5000, now });
    expect(late).toMatchObject({ outcome: 'not_eligible', refundableAmount: 0 });
    expect(getCancellationPolicyOutcome({ checkIn: '2026-10-24', amount: 10000, amountPaid: 5000, now }).reason).toMatch(/no-show/);
  });

  test('older saved settings fall back to the official policy; bad values go to review', () => {
    expect(normalizeCancellationPolicy({ atLeast30Days: 0, lessThan30Days: 50, lessThan7Days: 100 })).toEqual({ ...DEFAULT_CANCELLATION_POLICY });
    expect(normalizeCancellationPolicy({ ...DEFAULT_CANCELLATION_POLICY, midRate: 150 })).toBeNull();
    expect(normalizeCancellationPolicy({ ...DEFAULT_CANCELLATION_POLICY, midFromDays: 10 })).toBeNull();
    expect(getCancellationPolicyOutcome({ policy: { ...DEFAULT_CANCELLATION_POLICY, earlyRate: -5 }, checkIn: '2027-01-01', amount: 1000, amountPaid: 500, now }).outcome).toBe('needs_review');
  });

  test('admins can change the days, not just the percentages', () => {
    const policy = { ...DEFAULT_CANCELLATION_POLICY, moreThanDays: 14, midFromDays: 7, dateChangeDays: 14 };
    expect(getStaffCancellationFee({ policy, checkIn: '2026-11-01', totalAmount: 1000, now })).toMatchObject({ rate: 50 });
    expect(getStaffCancellationFee({ policy, checkIn: '2026-11-08', totalAmount: 1000, now })).toMatchObject({ rate: 20 });
    expect(getStaffCancellationFee({ policy, checkIn: '2026-10-29', totalAmount: 1000, now })).toMatchObject({ rate: 100 });
    expect(getDateChangeBlock({ policy, originalCheckIn: '2026-11-01', newCheckIn: '2026-11-05', now })).toMatch(/14 days or more/);
    expect(describePolicyTiers(policy).map(t => t.label)).toEqual([
      'More than 14 days before arrival', '7 to 14 days before arrival', '6 days or less before, or on the day (no-show)',
    ]);
  });

  test('free rebooking at least 7 days before arrival', () => {
    expect(getDateChangeBlock({ originalCheckIn: '2026-10-31', newCheckIn: '2026-11-05', now })).toBe('');
    expect(getDateChangeBlock({ originalCheckIn: '2026-10-30', newCheckIn: '2026-11-12', now })).toMatch(/7 days or more/);
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
