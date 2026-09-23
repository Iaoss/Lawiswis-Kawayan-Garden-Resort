// api/create-reservation.js
//
// Creates a reservation on the server, using the Firebase Admin SDK.
//
// This replaces the old client-side `addDoc(collection(db,'reservations'),...)`
// call. Doing it server-side lets us run three protections that a bot
// submitting requests directly (skipping your page's JS) can't bypass:
//
//   1. Honeypot check      — rejects submissions that filled a field real
//                             guests never see.
//   2. Rate limiting       — blocks an email address from flooding the
//                             system with repeated reservations.
//   3. Date-overlap check  — prevents two guests from booking the same
//                             room for overlapping dates (the bug that
//                             used to exist when the client blindly set
//                             room.status = 'occupied' on every booking,
//                             regardless of which dates were picked).
//
// NOTE ON ROOM STATUS: this function intentionally does NOT touch
// room.status anymore. Availability is now determined by checking actual
// reservation date ranges (see checkOverlap below), not a single blanket
// status flag on the room document. room.status should be reserved for
// staff-managed operational state (e.g. "maintenance", "cleaning") in the
// admin dashboard — not flipped automatically per booking.

import { adminDb, FieldValue } from '../src/lib/firebaseAdmin';
import { sendReservationPendingEmail } from './email';

const MAX_RESERVATIONS_PER_EMAIL_PER_DAY = 3;

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  // Two date ranges overlap if one starts before the other ends, both ways.
  return aStart < bEnd && aEnd > bStart;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      roomId,
      guestName,
      email,
      phone,
      address,
      checkIn,
      checkOut,
      adults,
      children,
      notes,
      paymentMethod,
      website, // honeypot field — real guests never fill this in
    } = req.body || {};

    // ---- 1. Honeypot check -------------------------------------------
    // A hidden field on the form that only an automated script filling
    // every input would populate. We respond as if it worked so the bot
    // doesn't learn to detect and skip this check next time.
    if (website) {
      console.warn('Honeypot triggered — likely bot submission, silently ignored.');
      return res.status(200).json({
        reservationId: 'PENDING-REVIEW',
        totalAmount: 0,
        nights: 0,
      });
    }

    // ---- 2. Basic validation -------------------------------------------
    if (!roomId || !guestName || !email || !phone || !checkIn || !checkOut || !paymentMethod) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
      return res.status(400).json({ error: 'Please select a valid check-in and check-out date.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkInDate < today) {
      return res.status(400).json({ error: 'Check-in date cannot be in the past.' });
    }

    // ---- 3. Rate limiting by email --------------------------------------
    // Equality-only query (no range filter) so this never needs a
    // composite Firestore index; we filter the last-24h window in code.
    const emailLower = String(email).trim().toLowerCase();
    const emailSnap = await adminDb
      .collection('reservations')
      .where('emailLower', '==', emailLower)
      .get();

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = emailSnap.docs.filter((d) => {
      const createdAt = d.data().createdAt;
      return createdAt && createdAt.toMillis() >= oneDayAgo;
    }).length;

    if (recentCount >= MAX_RESERVATIONS_PER_EMAIL_PER_DAY) {
      return res.status(429).json({
        error:
          'You already have several reservations submitted recently. Please wait for a confirmation email, or contact the resort directly if you need help.',
      });
    }

    // ---- 4. Confirm the room exists and get its price -------------------
    const roomSnap = await adminDb.collection('rooms').doc(roomId).get();
    if (!roomSnap.exists) {
      return res.status(404).json({ error: 'This room could not be found.' });
    }
    const room = roomSnap.data();

    // ---- 5. Date-overlap check against existing reservations ------------
    const roomResSnap = await adminDb
      .collection('reservations')
      .where('roomId', '==', roomId)
      .get();

    const hasOverlap = roomResSnap.docs.some((d) => {
      const r = d.data();
      if (r.status === 'cancelled') return false; // cancelled bookings free up the dates
      const existingIn = new Date(r.checkIn);
      const existingOut = new Date(r.checkOut);
      return datesOverlap(checkInDate, checkOutDate, existingIn, existingOut);
    });

    if (hasOverlap) {
      return res.status(409).json({
        error: 'Sorry, this room is already booked for part of your selected dates. Please choose different dates.',
      });
    }

    // ---- 6. Create the reservation ---------------------------------------
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * Number(room.price);

    const docRef = await adminDb.collection('reservations').add({
      roomId,
      roomNumber: room.roomNumber,
      roomType: room.type,
      guestName,
      email,
      emailLower,
      phone,
      address: address || '',
      checkIn,
      checkOut,
      adults: adults || 1,
      children: children || 0,
      notes: notes || '',
      paymentMethod,
      totalAmount,
      nights,
      type: 'online',
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    // ---- 7. Send the "reservation received" email --------------------------
    // Wrapped separately so an email-sending failure (bad API key, Resend
    // outage, etc.) never breaks the actual booking — the guest still gets
    // their reservation even if this email doesn't go out. Errors are
    // logged so you can spot delivery problems in Vercel's function logs.
    try {
      const bookingRef = docRef.id.slice(0, 8).toUpperCase();
      await sendReservationPendingEmail(
        {
          guestName,
          email,
          roomNumber: room.roomNumber,
          roomType: room.type,
          checkIn,
          checkOut,
          totalAmount,
          nights,
          paymentMethod,
        },
        bookingRef
      );
    } catch (emailErr) {
      console.error('Failed to send reservation-received email:', emailErr);
    }

    return res.status(200).json({ reservationId: docRef.id, totalAmount, nights });
  } catch (err) {
    console.error('create-reservation error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}