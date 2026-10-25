import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { sendConfirmationEmailOnce } from '../lib/confirmationEmail';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });

  const { reservationId } = req.body || {};
  if (!reservationId || !adminDb) return res.status(400).json({ error: 'A valid reservationId is required.' });

  try {
    return res.status(200).json(await sendConfirmationEmailOnce(adminDb, FieldValue, reservationId));
  } catch (error) {
    console.error('Reservation confirmation email failed:', error);
    return res.status(500).json({ error: error.message || 'Could not send the confirmation email.' });
  }
}
