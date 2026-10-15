import { getCancellationPolicyOutcome, getDateRangeNights, normalizeCancellationPolicy } from './cancellationPolicy';

describe('cancellation policy outcome', () => {
  test('uses the configured policy rates and caps refund to paid amount', () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 10);
    const checkIn = now.toISOString().slice(0, 10);
    const result = getCancellationPolicyOutcome({
      policy: { moreThan7Days: 20, between4And7Days: 50, lessThan3Days: 100 },
      checkIn,
      amount: 10000,
      amountPaid: 3000,
    });
    expect(result).toMatchObject({ outcome: 'eligible', policyRate: 20, feeAmount: 2000, refundableAmount: 3000 });
  });

  test('classifies full-fee and unpaid bookings as not eligible with alternatives', () => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = getCancellationPolicyOutcome({
      policy: { moreThan7Days: 20, between4And7Days: 50, lessThan3Days: 100 },
      checkIn: tomorrow.toISOString().slice(0, 10),
      amount: 10000,
      amountPaid: 5000,
    });
    expect(result.outcome).toBe('not_eligible');
    expect(result.refundableAmount).toBe(0);
    expect(result.alternatives).toHaveLength(2);
  });

  test('routes invalid policy details to manual review', () => {
    expect(normalizeCancellationPolicy({ moreThan7Days: 120, between4And7Days: 50, lessThan3Days: 100 })).toBeNull();
    expect(getCancellationPolicyOutcome({ policy: null, checkIn: '2027-01-01', amount: 1000, amountPaid: 500 }).outcome).toBe('needs_review');
  });
});

describe('reservation date ranges', () => {
  test('calculates valid nights and rejects equal or malformed dates', () => {
    expect(getDateRangeNights('2027-01-01', '2027-01-04')).toBe(3);
    expect(getDateRangeNights('2027-01-01', '2027-01-01')).toBeNull();
    expect(getDateRangeNights('not-a-date', '2027-01-04')).toBeNull();
  });
});

