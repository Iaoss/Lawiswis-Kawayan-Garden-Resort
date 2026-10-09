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
//   2. Date-overlap check  — prevents two guests from booking the same
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

import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendReservationPendingEmail } from '../lib/email';
import { NAME_PATTERN, joinGuestName, splitGuestName } from '../src/lib/nameValidation';
import { evaluatePromo, normalizePromoCode } from '../lib/promoPolicy';
import {
  calculateBookingPrice,
  COTTAGE_OPTIONS,
  DAYTOUR_TIME_SLOT,
  NIGHTTOUR_TIME_SLOT,
  OVERNIGHT_TIME_SLOTS,
} from '../src/lib/bookingPricing';

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonthsClamped(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

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
      firstName,
      lastName,
      guestName,
      email,
      phone,
      address,
      checkIn,
      checkOut,
      checkInTime,
      checkOutTime,
      adults,
      children,
      bookingType,
      tourPeriod,
      cottageId,
      cottageFee,
      notes,
      paymentMethod,
      promoCode: submittedPromoCode,
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

    const availabilitySnap = await adminDb.doc('siteSettings/resortAvailability').get();
    if (availabilitySnap.exists && availabilitySnap.data().available === false) {
      const reason = String(availabilitySnap.data().reason || '').trim();
      return res.status(409).json({
        error: reason
          ? `Reservations are temporarily closed. ${reason}`
          : 'Reservations are temporarily closed. Please contact the resort for updates.',
      });
    }

    // ---- 2. Basic validation -------------------------------------------
    if (typeof roomId !== 'string' || typeof email !== 'string'
      || typeof phone !== 'string' || typeof checkIn !== 'string' || typeof checkOut !== 'string'
      || !roomId || !email.trim() || !phone || !checkIn || !checkOut || !paymentMethod) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }
    if ((address !== undefined && typeof address !== 'string')
      || (notes !== undefined && typeof notes !== 'string')) {
      return res.status(400).json({ error: 'Address and special requests must be text.' });
    }
    const legacyNameParts = typeof guestName === 'string' ? splitGuestName(guestName) : {};
    const normalizedFirstName = String(firstName ?? legacyNameParts.firstName ?? '').trim();
    const normalizedLastName = String(lastName ?? legacyNameParts.lastName ?? '').trim();
    if (!NAME_PATTERN.test(normalizedFirstName) || !NAME_PATTERN.test(normalizedLastName)) {
      return res.status(400).json({ error: 'Enter a valid first and last name (2-35 letters each).' });
    }
    const normalizedGuestName = joinGuestName(normalizedFirstName, normalizedLastName);
    if (!/^09\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 11-digit mobile number.' });
    }
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
      return res.status(400).json({ error: 'Guest counts must be whole numbers.' });
    }
    if (!['daytour', 'overnight'].includes(bookingType)) {
      return res.status(400).json({ error: 'Choose a valid booking type.' });
    }
    const timeSlot = bookingType === 'daytour'
      ? (tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT)
      : OVERNIGHT_TIME_SLOTS.find(slot => slot.checkIn === checkInTime && slot.checkOut === checkOutTime);
    if (!timeSlot || (bookingType === 'daytour' && (checkInTime !== timeSlot.checkIn || checkOutTime !== timeSlot.checkOut))) {
      return res.status(400).json({ error: 'Choose a valid check-in and check-out time.' });
    }
    if (bookingType === 'daytour' && !['day', 'night'].includes(tourPeriod)) {
      return res.status(400).json({ error: 'Choose a valid swimming tour period.' });
    }
    const requestedCottageFee = Number(cottageFee || 0);
    if (!COTTAGE_OPTIONS.some(option => option.id === (cottageId || '') && option.prices.includes(requestedCottageFee))) {
      return res.status(400).json({ error: 'Choose a valid cottage rate.' });
    }
    if (paymentMethod !== 'online') {
      return res.status(400).json({ error: 'Reservations must be paid online through PayMongo.' });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const checkInDate = new Date(`${checkIn}T00:00:00`);
    const checkOutDate = new Date(`${checkOut}T00:00:00`);
    if (!datePattern.test(checkIn) || !datePattern.test(checkOut)
      || isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())
      || dateKey(checkInDate) !== checkIn || dateKey(checkOutDate) !== checkOut
      || checkOut <= checkIn) {
      return res.status(400).json({ error: 'Please select a valid check-in and check-out date.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxBookingDate = dateKey(addMonthsClamped(today, 2));
    if (checkIn < dateKey(today) || checkOut > maxBookingDate) {
      return res.status(400).json({ error: `Choose check-in and check-out dates from today through ${maxBookingDate}.` });
    }

    const emailLower = String(email).trim().toLowerCase();
    // ---- 4. Confirm the room exists and get its price -------------------
    const roomSnap = await adminDb.collection('rooms').doc(roomId).get();
    if (!roomSnap.exists) {
      return res.status(404).json({ error: 'This room could not be found.' });
    }
    const room = roomSnap.data();
    const maxCapacity = Number(room.maxCapacity ?? room.maximumCapacity ?? room.maxGuests);
    if (Number.isInteger(maxCapacity) && maxCapacity > 0 && adults + children > maxCapacity) {
      return res.status(400).json({ error: `This room allows up to ${maxCapacity} guests.` });
    }

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
    const pricing = calculateBookingPrice({
      room,
      bookingType,
      nights,
      adults,
      children,
      tourPeriod: bookingType === 'daytour' ? tourPeriod : 'day',
      cottageId: cottageId || '',
      cottageFee: requestedCottageFee,
    });
    const totalAmount = pricing.subtotalAmount;

    const docRef = adminDb.collection('reservations').doc();
    const promoCode = normalizePromoCode(submittedPromoCode);
    const reservationData = {
      roomId,
      roomNumber: room.roomNumber,
      roomType: room.type,
      guestName: normalizedGuestName,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email,
      emailLower,
      phone,
      address: address || '',
      checkIn,
      checkOut,
      checkInTime: timeSlot.checkIn,
      checkOutTime: timeSlot.checkOut,
      adults,
      children,
      bookingType,
      tourPeriod: bookingType === 'daytour' ? tourPeriod : '',
      baseCapacity: pricing.baseCapacity,
      baseRate: pricing.baseRate,
      totalGuests: pricing.totalGuests,
      extraGuests: pricing.extraGuests,
      extraGuestCharge: pricing.extraGuestCharge,
      cottageId: pricing.cottageId,
      cottageFee: pricing.cottageFee,
      notes: notes || '',
      paymentMethod,
      subtotalAmount: totalAmount,
      nights,
      type: 'online',
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    };
    let discountAmount = 0;
    let discountedTotal = totalAmount;

    if (promoCode) {
      if (!/^[A-Z0-9_-]{3,32}$/.test(promoCode)) {
        return res.status(422).json({ error: 'Invalid code' });
      }
      const promoRef = adminDb.collection('promoCodes').doc(promoCode);
      try {
        await adminDb.runTransaction(async transaction => {
          const promoSnapshot = await transaction.get(promoRef);
          const promo = promoSnapshot.exists ? { code: promoSnapshot.id, ...promoSnapshot.data() } : null;
          const result = evaluatePromo(promo, totalAmount);
          if (!result.valid) {
            const error = new Error(result.error);
            error.promoValidation = true;
            throw error;
          }
          discountAmount = result.discountAmount;
          discountedTotal = result.totalAmount;
          transaction.create(docRef, {
            ...reservationData,
            totalAmount: discountedTotal,
            promoCode,
            promoDiscount: discountAmount,
          });
          transaction.update(promoRef, {
            usageCount: Number(promo.usageCount || 0) + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (error) {
        if (error.promoValidation) return res.status(422).json({ error: error.message });
        throw error;
      }
    } else {
      await docRef.create({ ...reservationData, totalAmount, promoCode: '', promoDiscount: 0 });
    }

    // ---- 7. Send the "reservation received" email --------------------------
    // Wrapped separately so an email-sending failure (bad API key, Resend
    // outage, etc.) never breaks the actual booking — the guest still gets
    // their reservation even if this email doesn't go out. Errors are
    // logged so you can spot delivery problems in Vercel's function logs.
    try {
      const bookingRef = docRef.id.slice(0, 8).toUpperCase();
      await sendReservationPendingEmail(
        {
          guestName: normalizedGuestName,
          email,
          roomNumber: room.roomNumber,
          roomType: room.type,
          checkIn,
          checkOut,
          totalAmount: discountedTotal,
          nights,
          paymentMethod,
        },
        bookingRef
      );
    } catch (emailErr) {
      console.error('Failed to send reservation-received email:', emailErr);
    }

    return res.status(200).json({
      reservationId: docRef.id,
      subtotalAmount: totalAmount,
      discountAmount,
      totalAmount: discountedTotal,
      promoCode,
      nights,
      pricing,
    });
  } catch (err) {
    console.error('create-reservation error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}