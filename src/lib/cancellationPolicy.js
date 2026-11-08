// Lawiswis Kawayan cancellation and rebooking policy (resort, 2026):
//
//   "Cancellation fee applies to those bookings that guests choose not to
//   rebook at least 7 days before the date of booking. Based on total package
//   price, a 20% charge applies for cancellations more than 7 days, 50% for
//   cancellations within 4-7 days, 100% 3 days before or the day of booking."
//
//   - More than 7 days before arrival: 20% of the total.
//   - 4 to 7 days before: 50%.
//   - 3 days or less before, or on the day (no-show): 100%.
//   - Rebooking (moving the dates) is free when done at least 7 days before
//     arrival; after that the booking can only be cancelled under the fees.
//   - Reducing rooms, changing room type or shortening a stay is not
//     refunded: the full room charge stays.
//
// Admins can change both the percentages and the day limits
// (settings/cancellationPolicy, Cancellation Policy page).

export const DEFAULT_CANCELLATION_POLICY = Object.freeze({
  version: 2,
  moreThanDays: 7, // "more than 7 days" before arrival → earlyRate
  earlyRate: 20,
  midFromDays: 4, // 4 to 7 days → midRate
  midRate: 50,
  lateRate: 100, // 3 days or less, the day itself, or no-show
  dateChangeDays: 7, // free rebooking at least this many days before
});

// For screens that can't load the saved policy: the default rebooking notice.
export const DATE_CHANGE_NOTICE_DAYS = DEFAULT_CANCELLATION_POLICY.dateChangeDays;

const validRate = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
const validDays = (value, min = 0) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= 365;

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

// The saved policy, cleaned. Settings saved before the day limits could be
// edited (older keys) fall back to the current official policy. Returns
// null when the saved values are invalid.
export function normalizeCancellationPolicy(value) {
  if (!value || typeof value !== 'object' || Number(value.version) !== 2) {
    return { ...DEFAULT_CANCELLATION_POLICY };
  }
  const policy = {
    version: 2,
    moreThanDays: Number(value.moreThanDays),
    earlyRate: Number(value.earlyRate),
    midFromDays: Number(value.midFromDays),
    midRate: Number(value.midRate),
    lateRate: Number(value.lateRate),
    dateChangeDays: Number(value.dateChangeDays),
  };
  const ok = [policy.earlyRate, policy.midRate, policy.lateRate].every(validRate)
    && validDays(policy.moreThanDays, 1)
    && validDays(policy.midFromDays, 1) && policy.midFromDays <= policy.moreThanDays
    && validDays(policy.dateChangeDays, 0);
  return ok ? policy : null;
}

// Plain-language tiers, for the policy page, chat and staff screens.
export function describePolicyTiers(policy = DEFAULT_CANCELLATION_POLICY) {
  const p = normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY;
  const lateUpTo = p.midFromDays - 1;
  return [
    { key: 'early', label: `More than ${p.moreThanDays} days before arrival`, rate: p.earlyRate },
    { key: 'mid', label: p.midFromDays === p.moreThanDays ? `${p.moreThanDays} days before arrival` : `${p.midFromDays} to ${p.moreThanDays} days before arrival`, rate: p.midRate },
    { key: 'late', label: lateUpTo >= 1 ? `${lateUpTo} day${lateUpTo === 1 ? '' : 's'} or less before, or on the day (no-show)` : 'On the day of arrival (no-show)', rate: p.lateRate },
  ];
}

// The penalty tier for cancelling with `daysBeforeArrival` days to go.
export function getPolicyTier(daysBeforeArrival, policy = DEFAULT_CANCELLATION_POLICY) {
  const p = normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY;
  const [early, mid, late] = describePolicyTiers(p);
  if (daysBeforeArrival > p.moreThanDays) return { rate: p.earlyRate, tier: early.label, noShow: false };
  if (daysBeforeArrival >= p.midFromDays) return { rate: p.midRate, tier: mid.label, noShow: false };
  if (daysBeforeArrival > 0) return { rate: p.lateRate, tier: late.label.replace(', or on the day (no-show)', ''), noShow: false };
  return { rate: p.lateRate, tier: 'On or after the arrival date (no-show)', noShow: true };
}

// Why the booking's dates can't be moved to `newCheckIn`, or '' if they can.
// Changing only the check-out (extending or shortening) isn't a date move.
export function getDateChangeBlock({ originalCheckIn, newCheckIn, now = new Date(), policy = DEFAULT_CANCELLATION_POLICY }) {
  if (!newCheckIn || newCheckIn === originalCheckIn) return '';
  const notice = (normalizeCancellationPolicy(policy) || DEFAULT_CANCELLATION_POLICY).dateChangeDays;
  const days = getDaysBeforeArrival(originalCheckIn, now);
  if (days === null) return 'The booking’s arrival date is invalid, so it can’t be moved.';
  if (days <= 0) {
    return 'Dates can’t be changed on or after the arrival date. Under the resort policy the amount paid is non-refundable and non-convertible, so the new dates need a new booking.';
  }
  if (days < notice) {
    return `Dates can only be changed ${notice} days or more before arrival (this booking is ${days} day${days === 1 ? '' : 's'} away). To change the dates, cancel the booking under the cancellation policy and make a new booking.`;
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

// Cancellation fee and refund when staff cancel a booking. Both the screens
// (for the preview) and the server (which saves it) use this, so the amount
// shown is the amount recorded.
//
// The fee is a share of the booking total. The guest gets back what they
// paid minus the fee; if they paid less than the fee, the resort keeps what
// was paid and the guest owes nothing more. Without `amountPaid` the booking
// is treated as fully paid.
export function getStaffCancellationFee({ policy, checkIn, totalAmount, amountPaid, now = new Date() }) {
  const total = Number(totalAmount);
  const daysBeforeCheckIn = getDaysBeforeArrival(checkIn, now);
  if (daysBeforeCheckIn === null || !Number.isFinite(total) || total < 0) return null;
  const paidValue = amountPaid === undefined || amountPaid === null ? total : Number(amountPaid);
  const paid = Number.isFinite(paidValue) && paidValue > 0 ? Math.round(paidValue * 100) / 100 : 0;
  const { rate, tier, noShow } = getPolicyTier(daysBeforeCheckIn, policy);
  const fee = Math.round(total * rate) / 100;
  const refund = Math.max(0, Math.round((paid - fee) * 100) / 100);
  return {
    daysBeforeCheckIn, rate, tier, noShow, totalAmount: total, fee,
    amountPaid: paid,
    // What the resort keeps from the money already paid.
    retained: Math.round((paid - refund) * 100) / 100,
    refund,
  };
}
