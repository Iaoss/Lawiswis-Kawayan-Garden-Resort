// Cancels a booking under the resort's cancellation policy. Used by staff
// (/api/staff-billing "cancel-with-policy") and by the daily job (no-shows).
//
//   noShow: the guest never arrived. Only after the check-in date; the
//           policy's no-show rate applies and the booking is marked noShow.
//   waive:  admin only, with a reason (e.g. typhoon, resort closed): no fee,
//           everything paid is refundable. Saved as policyWaived.
//
// Returns the fee/refund outcome; with preview: true nothing is changed.
import { adminDb, FieldValue } from './firebaseAdmin';
import { sendCancellationEmail } from './email';
import { DEFAULT_CANCELLATION_POLICY, getStaffCancellationFee } from '../src/lib/cancellationPolicy';
import { manilaDateKey } from '../src/lib/reservationStatus';

export class CancelError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Pending or confirmed, never checked in, and the check-in date has passed.
export function canMarkNoShow(reservation, now = new Date()) {
  const status = String(reservation?.status || '').toLowerCase();
  const checkIn = String(reservation?.checkIn || '').slice(0, 10);
  return ['pending', 'confirmed'].includes(status) && Boolean(checkIn) && checkIn < manilaDateKey(now);
}

export async function cancelBooking({ actor, reservationId, reason = '', preview = false, noShow = false, waive = false, sendEmail = true }) {
  if (typeof reservationId !== 'string' || !reservationId) throw new CancelError(400, 'A reservation is required.');
  if (waive && actor.role !== 'admin') throw new CancelError(403, 'Only an admin can waive the cancellation policy.');
  const cleanReason = cleanText(reason, 500);
  if (waive && !preview && cleanReason.length < 5) throw new CancelError(400, 'Write why the policy is waived (for example "Typhoon, resort closed").');

  const policySnap = await adminDb.doc('settings/cancellationPolicy').get();
  const policy = policySnap.exists ? policySnap.data() : DEFAULT_CANCELLATION_POLICY;
  const receiptNumber = `CXL-${reservationId.slice(0, 8).toUpperCase()}`;
  const ref = adminDb.collection('reservations').doc(reservationId);

  const result = await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new CancelError(404, 'This reservation could not be found.');
    const reservation = snapshot.data();
    if (['cancelled', 'checked-out'].includes(reservation.status)) {
      throw new CancelError(409, 'This booking is already cancelled or checked out.');
    }
    if (noShow && !canMarkNoShow(reservation)) {
      throw new CancelError(409, 'A booking can be marked a no-show only after its check-in date, if the guest never checked in.');
    }
    const outcome = getStaffCancellationFee({
      policy, checkIn: reservation.checkIn, totalAmount: reservation.totalAmount, amountPaid: reservation.amountPaid || 0,
    });
    if (!outcome) throw new CancelError(409, 'This booking’s check-in date or total is invalid, so the fee can’t be calculated.');
    if (waive) {
      Object.assign(outcome, { rate: 0, fee: 0, retained: 0, refund: outcome.amountPaid, tier: 'Policy waived', waived: true });
    }
    if (noShow) outcome.tier = waive ? 'No-show (policy waived)' : 'No-show';
    if (preview) return { preview: true, ...outcome, hasEmail: Boolean(reservation.email || reservation.guestEmail) };

    const roomRef = reservation.roomId ? adminDb.collection('rooms').doc(reservation.roomId) : null;
    const roomSnap = roomRef ? await transaction.get(roomRef) : null;
    const finalReason = cleanReason || (noShow ? 'No-show: the guest did not arrive.' : '');
    transaction.update(ref, {
      status: 'cancelled',
      cancellationRequested: false,
      cancellationReason: finalReason,
      cancellationFee: outcome.fee,
      cancellationFeeRate: outcome.rate,
      cancellationTier: outcome.tier,
      cancellationRetained: outcome.retained,
      refundAmount: outcome.refund,
      cancellationReceiptNumber: receiptNumber,
      cancelledAt: new Date().toISOString(),
      cancelledBy: actor.uid,
      cancelledByName: actor.name || actor.email || '',
      ...(noShow ? { noShow: true, noShowMarkedAt: FieldValue.serverTimestamp() } : {}),
      ...(waive ? { policyWaived: true, policyWaivedReason: finalReason, policyWaivedBy: actor.name || actor.email || '' } : {}),
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: actor.uid,
    });
    // Free the room only if no one is in it.
    if (roomSnap?.exists && roomSnap.data().status !== 'occupied') transaction.update(roomRef, { status: 'vacant' });
    return { ...outcome, reservation, reason: finalReason };
  });
  if (result.preview) return result;

  const { reservation, reason: savedReason, ...outcome } = result;
  let emailSent = false;
  let emailError = '';
  // Unpaid no-shows owe nothing and get nothing back, so no email.
  const worthEmailing = sendEmail && (!noShow || Number(outcome.amountPaid) > 0);
  if (worthEmailing) {
    try {
      await sendCancellationEmail({
        reservation, bookingRef: reservationId.slice(0, 8).toUpperCase(), receiptNumber, outcome, reason: savedReason,
      });
      emailSent = true;
      await ref.update({ cancellationEmailSentAt: FieldValue.serverTimestamp() });
    } catch (error) {
      emailError = error.message || 'The cancellation email could not be sent.';
      console.error('Cancellation email failed:', error);
    }
  }
  return { ...outcome, receiptNumber, emailSent, emailError, guestName: reservation.guestName || '' };
}
