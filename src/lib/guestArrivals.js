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

// A valid arrived count (1 up to the booked number), or null.
export function normalizeArrivedGuests(value, booked) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return booked > 0 ? Math.min(n, booked) : n;
}
