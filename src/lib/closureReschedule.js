// Moving a booking because the resort closed (typhoon, flood, emergency).
// After an admin sends a closure notice (booking.closureNotice), the guest can
// pick new dates online: same booking type, guests, length and price, with no
// fee and no 30-day rule. Staff approve or reject; when rejected, the guest
// is offered the closest free dates that keep the same price.
import { stayRangesOverlap } from './bookingPricing';
import { findNearestOpenDates } from './bookingSuggestions';
import { getSeasonalAdjustment } from './seasonalRates';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const shiftDate = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// The closure's last day is closed too, so the range ends the day after.
function overlapsClosure(checkIn, checkOut, closure) {
  if (!closure?.closedFrom) return false;
  return stayRangesOverlap(checkIn, checkOut, closure.closedFrom, shiftDate(closure.closedTo || closure.closedFrom, 1));
}

// Does this booking fall on the closed dates (from..to, both days closed)?
export function isAffectedByClosure(reservation = {}, closedFrom, closedTo) {
  if (typeof reservation.checkIn !== 'string') return false;
  const checkIn = reservation.checkIn.slice(0, 10);
  const checkOut = String(reservation.checkOut || reservation.checkIn).slice(0, 10);
  return overlapsClosure(checkIn, checkOut, { closedFrom, closedTo });
}

// Can this booking be moved online because of a closure?
export function canClosureReschedule(reservation = {}) {
  const closure = reservation.closureNotice || {};
  if (!closure.closedFrom || typeof reservation.checkIn !== 'string') return false;
  if (!['pending', 'confirmed'].includes(String(reservation.status || '').toLowerCase())) return false;
  // Once moved out of the closure, the booking can't be moved online again.
  const checkIn = reservation.checkIn.slice(0, 10);
  const checkOut = String(reservation.checkOut || reservation.checkIn).slice(0, 10);
  return overlapsClosure(checkIn, checkOut, closure);
}

// The new check-out for a new check-in, keeping the same length of stay.
export function sameLengthCheckOut(reservation, newCheckIn) {
  const length = Math.max(0, daysBetween(String(reservation.checkIn).slice(0, 10), String(reservation.checkOut || reservation.checkIn).slice(0, 10)));
  return shiftDate(newCheckIn, length);
}

// Why these new dates can't be used for a closure move, or ''.
export function getClosureMoveError(reservation, newCheckIn, { today, maxDate } = {}) {
  if (!DATE.test(String(newCheckIn || ''))) return 'Choose a new date.';
  const checkOut = sameLengthCheckOut(reservation, newCheckIn);
  const closure = reservation.closureNotice || {};
  if (today && newCheckIn <= today) return 'Choose a date from tomorrow onwards.';
  if (maxDate && checkOut > maxDate) return 'Choose dates within the next two months.';
  if (overlapsClosure(newCheckIn, checkOut, closure)) {
    return 'The resort is closed on those dates. Please choose dates after the closure.';
  }
  return '';
}

// Closest free dates for the same room and length that keep the same price
// (no holiday surcharge or discount) and avoid the closure. Up to `count`.
export function getSamePriceSuggestions({ reservation, requestedCheckIn, bookedRanges = [], seasonPeriods = [], today, maxDate, count = 3 }) {
  const start = DATE.test(String(requestedCheckIn || '')) ? requestedCheckIn : String(reservation.checkIn).slice(0, 10);
  const checkOut = sameLengthCheckOut(reservation, start);
  const minDate = today ? shiftDate(today, 1) : undefined;
  const candidates = findNearestOpenDates({ checkIn: start, checkOut, bookedRanges, minDate, maxDate, count: 30, searchDays: 60 });
  const closure = reservation.closureNotice || {};
  const bookingType = reservation.bookingType === 'daytour' ? 'daytour' : 'overnight';
  return candidates
    .filter(c => !overlapsClosure(c.checkIn, c.checkOut, closure))
    .filter(c => getSeasonalAdjustment({ periods: seasonPeriods, checkIn: c.checkIn, checkOut: c.checkOut, bookingType, roomCharge: 1000 }).amount === 0)
    .slice(0, count)
    .map(c => ({ checkIn: c.checkIn, checkOut: c.checkOut }));
}
