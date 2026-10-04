import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendReservationConfirmationEmail } from '../lib/email';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  const { reservationId } = req.body || {};
  if (!reservationId || !adminDb) return res.status(400).json({ error: 'A valid reservationId is required.' });

  const reservationRef = adminDb.collection('reservations').doc(reservationId);
  try {
    const claim = await adminDb.runTransaction(async transaction => {
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

    if (claim.skip) return res.status(200).json({ sent: false, alreadySent: !!claim.alreadySent, pending: !!claim.pending });

    const reservation = { id: reservationId, ...claim.reservation };
    if (!(reservation.email || reservation.guestEmail)) throw new Error('Guest email address is missing');
    await sendReservationConfirmationEmail(reservation, reservationId.slice(0, 8).toUpperCase());
    await reservationRef.update({
      confirmationEmailSent: true,
      confirmationEmailSentAt: FieldValue.serverTimestamp(),
      confirmationEmailSendingAt: FieldValue.delete(),
      confirmationEmailError: FieldValue.delete(),
    });
    return res.status(200).json({ sent: true });
  } catch (error) {
    await reservationRef.update({
      confirmationEmailSendingAt: FieldValue.delete(),
      confirmationEmailError: String(error.message || 'Email delivery failed').slice(0, 500),
    }).catch(() => {});
    console.error('Reservation confirmation email failed:', error);
    return res.status(500).json({ error: error.message || 'Could not send the confirmation email.' });
  }
}
