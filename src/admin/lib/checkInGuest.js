import { staffApi } from './staffApi';
import { askCheckInId } from '../components/CheckInIdDialog';
import { arrivedGuestCount, bookedGuestCount } from '../../lib/guestArrivals';

// Checks a guest in after asking how many guests arrived and which ID they
// showed (staff can skip the ID).
// Rooms booked together are checked in at once (pass them as `rooms`); the
// arrived guests fill each room's booked number in order.
// Returns false if staff cancelled, otherwise the server result.
export async function checkInGuest(reservation, rooms = []) {
  const list = rooms.length > 1 ? rooms : [reservation];
  const booked = list.reduce((sum, room) => sum + bookedGuestCount(room), 0);
  const answer = await askCheckInId(reservation.guestName, {
    bookedGuests: booked,
    arrivedGuests: list.reduce((sum, room) => sum + arrivedGuestCount(room), 0),
  });
  if (!answer) return false;
  let left = answer.arrivedGuests || 0;
  let result = null;
  for (const room of list) {
    const here = answer.arrivedGuests ? Math.min(left, bookedGuestCount(room)) : 0;
    left -= here;
    result = await staffApi('reservation-status', {
      action: 'set-status',
      reservationId: room.id,
      status: 'checked-in',
      ...(answer.skipped ? {} : { idCheck: { type: answer.type, last4: answer.last4 } }),
      ...(answer.arrivedGuests ? { arrivedGuests: here } : {}),
    });
  }
  return result;
}
