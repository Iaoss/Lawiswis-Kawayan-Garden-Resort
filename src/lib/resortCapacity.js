// The resort can host at most RESORT_MAX_GUESTS people at a time.
//
// People at the resort on a date, at its busiest moment:
//   overnight guests (staying that night)
//   + the bigger of the day-tour crowd (8 AM–5 PM) and the night-tour crowd
//     (5 PM–10 PM). Day and night tours don't overlap, so they aren't added.
// Guests = adults + children (or a group's total), plus any day visitors
// joining a booking. Only bookings that still hold their place count
// (not cancelled, checked out, or unpaid holds that ran out). Group "room
// block" records have no guests of their own.
import { getSlotOnDate } from './dateOccupancy';
import { holdsRoom } from './unpaidBookings';

export const RESORT_MAX_GUESTS = 250;
// From this share of the limit, staff are warned that a date is nearly full.
export const NEAR_FULL_SHARE = 0.9;

const whole = value => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0);

export function guestsOfBooking(reservation = {}) {
  const counted = whole(reservation.adults) + whole(reservation.children);
  return counted || whole(reservation.totalGuests);
}

const dayVisitorsOf = reservation => whole(reservation.dayVisitorAdults) + whole(reservation.dayVisitorChildren);

const counts = reservation => reservation?.type !== 'corporate-room';

// Every date a booking is at the resort (tours: their date; overnight: each
// night from check-in up to, not including, check-out).
export function datesOfBooking(reservation = {}) {
  const checkIn = String(reservation.checkIn || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return [];
  const checkOut = String(reservation.checkOut || '').slice(0, 10);
  const dates = [];
  const day = new Date(`${checkIn}T00:00:00Z`);
  const last = checkOut > checkIn ? checkOut : checkIn;
  for (let i = 0; i < 400; i += 1) {
    const key = day.toISOString().slice(0, 10);
    if (key > last || (key === last && checkOut > checkIn)) break;
    if (getSlotOnDate({ ...reservation, status: reservation.status || 'pending' }, key)) dates.push(key);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

// { day, night, overnight, peak, remaining, full, nearFull, max } for a date.
export function peopleOnDate(reservations, date, { max = RESORT_MAX_GUESTS, now = Date.now(), ignoreIds = [] } = {}) {
  const ignore = new Set(ignoreIds);
  const totals = { day: 0, night: 0, overnight: 0 };
  reservations.forEach(reservation => {
    if (!counts(reservation) || ignore.has(reservation.id) || !holdsRoom(reservation, now)) return;
    const slot = getSlotOnDate(reservation, date);
    if (slot) totals[slot] += guestsOfBooking(reservation);
    // Day visitors join on the check-in date, for a day or night tour.
    const visitors = dayVisitorsOf(reservation);
    if (visitors && String(reservation.checkIn || '').slice(0, 10) === date) {
      totals[reservation.dayVisitorPeriod === 'night' ? 'night' : 'day'] += visitors;
    }
  });
  const peak = totals.overnight + Math.max(totals.day, totals.night);
  return {
    ...totals,
    peak,
    max,
    remaining: Math.max(0, max - peak),
    full: peak >= max,
    nearFull: peak >= Math.ceil(max * NEAR_FULL_SHARE),
  };
}

const longDate = key => new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

// Would this booking take the resort over its limit on any of its dates?
// Returns null when it fits, else { date, remaining, requested, message }.
// `ignoreIds`: the booking itself when it is being changed.
export function getCapacityProblem(reservations, booking, { max = RESORT_MAX_GUESTS, now = Date.now(), ignoreIds = [] } = {}) {
  if (!counts(booking)) return null;
  const requested = guestsOfBooking(booking) + dayVisitorsOf(booking);
  if (!requested) return null;
  for (const date of datesOfBooking(booking)) {
    const before = peopleOnDate(reservations, date, { max, now, ignoreIds });
    const after = peopleOnDate([...reservations, { ...booking, id: '__new__', status: 'pending', holdExpiresAt: null }], date, { max, now, ignoreIds });
    if (after.peak > max) {
      const remaining = before.remaining;
      return {
        date,
        remaining,
        requested,
        max,
        message: remaining <= 0
          ? `The resort is full on ${longDate(date)}: it can host up to ${max} guests at a time and that limit has been reached. Please choose another date.`
          : `The resort can host up to ${max} guests at a time. On ${longDate(date)} there is room for only ${remaining} more guest${remaining === 1 ? '' : 's'} (this booking has ${requested}). Please choose another date or fewer guests.`,
      };
    }
  }
  return null;
}

// Upcoming dates that are full or nearly full (for staff alerts).
export function getCrowdedDates(reservations, { from, days = 60, max = RESORT_MAX_GUESTS, now = Date.now() } = {}) {
  const start = new Date(`${from}T00:00:00Z`);
  const result = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    const people = peopleOnDate(reservations, date, { max, now });
    if (people.nearFull) result.push({ date, ...people });
  }
  return result;
}
