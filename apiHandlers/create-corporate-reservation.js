import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendReservationPendingEmail } from '../lib/email';
import { getCorporateNights, getCorporatePackage, getGroupAdvanceNoticeError, getGroupGuestError } from '../src/lib/corporatePackages';
import { NAME_PATTERN, joinGuestName, splitGuestName } from '../src/lib/nameValidation';
import { getResortNow, getStayDurationError } from '../src/lib/bookingPricing';
import { getContactLinkError, isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import { closedPeriodMessage, findClosedPeriod } from '../src/lib/closedDates';
import { normalizeAgencyDetails } from '../src/lib/agencyBilling';

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonthsClamped(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

const reply = (code, json) => ({ code, json });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(500).json({ error: 'Firebase Admin is not configured' });
  const { code, json } = await createCorporateReservation(req.body);
  return res.status(code).json(json);
}

// Used by the website (guest) and by staff at the desk (walk-in group: no
// 7-day notice, confirmed straight away, paid at the counter or online).
export async function createCorporateReservation(body, staff = null) {
  try {
    const {
      companyName,
      firstName,
      lastName,
      guestName,
      email,
      phone,
      preferredContactMethod,
      contactLink,
      totalGuests,
      bookingType,
      checkIn,
      checkOut,
      accommodationInterest,
      notes,
      clientType,
      agency,
    } = body || {};
    // Government agencies (per diem): no online deposit, billed to the agency.
    const isGovernment = clientType === 'government';
    const agencyDetails = isGovernment ? normalizeAgencyDetails(agency || {}) : { value: null };
    if (agencyDetails.error) return reply(400, { error: agencyDetails.error });

    const availabilitySnap = await adminDb.doc('siteSettings/resortAvailability').get();
    if (availabilitySnap.exists && availabilitySnap.data().available === false) {
      const reason = String(availabilitySnap.data().reason || '').trim();
      return reply(409, {
        error: reason
          ? `Reservations are temporarily closed. ${reason}`
          : 'Reservations are temporarily closed. Please contact the resort for updates.',
      });
    }
    // Planned closed dates (maintenance): other dates can still be booked.
    const closedPeriod = availabilitySnap.exists ? findClosedPeriod(availabilitySnap.data().closedDates, checkIn, checkOut) : null;
    if (closedPeriod) return reply(409, { error: closedPeriodMessage(closedPeriod) });

    // Group size: 15 to 250 guests, with a clear message either way.
    const guestError = getGroupGuestError(totalGuests);
    if (guestError) return reply(400, { error: guestError });

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
      return reply(400, { error: 'Please provide valid group, contact, and stay details.' });
    }

    const contactLinkError = getContactLinkError(preferredContactMethod, contactLink);
    if (contactLinkError) return reply(400, { error: contactLinkError });

    const nameParts = typeof guestName === 'string' ? splitGuestName(guestName) : {};
    const contactFirstName = String(firstName ?? nameParts.firstName ?? '').trim();
    const contactLastName = String(lastName ?? nameParts.lastName ?? '').trim();
    if (!NAME_PATTERN.test(contactFirstName) || !NAME_PATTERN.test(contactLastName)) {
      return reply(400, { error: 'Enter a valid first and last name (2-35 letters each).' });
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
      return reply(400, { error: 'Choose a valid event date or check-in and check-out dates.' });
    }

    const stayError = isDayTour ? '' : getStayDurationError(checkIn, checkOut);
    if (stayError) return reply(400, { error: stayError });

    // "Today" is the Philippine date (the server runs in UTC).
    const today = new Date(`${getResortNow().dateKey}T00:00:00`);
    const maxBookingDate = dateKey(addMonthsClamped(today, 2));
    if (checkIn < dateKey(today) || checkOut > maxBookingDate) {
      return reply(400, { error: `Choose dates from today through ${maxBookingDate}.` });
    }
    // Groups book at least a week ahead so the areas can be prepared.
    // Staff booking a walk-in group at the desk: no 7-day notice needed.
    const noticeError = staff ? '' : getGroupAdvanceNoticeError(checkIn);
    if (noticeError) return reply(400, { error: noticeError, code: 'GROUP_ADVANCE_NOTICE' });

    // Priced per night: guests × rate per guest × nights (day tour = 1).
    const nights = getCorporateNights(bookingType, checkIn, checkOut);
    if (nights < 1) return reply(400, { error: 'Choose a check-out date after check-in.' });
    const packageDetails = getCorporatePackage(totalGuests, nights);
    const totalAmount = packageDetails.totalAmount;
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      return reply(400, { error: 'The group total is outside the supported booking range.' });
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
      contactLink: preferredContactMethod === 'Facebook Messenger' ? String(contactLink).trim() : '',
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
      paymentMethod: isGovernment ? 'agency' : staff ? 'cash' : 'online',
      paymentStatus: 'pending',
      clientType: isGovernment ? 'government' : 'private',
      ...(isGovernment ? {
        chargeToAgency: true,
        // A PO typed on the website is kept aside until staff check it in
        // Billing; only a staff-saved PO lets the group stay on credit.
        agencyBilling: staff
          ? { ...agencyDetails.value, ...(agencyDetails.value.poNumber ? { poSavedAt: FieldValue.serverTimestamp(), poSavedBy: staff.uid } : {}) }
          : { ...agencyDetails.value, poNumber: '', guestPoNumber: agencyDetails.value.poNumber },
      } : {}),
      status: staff ? 'confirmed' : 'pending',
      ...(staff ? { source: 'walk-in', createdBy: staff.uid, createdByName: staff.name || staff.email || '' } : {}),
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
        paymentMethod: isGovernment ? 'agency' : staff ? 'cash' : 'online',
      }, reservationRef.id.slice(0, 8).toUpperCase());
    } catch (emailError) {
      console.error('Failed to send corporate reservation-received email:', emailError);
    }

    return reply(200, { reservationId: reservationRef.id, totalAmount, packageName: packageDetails.name, chargeToAgency: isGovernment });
  } catch (error) {
    console.error('create-corporate-reservation error:', error);
    return reply(500, { error: 'Could not create the group reservation. Please try again.' });
  }
}
