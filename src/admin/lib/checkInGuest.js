import { staffApi } from './staffApi';
import { askCheckInId } from '../components/CheckInIdDialog';

// Checks a guest in after asking which ID they showed (staff can skip).
// Returns false if staff cancelled, otherwise the server result.
export async function checkInGuest(reservation) {
  const answer = await askCheckInId(reservation.guestName);
  if (!answer) return false;
  return staffApi('reservation-status', {
    action: 'set-status',
    reservationId: reservation.id,
    status: 'checked-in',
    ...(answer.skipped ? {} : { idCheck: { type: answer.type, last4: answer.last4 } }),
  });
}
