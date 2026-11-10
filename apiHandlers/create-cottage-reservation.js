// POST /api/create-cottage-reservation
//
// A day tour or night tour with just a cottage (no room). Guests pay the
// swimming entrance per person plus the cottage, online through PayMongo
// like room bookings. Priced and checked here; the browser only sends the
// guest's choices.

import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendReservationPendingEmail } from '../lib/email';
import { getCottageAvailabilityFor } from '../lib/cottageStock';
import { NAME_PATTERN, joinGuestName } from '../src/lib/nameValidation';
import { getContactLinkError, isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import {
  DAYTOUR_TIME_SLOT,
  NIGHTTOUR_TIME_SLOT,
  calculateCottageTourPrice,
  getResortNow,
  getTourCutoffError,
} from '../src/lib/bookingPricing';
import { cottageAvailabilityError } from '../src/lib/cottages';
import { closedPeriodMessage, findClosedPeriod } from '../src/lib/closedDates';

const addMonthsKey = (dateKey, months) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d, lastDay));
  return result.toISOString().slice(0, 10);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Booking is temporarily unavailable.' });

  try {
    const {
      firstName, lastName, email, phone, preferredContactMethod, contactLink,
      date, tourPeriod, adults, children, cottageId, notes, website,
    } = req.body || {};

    if (website) return res.status(200).json({ reservationId: 'PENDING-REVIEW', totalAmount: 0 });

    const availabilitySnap = await adminDb.doc('siteSettings/resortAvailability').get();
    if (availabilitySnap.exists && availabilitySnap.data().available === false) {
      const reason = String(availabilitySnap.data().reason || '').trim();
      return res.status(409).json({ error: reason ? `Reservations are temporarily closed. ${reason}` : 'Reservations are temporarily closed.' });
    }
    // Planned closed dates (maintenance): other dates can still be booked.
    const closedPeriod = availabilitySnap.exists ? findClosedPeriod(availabilitySnap.data().closedDates, date, date) : null;
    if (closedPeriod) return res.status(409).json({ error: closedPeriodMessage(closedPeriod) });

    const first = String(firstName || '').trim();
    const last = String(lastName || '').trim();
    if (!NAME_PATTERN.test(first) || !NAME_PATTERN.test(last)) {
      return res.status(400).json({ error: 'Enter a valid first and last name (2-35 letters each).' });
    }
    const emailValue = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) || emailValue.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (typeof phone !== 'string' || !/^09\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 11-digit mobile number.' });
    }
    if (!isPreferredContactMethod(preferredContactMethod)) {
      return res.status(400).json({ error: 'Please choose a preferred contact method.' });
    }
    const linkError = getContactLinkError(preferredContactMethod, contactLink);
    if (linkError) return res.status(400).json({ error: linkError });
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
      return res.status(400).json({ error: 'Special requests must be 1,000 characters or fewer.' });
    }
    if (!['day', 'night'].includes(tourPeriod)) {
      return res.status(400).json({ error: 'Choose a day tour or a night tour.' });
    }

    const today = getResortNow().dateKey;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addMonthsKey(today, 2)) {
      return res.status(400).json({ error: 'Choose a tour date from today up to two months ahead.' });
    }
    const cutoff = getTourCutoffError(date, tourPeriod);
    if (cutoff) return res.status(400).json({ error: cutoff });

    let pricing;
    try {
      pricing = calculateCottageTourPrice({ adults, children, tourPeriod, cottageId });
    } catch (priceError) {
      return res.status(400).json({ error: priceError.message });
    }

    const availability = await getCottageAvailabilityFor(date, tourPeriod);
    const fullError = cottageAvailabilityError(availability, cottageId);
    if (fullError) return res.status(409).json({ error: fullError });

    const slot = tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT;
    const guestName = joinGuestName(first, last);
    const tourLabel = tourPeriod === 'night' ? 'Night tour' : 'Day tour';
    const docRef = adminDb.collection('reservations').doc();
    const reservation = {
      // No room: the cottage is what's booked. roomNumber/roomType carry
      // its name so staff lists and emails read naturally.
      cottageOnly: true,
      roomId: '',
      roomNumber: `${pricing.cottageLabel} (cottage)`,
      roomType: `Cottage · ${tourLabel.toLowerCase()}`,
      guestName,
      firstName: first,
      lastName: last,
      email: emailValue,
      emailLower: emailValue.toLowerCase(),
      phone,
      preferredContactMethod,
      contactLink: preferredContactMethod === 'Facebook Messenger' ? String(contactLink).trim() : '',
      checkIn: date,
      checkOut: date,
      checkInTime: slot.checkIn,
      checkOutTime: slot.checkOut,
      bookingType: 'daytour',
      tourPeriod,
      adults,
      children,
      totalGuests: pricing.totalGuests,
      nights: 1,
      cottageId,
      cottageFee: pricing.cottageFee,
      entranceAdultRate: pricing.entranceAdultRate,
      entranceChildRate: pricing.entranceChildRate,
      entranceFee: pricing.entranceFee,
      subtotalAmount: pricing.subtotalAmount,
      totalAmount: pricing.subtotalAmount,
      promoCode: '',
      promoDiscount: 0,
      notes: String(notes || '').trim(),
      paymentMethod: 'online',
      type: 'online',
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    };
    await docRef.create(reservation);

    try {
      await sendReservationPendingEmail({
        guestName, email: emailValue, roomNumber: reservation.roomNumber, roomType: reservation.roomType,
        checkIn: date, checkOut: date, totalAmount: pricing.subtotalAmount, nights: 1, paymentMethod: 'online',
        stayLabel: `${pricing.cottageLabel} cottage · ${tourLabel.toLowerCase()} for ${pricing.totalGuests}`,
      }, docRef.id.slice(0, 8).toUpperCase());
    } catch (emailError) {
      console.error('Cottage booking email failed:', emailError);
    }

    return res.status(200).json({ reservationId: docRef.id, totalAmount: pricing.subtotalAmount, pricing });
  } catch (error) {
    console.error('create-cottage-reservation error:', error);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}
