// How many of a booking's guests have arrived. Staff confirm the number at
// check-in (for example 2 of 4 arrive first) and record the rest later.
// Bookings checked in without a count (walk-ins, paying in full on the stay
// date) count as everyone arrived.

const whole = value => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

// Everyone expected: overnight guests plus day visitors on the booking.
export function bookedGuestCount(reservation = {}) {
  const staying = whole(reservation.adults) + whole(reservation.children);
  const visitors = whole(reservation.dayVisitorAdults) + whole(reservation.dayVisitorChildren);
  return (staying || whole(reservation.totalGuests)) + visitors;
}

export function arrivedGuestCount(reservation = {}) {
  const booked = bookedGuestCount(reservation);
  const arrived = Number(reservation.arrivedGuests);
  return Number.isInteger(arrived) && arrived >= 0 ? Math.min(arrived, booked || arrived) : booked;
}

// Guests of a checked-in booking who haven't arrived yet.
export function guestsStillToArrive(reservation = {}) {
  if (String(reservation.status || '').toLowerCase() !== 'checked-in') return 0;
  return Math.max(0, bookedGuestCount(reservation) - arrivedGuestCount(reservation));
}

// Splits the guests who are here across rooms booked together, filling each
// room's booked number in order. `here` empty/invalid means everyone is here
// (returns nulls).
export function splitArrivedGuests(here, bookedCounts = []) {
  const total = Number(here);
  if (here === '' || here === null || here === undefined || !Number.isInteger(total) || total < 0) return bookedCounts.map(() => null);
  let left = total;
  return bookedCounts.map(booked => {
    const n = Math.max(0, Math.min(left, booked));
    left -= n;
    return n;
  });
}

// A valid arrived count (up to the booked number), or null. 0 is allowed
// only when `allowZero` (one room of a group whose guests are all coming later).
export function normalizeArrivedGuests(value, booked, { allowZero = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1)) return null;
  return booked > 0 ? Math.min(n, booked) : n;
}
