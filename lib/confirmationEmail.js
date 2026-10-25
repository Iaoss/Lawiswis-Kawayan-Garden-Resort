import { sendReservationConfirmationEmail } from './email';

// Sends the "booking confirmed" email for a confirmed reservation, at most
// once (it claims the send first, so two triggers at the same moment don't
// both send). Used by the staff Confirm action and by automatic confirmation
// after a verified online payment.
// Returns { sent } or { sent: false, alreadySent | pending }.
export async function sendConfirmationEmailOnce(db, FieldValue, reservationId) {
  const reservationRef = db.collection('reservations').doc(reservationId);
  try {
    const claim = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reservationRef);
      if (!snapshot.exists) throw new Error('Reservation not found');
      const reservation = snapshot.data();
      if (reservation.status !== 'confirmed') throw new Error('Reservation is not confirmed');
      if (reservation.confirmationEmailSent) return { skip: true, alreadySent: true };
      const sendingAt = reservation.confirmationEmailSendingAt?.toMillis?.() || 0;
      if (sendingAt > Date.now() - 5 * 60 * 1000) return { skip: true, pending: true };
      transaction.update(reservationRef, {
        confirmationEmailSendingAt: FieldValue.serverTimestamp(),
        confirmationEmailError: FieldValue.delete(),
      });
      return { reservation };
    });

    if (claim.skip) return { sent: false, alreadySent: !!claim.alreadySent, pending: !!claim.pending };

    const reservation = { id: reservationId, ...claim.reservation };
    if (!(reservation.email || reservation.guestEmail)) throw new Error('Guest email address is missing');
    await sendReservationConfirmationEmail(reservation, reservationId.slice(0, 8).toUpperCase());
    await reservationRef.update({
      confirmationEmailSent: true,
      confirmationEmailSentAt: FieldValue.serverTimestamp(),
      confirmationEmailSendingAt: FieldValue.delete(),
      confirmationEmailError: FieldValue.delete(),
    });
    return { sent: true };
  } catch (error) {
    await reservationRef.update({
      confirmationEmailSendingAt: FieldValue.delete(),
      confirmationEmailError: String(error.message || 'Email delivery failed').slice(0, 500),
    }).catch(() => {});
    throw error;
  }
}
