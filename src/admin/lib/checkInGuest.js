import { staffApi } from './staffApi';
import { askCheckInId } from '../components/CheckInIdDialog';
import { bookedGuestCount } from '../../lib/guestArrivals';

// Checks a guest in after asking how many guests arrived and which ID they
// showed (staff can skip the ID).
// Returns false if staff cancelled, otherwise the server result.
export async function checkInGuest(reservation) {
  const answer = await askCheckInId(reservation.guestName, { bookedGuests: bookedGuestCount(reservation) });
  if (!answer) return false;
  return staffApi('reservation-status', {
    action: 'set-status',
    reservationId: reservation.id,
    status: 'checked-in',
    ...(answer.skipped ? {} : { idCheck: { type: answer.type, last4: answer.last4 } }),
    ...(answer.arrivedGuests ? { arrivedGuests: answer.arrivedGuests } : {}),
  });
}
