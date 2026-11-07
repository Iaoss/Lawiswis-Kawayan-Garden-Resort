import { getRoomMaximumGuests } from './bookingPricing';

// Moving a booking to another room (e.g. its room is taken on the new
// dates): the new room must hold at least as many guests as the booked one.
// Same size (couple room to couple room) or bigger is fine; a smaller room
// is not, since the booking was priced for the bigger room.
export function getRoomChangeError(fromRoom, toRoom) {
  const before = getRoomMaximumGuests(fromRoom) || 0;
  const after = getRoomMaximumGuests(toRoom) || 0;
  if (after < before) {
    return `Room ${toRoom.roomNumber || ''} holds ${after} guest${after === 1 ? '' : 's'}, fewer than Room ${fromRoom.roomNumber || ''} (${before}). Move to a room of the same size or bigger, or add a room.`;
  }
  return '';
}

export const canMoveToRoom = (fromRoom, toRoom) => !getRoomChangeError(fromRoom, toRoom);
