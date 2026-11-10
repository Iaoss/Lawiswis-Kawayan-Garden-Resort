// Online bookings that came in without any payment.
//
// A guest who pays at least the deposit online is confirmed automatically.
// Bookings with no payment stay Pending and may not be real, so staff can
// email the guest to ask if the booking is theirs, then email a PayMongo
// payment link. Paying through that link confirms the booking.
// Follow-up details are kept on the booking as `unpaidFollowUp`.

const lower = value => String(value || '').toLowerCase();

export function isUnpaidOnlineBooking(reservation = {}) {
  return lower(reservation.type) === 'online'
    && lower(reservation.status) === 'pending'
    && !(Number(reservation.amountPaid) > 0);
}

export const GUEST_REPLY_LABELS = {
  yes: 'Guest says the booking is theirs',
  no: 'Guest says they did not make this booking',
};

// One line describing where the follow-up stands, newest step first.
export function describeUnpaidFollowUp(followUp = {}, formatTime = value => value) {
  if (followUp.paymentLinkSentAt) {
    const amount = `₱${Number(followUp.paymentLinkAmount || 0).toLocaleString()}`;
    return `Payment link sent (${followUp.paymentLinkChoice === 'full' ? 'full amount' : 'deposit'}, ${amount}) ${formatTime(followUp.paymentLinkSentAt)}. Waiting for payment.`;
  }
  if (followUp.guestReply && GUEST_REPLY_LABELS[followUp.guestReply]) {
    return `${GUEST_REPLY_LABELS[followUp.guestReply]} (${formatTime(followUp.guestRepliedAt)}).`;
  }
  if (followUp.verifySentAt) {
    return `Asked the guest to confirm ${formatTime(followUp.verifySentAt)}. No reply yet.`;
  }
  return 'No payment yet. The guest may still be paying, or the booking may not be real.';
}

// ── Room holds for unpaid online bookings ─────────────────────
// An online booking that hasn't been paid holds its room for a while, so the
// guest can finish paying. After that the room is released for others (the
// booking stays Pending, marked "hold expired", and is cancelled by the
// daily job). A payment link sent by staff gives the guest longer.
export const ONLINE_HOLD_MINUTES = 60;
export const PAYMENT_LINK_HOLD_HOURS = 24;

const toMs = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

// When this unpaid booking stops holding its room (ms), or null if it isn't
// an unpaid online booking.
export function getHoldExpiresMs(reservation = {}) {
  if (!isUnpaidOnlineBooking(reservation)) return null;
  const started = Math.max(toMs(reservation.createdAt), toMs(reservation.lastCheckoutSession?.createdAt));
  if (!started) return null;
  let expires = started + ONLINE_HOLD_MINUTES * 60000;
  const linkSent = toMs(reservation.unpaidFollowUp?.paymentLinkSentAt);
  if (linkSent) expires = Math.max(expires, linkSent + PAYMENT_LINK_HOLD_HOURS * 3600000);
  return expires;
}

export function isHoldExpired(reservation, now = Date.now()) {
  const expires = getHoldExpiresMs(reservation);
  return expires !== null && (typeof now === 'number' ? now : now.getTime()) > expires;
}

// Does this booking still keep its room (or cottage) from other guests?
export function holdsRoom(reservation = {}, now = Date.now()) {
  const status = lower(reservation.status);
  if (['cancelled', 'checked-out', 'rejected'].includes(status)) return false;
  return !isHoldExpired(reservation, now);
}
