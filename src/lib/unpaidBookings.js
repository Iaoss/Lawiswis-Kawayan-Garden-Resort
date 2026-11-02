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
