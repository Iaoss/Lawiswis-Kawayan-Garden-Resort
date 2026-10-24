// Lawiswis Kawayan cancellation and change policy.
//
//   - Cancelled 30 days or more before arrival: no penalty.
//   - Cancelled LESS than 30 days before arrival: 50% of the total
//     accommodation charge.
//   - Cancelled LESS than 7 days before arrival, on the arrival date, or
//     after it (no-show): the FULL charge.
//   - Date changes are only allowed 30 days or more before arrival. Less than
//     30 days before, on arrival or during the stay, the booking can't be
//     moved: the guest cancels (penalty above) and makes a new booking.
//   - Reducing rooms, changing room type or shortening a stay is not
//     refunded: the full room charge stays.
//
// The percentages can be adjusted by admins (settings/cancellationPolicy);
// the day thresholds are fixed by the policy.

export const DATE_CHANGE_NOTICE_DAYS = 30;
export const LATE_NOTICE_DAYS = 7;

export const DEFAULT_CANCELLATION_POLICY = Object.freeze({
  atLeast30Days: 0,
  lessThan30Days: 50,
  lessThan7Days: 100,
});

function validRate(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

// Whole days from today (Philippine date) to the arrival date. 0 = arrival
// day, negative = after arrival.
export function getDaysBeforeArrival(checkIn, now = new Date()) {
  const arrival = parseCalendarDate(checkIn);
  if (!arrival) return null;
  const manila = new Date(now.getTime() + 8 * 3600000);
  const todayUtc = Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate());
  return Math.round((arrival.getTime() - todayUtc) / 86400000);
}

// Saved settings from before this policy used other keys; those fall back to
// the official percentages.
export function normalizeCancellationPolicy(value) {
  if (!value || typeof value !== 'object' || value.lessThan30Days === undefined) {
    return { ...DEFAULT_CANCELLATION_POLICY };
  }
  const policy = {
    atLeast30Days: Number(value.atLeast30Days ?? 0),
    lessThan30Days: Number(value.lessThan30Days),
    lessThan7Days: Number(value.lessThan7Days),
  };
  return Object.values(policy).every(validRate) ? policy : null;
}

// The penalty tier for cancelling with `daysBeforeArrival` days to go.
export function getPolicyTier(daysBeforeArrival, policy = DEFAULT_CANCELLATION_POLICY) {
  const rates = normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY;
  if (daysBeforeArrival >= DATE_CHANGE_NOTICE_DAYS) {
    return { rate: rates.atLeast30Days, tier: '30 days or more before arrival', noShow: false };
  }
  if (daysBeforeArrival >= LATE_NOTICE_DAYS) {
    return { rate: rates.lessThan30Days, tier: 'Less than 30 days before arrival', noShow: false };
  }
  if (daysBeforeArrival > 0) {
    return { rate: rates.lessThan7Days, tier: 'Less than 7 days before arrival', noShow: false };
  }
  return { rate: rates.lessThan7Days, tier: 'On or after the arrival date (no-show)', noShow: true };
}

// Why the booking's dates can't be moved to `newCheckIn`, or '' if they can.
// Changing only the check-out (extending or shortening) isn't a date move.
export function getDateChangeBlock({ originalCheckIn, newCheckIn, now = new Date() }) {
  if (!newCheckIn || newCheckIn === originalCheckIn) return '';
  const days = getDaysBeforeArrival(originalCheckIn, now);
  if (days === null) return 'The booking’s arrival date is invalid, so it can’t be moved.';
  if (days <= 0) {
    return 'Dates can’t be changed on or after the arrival date. Under the resort policy the amount paid is non-refundable and non-convertible, so the new dates need a new booking.';
  }
  if (days < DATE_CHANGE_NOTICE_DAYS) {
    return `Dates can only be changed ${DATE_CHANGE_NOTICE_DAYS} days or more before arrival (this booking is ${days} day${days === 1 ? '' : 's'} away). To change the dates, cancel the booking under the cancellation policy and make a new booking.`;
  }
  return '';
}

// Guest refund request: the penalty for cancelling now, and how much of what
// was paid comes back.
export function getCancellationPolicyOutcome({ policy, checkIn, amount, amountPaid, now = new Date() }) {
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

  const daysBeforeCheckIn = getDaysBeforeArrival(checkIn, now);
  if (daysBeforeCheckIn === null) {
    return {
      outcome: 'needs_review',
      reason: 'The reservation check-in date is invalid or unclear.',
      alternatives: ['Ask resort staff to review the reservation dates.'],
    };
  }

  const { rate, tier, noShow } = getPolicyTier(daysBeforeCheckIn, normalizedPolicy);
  const feeAmount = Math.round(totalAmount * rate) / 100;
  const policyRefundAmount = Math.max(0, totalAmount - feeAmount);
  const refundableAmount = Math.min(policyRefundAmount, paidAmount);
  const penaltyText = rate === 0 ? 'no cancellation penalty' : rate >= 100 ? 'the full charge as the penalty' : `a ${rate}% penalty`;

  if (paidAmount <= 0 || refundableAmount <= 0) {
    return {
      outcome: 'not_eligible',
      reason: paidAmount <= 0
        ? 'No payment has been recorded for this reservation, so there is no paid amount to refund.'
        : noShow
          ? 'Cancellations on or after the arrival date are treated as a no-show, which is non-refundable.'
          : `Cancelling ${tier.toLowerCase()} carries ${penaltyText}, so no refundable amount remains.`,
      alternatives: [
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
    reason: `Cancelling ${tier.toLowerCase()} (${daysBeforeCheckIn} days to go) carries ${penaltyText}.`,
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
// so the amount shown is the amount recorded.
export function getStaffCancellationFee({ policy, checkIn, totalAmount, now = new Date() }) {
  const total = Number(totalAmount);
  const daysBeforeCheckIn = getDaysBeforeArrival(checkIn, now);
  if (daysBeforeCheckIn === null || !Number.isFinite(total) || total < 0) return null;
  const { rate, tier, noShow } = getPolicyTier(daysBeforeCheckIn, policy);
  const fee = Math.round(total * rate) / 100;
  return { daysBeforeCheckIn, rate, tier, noShow, totalAmount: total, fee, refund: Math.max(0, total - fee) };
}
