// api/send-confirmation-email.js
//
// Sends the "payment confirmed / booking confirmed" email for an existing
// reservation. Call this from:
//   - your PayMongo webhook, once it verifies a payment actually cleared
//   - a "Confirm" button in the staff admin panel, for cash bookings
//
// This does NOT create or modify the reservation — it only sends the email.
// Update the reservation's status/paymentStatus separately (wherever you're
// calling this from) before or after calling it.
//
// Usage:
//   POST /api/send-confirmation-email
//   body: { "reservationId": "abc123" }

import { adminDb } from '../lib/firebaseAdmin';
import { sendPaymentConfirmedEmail } from '../lib/email';
import { verifyStaff } from '../lib/verifyStaff';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Staff only. Without this, anyone with a booking ID could trigger a
  // "payment confirmed" email for a booking that was never paid.
  if (!(await verifyStaff(req))) {
    return res.status(401).json({ error: 'Only resort staff can send confirmation emails.' });
  }

  try {
    const { reservationId } = req.body || {};
    if (!reservationId) {
      return res.status(400).json({ error: 'reservationId is required.' });
    }

    const snap = await adminDb.collection('reservations').doc(reservationId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = snap.data();
    // The email says the payment is confirmed, so it must match the records.
    const status = String(reservation.status || '').toLowerCase();
    if (Number(reservation.amountPaid || 0) <= 0 && !['confirmed', 'checked-in', 'checked-out'].includes(status)) {
      return res.status(409).json({ error: 'This reservation has no recorded payment yet.' });
    }
    const bookingRef = reservationId.slice(0, 8).toUpperCase();

    await sendPaymentConfirmedEmail(reservation, bookingRef);

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('send-confirmation-email error:', err);
    return res.status(500).json({ error: 'Could not send confirmation email.' });
  }
}
