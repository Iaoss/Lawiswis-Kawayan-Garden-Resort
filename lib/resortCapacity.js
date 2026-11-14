// Server side of the resort's guest limit (see src/lib/resortCapacity.js).
// Every way of creating or changing a booking calls checkResortCapacity
// before saving, with a fresh read of the bookings that hold a place.
import { loadActiveReservations } from './activeReservations';
import { getCapacityProblem } from '../src/lib/resortCapacity';

// Returns null when the booking fits, else { message, date, remaining, ... }.
// `ignoreIds`: the booking(s) being changed, so they aren't counted twice.
export async function checkResortCapacity(booking, { ignoreIds = [] } = {}) {
  const reservations = await loadActiveReservations({ fresh: true });
  return getCapacityProblem(reservations, booking, { ignoreIds });
}
