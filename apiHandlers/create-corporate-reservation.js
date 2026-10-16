import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendReservationPendingEmail } from '../lib/email';
import { getCorporatePackage } from '../src/lib/corporatePackages';
import { NAME_PATTERN, joinGuestName, splitGuestName } from '../src/lib/nameValidation';
import { getStayDurationError } from '../src/lib/bookingPricing';
import { isPreferredContactMethod } from '../src/lib/preferredContactMethods';

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonthsClamped(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(500).json({ error: 'Firebase Admin is not configured' });

  try {
    const {
      companyName,
      firstName,
      lastName,
      guestName,
      email,
      phone,
      preferredContactMethod,
      totalGuests,
      bookingType,
      checkIn,
      checkOut,
      accommodationInterest,
      notes,
    } = req.body || {};

    const availabilitySnap = await adminDb.doc('siteSettings/resortAvailability').get();
    if (availabilitySnap.exists && availabilitySnap.data().available === false) {
      const reason = String(availabilitySnap.data().reason || '').trim();
      return res.status(409).json({
        error: reason
          ? `Reservations are temporarily closed. ${reason}`
          : 'Reservations are temporarily closed. Please contact the resort for updates.',
      });
    }

    if (typeof companyName !== 'string' || !companyName.trim() || companyName.trim().length > 120
      || typeof email !== 'string' || !email.trim() || email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || typeof phone !== 'string' || !/^09\d{9}$/.test(phone)
      || !isPreferredContactMethod(preferredContactMethod)
      || !Number.isSafeInteger(totalGuests) || !getCorporatePackage(totalGuests)
      || !['daytour', 'overnight'].includes(bookingType)
      || typeof checkIn !== 'string' || typeof checkOut !== 'string'
      || (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000))
      || (accommodationInterest !== undefined && typeof accommodationInterest !== 'boolean')) {
      return res.status(400).json({ error: 'Please provide valid group, contact, and stay details.' });
    }

    const nameParts = typeof guestName === 'string' ? splitGuestName(guestName) : {};
    const contactFirstName = String(firstName ?? nameParts.firstName ?? '').trim();
    const contactLastName = String(lastName ?? nameParts.lastName ?? '').trim();
    if (!NAME_PATTERN.test(contactFirstName) || !NAME_PATTERN.test(contactLastName)) {
      return res.status(400).json({ error: 'Enter a valid first and last name (2-35 letters each).' });
    }
    const normalizedGuestName = joinGuestName(contactFirstName, contactLastName);

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const checkInDate = new Date(`${checkIn}T00:00:00`);
    const checkOutDate = new Date(`${checkOut}T00:00:00`);
    const isDayTour = bookingType === 'daytour';
    if (!datePattern.test(checkIn) || !datePattern.test(checkOut)
      || Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())
      || dateKey(checkInDate) !== checkIn || dateKey(checkOutDate) !== checkOut
      || (isDayTour ? checkOut !== checkIn : checkOut <= checkIn)) {
      return res.status(400).json({ error: 'Choose a valid event date or check-in and check-out dates.' });
    }

    const stayError = isDayTour ? '' : getStayDurationError(checkIn, checkOut);
    if (stayError) return res.status(400).json({ error: stayError });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxBookingDate = dateKey(addMonthsClamped(today, 2));
    if (checkIn < dateKey(today) || checkOut > maxBookingDate) {
      return res.status(400).json({ error: `Choose dates from today through ${maxBookingDate}.` });
    }

    const packageDetails = getCorporatePackage(totalGuests);
    const nights = isDayTour ? 1 : Math.ceil((checkOutDate - checkInDate) / 86400000);
    const totalAmount = packageDetails.totalAmount;
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'The group total is outside the supported booking range.' });
    }

    const reservationRef = adminDb.collection('reservations').doc();
    const reservation = {
      type: 'corporate',
      bookingType: 'corporate',
      companyName: companyName.trim(),
      packageId: packageDetails.id,
      packageName: packageDetails.name,
      packageRate: packageDetails.ratePerGuest,
      roomNumber: packageDetails.name,
      roomType: 'Corporate / Big Group Booking',
      guestName: normalizedGuestName,
      firstName: contactFirstName,
      lastName: contactLastName,
      email: email.trim(),
      emailLower: email.trim().toLowerCase(),
      phone,
      preferredContactMethod,
      checkIn,
      checkOut,
      checkInTime: isDayTour ? 'Flexible day-tour arrival' : 'Flexible check-in',
      checkOutTime: isDayTour ? 'Flexible day-tour departure' : 'Flexible check-out',
      adults: totalGuests,
      children: 0,
      totalGuests,
      nights,
      totalAmount,
      subtotalAmount: totalAmount,
      amountPaid: 0,
      extraCharges: 0,
      paymentMethod: 'online',
      paymentStatus: 'pending',
      status: 'pending',
      accommodationInterest: Boolean(accommodationInterest),
      notes: typeof notes === 'string' ? notes.trim() : '',
      createdAt: FieldValue.serverTimestamp(),
    };
    await reservationRef.create(reservation);

    try {
      await sendReservationPendingEmail({
        guestName: normalizedGuestName,
        email: email.trim(),
        roomNumber: packageDetails.name,
        roomType: `${totalGuests}-guest group package`,
        checkIn,
        checkOut,
        totalAmount,
        nights,
        paymentMethod: 'online',
      }, reservationRef.id.slice(0, 8).toUpperCase());
    } catch (emailError) {
      console.error('Failed to send corporate reservation-received email:', emailError);
    }

    return res.status(200).json({ reservationId: reservationRef.id, totalAmount, packageName: packageDetails.name });
  } catch (error) {
    console.error('create-corporate-reservation error:', error);
    return res.status(500).json({ error: 'Could not create the group reservation. Please try again.' });
  }
}
