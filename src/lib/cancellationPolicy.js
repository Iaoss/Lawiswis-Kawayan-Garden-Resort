export const DEFAULT_CANCELLATION_POLICY = Object.freeze({
  moreThan7Days: 20,
  between4And7Days: 50,
  lessThan3Days: 100,
});

function validRate(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function normalizeCancellationPolicy(value) {
  if (!value || typeof value !== 'object') return null;
  const policy = {
    moreThan7Days: Number(value.moreThan7Days),
    between4And7Days: Number(value.between4And7Days),
    lessThan3Days: Number(value.lessThan3Days),
  };
  return Object.values(policy).every(validRate) ? policy : null;
}

export function getCancellationPolicyOutcome({ policy, checkIn, amount, amountPaid }) {
  const normalizedPolicy = normalizeCancellationPolicy(policy);
  const totalAmount = Number(amount);
  const paidAmount = Number(amountPaid);
  if (!normalizedPolicy || !Number.isFinite(totalAmount) || totalAmount <= 0
    || !Number.isFinite(paidAmount) || paidAmount < 0) {
    return {
      outcome: 'needs_review',
      reason: 'The reservation or cancellation policy details could not be verified automatically.',
      alternatives: ['Ask resort staff to review the reservation and payment history.'],
    };
  }

  const arrival = parseCalendarDate(checkIn);
  if (!arrival) {
    return {
      outcome: 'needs_review',
      reason: 'The reservation check-in date is invalid or unclear.',
      alternatives: ['Ask resort staff to review the reservation dates.'],
    };
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysBeforeCheckIn = Math.ceil((arrival.getTime() - todayUtc) / 86400000);
  const rate = daysBeforeCheckIn > 7
    ? normalizedPolicy.moreThan7Days
    : daysBeforeCheckIn >= 4
      ? normalizedPolicy.between4And7Days
      : normalizedPolicy.lessThan3Days;
  const feeAmount = Math.round(totalAmount * rate) / 100;
  const policyRefundAmount = Math.max(0, totalAmount - feeAmount);
  const refundableAmount = Math.min(policyRefundAmount, paidAmount);

  if (paidAmount <= 0 || refundableAmount <= 0) {
    return {
      outcome: 'not_eligible',
      reason: paidAmount <= 0
        ? 'No payment has been recorded for this reservation, so there is no paid amount to refund.'
        : `The cancellation policy applies a ${rate}% fee for cancellations ${daysBeforeCheckIn <= 3 ? '3 days or less' : 'within this date window'} before check-in; no refundable amount remains.`,
      alternatives: [
        'Request a reschedule so the payment can be applied to a different available date.',
        'Contact the resort to discuss an exception or another arrangement.',
      ],
      daysBeforeCheckIn,
      policyRate: rate,
      feeAmount,
      refundableAmount: 0,
    };
  }

  return {
    outcome: 'eligible',
    reason: `The cancellation policy applies a ${rate}% fee (${daysBeforeCheckIn} days before check-in).`,
    daysBeforeCheckIn,
    policyRate: rate,
    feeAmount,
    refundableAmount,
    alternatives: [],
  };
}

export function getDateRangeNights(checkIn, checkOut) {
  const start = parseCalendarDate(checkIn);
  const end = parseCalendarDate(checkOut);
  if (!start || !end || end <= start) return null;
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

// Cancellation fee and refund used by the staff Cancellation Policy page.
// Both the page (for the preview) and the server (which saves it) use this,
// so the amount shown is the amount recorded. Days are counted in
// Philippine time.
export function getStaffCancellationFee({ policy, checkIn, totalAmount, now = new Date() }) {
  const normalizedPolicy = normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY;
  const arrival = parseCalendarDate(checkIn);
  const total = Number(totalAmount);
  if (!arrival || !Number.isFinite(total) || total < 0) return null;
  const manilaToday = new Date(now.getTime() + 8 * 3600000);
  const todayUtc = Date.UTC(manilaToday.getUTCFullYear(), manilaToday.getUTCMonth(), manilaToday.getUTCDate());
  const daysBeforeCheckIn = Math.round((arrival.getTime() - todayUtc) / 86400000);
  let rate;
  let tier;
  if (daysBeforeCheckIn > 7) {
    rate = normalizedPolicy.moreThan7Days;
    tier = 'More than 7 days before check-in';
  } else if (daysBeforeCheckIn >= 4) {
    rate = normalizedPolicy.between4And7Days;
    tier = '4–7 days before check-in';
  } else {
    rate = normalizedPolicy.lessThan3Days;
    tier = '3 days or less / same day';
  }
  const fee = Math.round(total * rate) / 100;
  return { daysBeforeCheckIn, rate, tier, totalAmount: total, fee, refund: Math.max(0, total - fee) };
}
