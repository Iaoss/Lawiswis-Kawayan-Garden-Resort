// POST /api/booking-reply  { id, token, answer: 'yes' | 'no' }
//
// The guest's answer to "Did you make this reservation?" (the email staff
// send for unpaid online bookings). The token from the email proves the
// answer comes from the guest's inbox. Staff see the answer in the
// reservation list and the notification bell.

import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { isUnpaidOnlineBooking } from '../src/lib/unpaidBookings';

function sameToken(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!adminDb) return res.status(503).json({ error: 'This service is temporarily unavailable.' });

  const { id, token, answer } = req.body || {};
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(id) || typeof token !== 'string' || !['yes', 'no'].includes(answer)) {
    return res.status(400).json({ error: 'This link is not valid.' });
  }

  try {
    const ref = adminDb.collection('reservations').doc(id);
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const reservation = snapshot.exists ? snapshot.data() : null;
      if (!reservation || !sameToken(reservation.unpaidFollowUp?.verifyToken, token)) {
        return { status: 404, body: { error: 'This link is not valid or has expired.' } };
      }
      const bookingRef = id.slice(0, 8).toUpperCase();
      if (!isUnpaidOnlineBooking(reservation)) {
        return { status: 200, body: { done: true, bookingRef, state: String(reservation.status || '').toLowerCase() } };
      }
      transaction.update(ref, {
        'unpaidFollowUp.guestReply': answer,
        'unpaidFollowUp.guestRepliedAt': FieldValue.serverTimestamp(),
      });
      return { status: 200, body: { saved: true, answer, bookingRef } };
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Booking reply failed:', error);
    return res.status(500).json({ error: 'Your answer could not be saved. Please try again.' });
  }
}
