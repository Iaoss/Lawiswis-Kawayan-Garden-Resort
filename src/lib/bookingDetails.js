// Shared rules for a booking's type, dates, times and guest count.
// Used by the server for walk-ins, staff edits and guest change requests,
// so every portal applies the same limits:
//   - Day tour (8:00 AM–5:00 PM) and night tour (5:00 PM–10:00 PM) are
//     single-day bookings: check-out is the same date as check-in.
//   - Overnight stays need at least one night.
//   - Nothing can start today after its check-in time (Philippine time).
import {
  DAYTOUR_TIME_SLOT,
  NIGHTTOUR_TIME_SLOT,
  OVERNIGHT_TIME_SLOTS,
  calculateBookingPrice,
  getGuestCountViolation,
  getOvernightCutoffError,
  getStayDurationError,
  getStayUnits,
  getTourCutoffError,
} from './bookingPricing';
import { manilaDateKey } from './reservationStatus';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The three options staff and guests choose between.
export const BOOKING_OPTIONS = [
  { id: 'overnight', label: 'Overnight stay', bookingType: 'overnight', tourPeriod: '' },
  { id: 'day', label: 'Day tour (8:00 AM–5:00 PM)', bookingType: 'daytour', tourPeriod: 'day' },
  { id: 'night', label: 'Night tour (5:00 PM–10:00 PM)', bookingType: 'daytour', tourPeriod: 'night' },
];

export function getBookingOptionId(booking) {
  if (booking?.bookingType !== 'daytour') return 'overnight';
  return booking.tourPeriod === 'night' ? 'night' : 'day';
}

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Checks and normalizes booking details. Returns { error } or { details }.
// `room` (optional) enforces the room's guest limits. `keepStartDate` is an
// existing booking's check-in: keeping it (e.g. extending a checked-in
// guest's stay) skips the past-date and check-in-time checks.
export function normalizeBookingDetails(input = {}, { room = null, now = new Date(), maxDate = '', keepStartDate = '' } = {}) {
  const bookingType = input.bookingType === 'daytour' ? 'daytour' : input.bookingType === 'overnight' ? 'overnight' : '';
  if (!bookingType) return { error: 'Choose overnight stay, day tour or night tour.' };
  const isTour = bookingType === 'daytour';
  const tourPeriod = isTour ? (input.tourPeriod === 'night' ? 'night' : input.tourPeriod === 'day' ? 'day' : '') : '';
  if (isTour && !tourPeriod) return { error: 'Choose a day tour or a night tour.' };

  const checkIn = input.checkIn;
  // Tours are single-day bookings, so check-out is the same date.
  const checkOut = isTour ? checkIn : input.checkOut;
  if (!isRealDate(checkIn) || !isRealDate(checkOut)) return { error: 'Choose a valid date.' };
  if (!isTour) {
    const stayError = getStayDurationError(checkIn, checkOut);
    if (stayError) return { error: stayError };
  }
  const today = manilaDateKey(now);
  const keepsStart = Boolean(keepStartDate) && checkIn === keepStartDate;
  if (checkIn < today && !keepsStart) return { error: 'The date can’t be in the past.' };
  if (maxDate && (checkIn > maxDate || checkOut > maxDate)) return { error: `Choose dates through ${maxDate}.` };

  let slot;
  if (isTour) {
    slot = tourPeriod === 'night' ? NIGHTTOUR_TIME_SLOT : DAYTOUR_TIME_SLOT;
    const cutoff = keepsStart ? '' : getTourCutoffError(checkIn, tourPeriod, now);
    if (cutoff) return { error: cutoff };
  } else {
    slot = OVERNIGHT_TIME_SLOTS.find(item => item.id === input.overnightTimeSlot)
      || OVERNIGHT_TIME_SLOTS.find(item => item.checkIn === input.checkInTime)
      || OVERNIGHT_TIME_SLOTS[0];
    const cutoff = keepsStart ? '' : getOvernightCutoffError(checkIn, slot.id, now);
    if (cutoff) return { error: cutoff };
  }

  const adults = Number(input.adults);
  const children = Number(input.children || 0);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    return { error: 'Guest counts must be whole numbers, with at least one adult.' };
  }
  if (room) {
    const violation = getGuestCountViolation(room, adults, children);
    if (violation) return { error: violation };
  }

  return {
    details: {
      bookingType,
      tourPeriod,
      checkIn,
      checkOut,
      checkInTime: slot.checkIn,
      checkOutTime: slot.checkOut,
      adults,
      children,
      nights: getStayUnits(checkIn, checkOut),
    },
  };
}

// Price for a booking's room, type, dates and guests (before any discount).
export function priceBookingDetails(room, details, { cottageId = '', cottageFee = 0 } = {}) {
  return calculateBookingPrice({
    room,
    bookingType: details.bookingType,
    nights: details.nights,
    adults: details.adults,
    children: details.children,
    tourPeriod: details.tourPeriod || 'day',
    cottageId,
    cottageFee,
  });
}

// Fields to copy onto a reservation when a change request is applied.
// Older requests only carried dates, so only the fields present are copied.
export function getRequestedBookingFields(request = {}) {
  const fields = {};
  const map = {
    requestedBookingType: 'bookingType',
    requestedTourPeriod: 'tourPeriod',
    requestedAdults: 'adults',
    requestedChildren: 'children',
    requestedCheckInTime: 'checkInTime',
    requestedCheckOutTime: 'checkOutTime',
  };
  Object.entries(map).forEach(([from, to]) => {
    if (request[from] !== undefined && request[from] !== null) fields[to] = request[from];
  });
  return fields;
}
