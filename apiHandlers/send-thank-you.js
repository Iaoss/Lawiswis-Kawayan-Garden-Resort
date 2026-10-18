import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendThankYouEmail } from '../lib/email';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  const { reservationId } = req.body || {};
  if (typeof reservationId !== 'string' || !reservationId || !adminDb) {
    return res.status(400).json({ error: 'A valid reservationId is required.' });
  }

  try {
    const ref = adminDb.collection('reservations').doc(reservationId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ error: 'Reservation not found.' });
    const reservation = snapshot.data();
    if (reservation.status !== 'checked-out') return res.status(400).json({ error: 'Reservation is not checked out.' });
    if (reservation.thankYouEmailSent) return res.status(200).json({ sent: false, alreadySent: true });
    if (!(reservation.email || reservation.guestEmail)) return res.status(400).json({ error: 'Guest email address is missing.' });

    const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;
    const feedbackUrl = `${siteUrl}/feedback?bookingId=${encodeURIComponent(reservationId)}`;
    await sendThankYouEmail(reservation, reservationId.slice(0, 8).toUpperCase(), feedbackUrl);
    await ref.update({ thankYouEmailSent: true, thankYouEmailSentAt: FieldValue.serverTimestamp() });
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('Thank-you email failed:', error);
    return res.status(500).json({ error: 'Could not send the thank-you email.' });
  }
}
