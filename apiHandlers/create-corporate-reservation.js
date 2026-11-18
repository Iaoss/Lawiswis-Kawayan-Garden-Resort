import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { sendReservationPendingEmail } from '../lib/email';
import { getCorporateNights, getCorporatePackage, getGroupAdvanceNoticeError, getGroupGuestError } from '../src/lib/corporatePackages';
import { NAME_PATTERN, joinGuestName, splitGuestName } from '../src/lib/nameValidation';
import { getResortNow, getStayDurationError } from '../src/lib/bookingPricing';
import { getContactLinkError, isPreferredContactMethod } from '../src/lib/preferredContactMethods';
import { closedPeriodMessage, findClosedPeriod } from '../src/lib/closedDates';
import { DEFAULT_PAYMENT_TERMS_DAYS, normalizeAgencyDetails } from '../src/lib/agencyBilling';
import { staffStamp } from '../src/lib/staffLabel';
import { checkResortCapacity } from '../lib/resortCapacity';
import { getRoomMaximumGuests, stayRangesOverlap } from '../src/lib/bookingPricing';
import { holdsRoom } from '../src/lib/unpaidBookings';
import { ROOM_BLOCK_TYPE } from '../lib/corporateRooms';

// The guest can pick the rooms the group will use (optional). Rooms under
// maintenance can't be picked.
const MAX_GROUP_ROOMS = 30;
const BLOCKED_ROOM_STATUS = ['maintenance', 'unavailable', 'out-of-service'];
const dayKeyOf = value => {
  if (typeof value === 'string') return value.slice(0, 10);
  const date = typeof value?.toDate === 'function' ? value.toDate() : null;
  return date ? getResortNow(date).dateKey : '';
};

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
      roomIds, // rooms the group picked (optional)
    } = body || {};
    const isFamily = clientType === 'family';
    const wantedRooms = Array.isArray(roomIds) ? [...new Set(roomIds)] : [];
    if (wantedRooms.length > MAX_GROUP_ROOMS || wantedRooms.some(id => typeof id !== 'string' || !id || id.length > 100)) {
      return reply(400, { error: `Choose up to ${MAX_GROUP_ROOMS} rooms.` });
    }
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

    // Families don't need a company name.
    if ((!isFamily && (typeof companyName !== 'string' || !companyName.trim()))
      || (companyName !== undefined && typeof companyName !== 'string') || String(companyName || '').trim().length > 120
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

    // The resort's guest limit (250 at a time), for website and desk groups.
    const capacityProblem = await checkResortCapacity({
      type: 'corporate',
      checkIn,
      checkOut: isDayTour ? checkIn : checkOut,
      bookingType: isDayTour ? 'daytour' : 'overnight',
      totalGuests,
    });
    if (capacityProblem) return reply(409, { error: capacityProblem.message, code: 'RESORT_FULL', remaining: capacityProblem.remaining, date: capacityProblem.date });

    const reservationRef = adminDb.collection('reservations').doc();
    const reservation = {
      type: 'corporate',
      bookingType: 'corporate',
      companyName: String(companyName || '').trim() || (isFamily ? `${contactLastName} family` : ''),
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
      clientType: isGovernment ? 'government' : isFamily ? 'family' : 'private',
      ...(isGovernment ? {
        chargeToAgency: true,
        // A PO typed on the website is kept aside until staff check it in
        // Billing; only a staff-saved PO lets the group stay on credit.
        agencyBilling: staff
          ? { ...agencyDetails.value, ...(agencyDetails.value.poNumber ? { poSavedAt: FieldValue.serverTimestamp(), poSavedBy: staff.uid } : {}) }
          : { ...agencyDetails.value, poNumber: '', guestPoNumber: agencyDetails.value.poNumber, paymentTermsDays: DEFAULT_PAYMENT_TERMS_DAYS },
      } : {}),
      status: staff ? 'confirmed' : 'pending',
      ...(staff ? { source: 'walk-in', ...staffStamp(staff, 'createdBy') } : {}),
      accommodationInterest: Boolean(accommodationInterest),
      notes: typeof notes === 'string' ? notes.trim() : '',
      createdAt: FieldValue.serverTimestamp(),
    };
    if (!wantedRooms.length) {
      await reservationRef.create(reservation);
    } else {
      // Hold the rooms the group picked: each gets a room-block booking on the
      // same dates (like rooms staff assign), checked for double bookings.
      try {
        await adminDb.runTransaction(async transaction => {
          const picked = [];
          for (const roomId of wantedRooms) {
            const roomSnap = await transaction.get(adminDb.collection('rooms').doc(roomId));
            if (!roomSnap.exists) throw Object.assign(new Error('One of the rooms you picked could not be found.'), { code: 404 });
            const room = roomSnap.data();
            if (BLOCKED_ROOM_STATUS.includes(String(room.status || '').toLowerCase())) {
              throw Object.assign(new Error(`Room ${room.roomNumber} isn't available. Pick another room.`), { code: 409 });
            }
            const bookings = await transaction.get(adminDb.collection('reservations').where('roomId', '==', roomId));
            const taken = bookings.docs.some(doc => {
              const other = doc.data();
              return holdsRoom(other) && stayRangesOverlap(checkIn, checkOut, dayKeyOf(other.checkIn), dayKeyOf(other.checkOut || other.checkIn));
            });
            if (taken) throw Object.assign(new Error(`Room ${room.roomNumber} was just booked for these dates. Pick another room.`), { code: 409 });
            picked.push({ roomId, room, blockRef: adminDb.collection('reservations').doc() });
          }
          const groupName = reservation.companyName || normalizedGuestName;
          transaction.create(reservationRef, {
            ...reservation,
            assignedRooms: picked.map(({ roomId, room, blockRef }) => ({
              roomId, roomNumber: room.roomNumber || '', roomType: room.type || '', maxGuests: getRoomMaximumGuests(room) || null, blockId: blockRef.id,
            })),
            assignedRoomCount: picked.length,
            roomsAssignedBy: staff ? (staff.name || staff.email || staff.uid) : 'Guest (online booking)',
          });
          picked.forEach(({ roomId, room, blockRef }) => transaction.set(blockRef, {
            type: ROOM_BLOCK_TYPE,
            corporateId: reservationRef.id,
            groupId: reservationRef.id,
            roomId,
            roomNumber: room.roomNumber || '',
            roomType: room.type || '',
            guestName: `${groupName} (group)`,
            companyName: reservation.companyName,
            checkIn,
            checkOut,
            checkInTime: reservation.checkInTime,
            checkOutTime: reservation.checkOutTime,
            bookingType: 'corporate',
            status: reservation.status,
            totalAmount: 0,
            amountPaid: 0,
            extraCharges: 0,
            paymentStatus: 'paid',
            paymentMethod: 'corporate',
            notes: `Room for the ${groupName} group (booking #${reservationRef.id.slice(0, 8).toUpperCase()}).`,
            createdAt: FieldValue.serverTimestamp(),
          }));
        });
      } catch (roomError) {
        if (roomError.code === 404 || roomError.code === 409) return reply(roomError.code, { error: roomError.message, code: 'ROOM_TAKEN' });
        throw roomError;
      }
    }

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
