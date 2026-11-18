import { stayRangesOverlap } from '../../lib/bookingPricing';
import { holdsRoom } from '../../lib/unpaidBookings';
import { getCollectionSnapshot } from './liveCollection';

// Rooms, loaded once per page visit.
let roomsCache = null;
export const loadRooms = () => {
  roomsCache = roomsCache || getCollectionSnapshot('rooms')
    .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
    .catch(error => { roomsCache = null; throw error; });
  return roomsCache;
};

export const dayOf = value => String(value || '').slice(0, 10);
export const isRoomOutOfService = status => /maint|out.?of.?(service|order)|blocked|closed|unavailable/.test(String(status || '').toLowerCase());

// Bookings (other than ignoreIds) holding this room on any of these dates.
export function bookingsOnRoom(reservations, room, checkIn, checkOut, ignoreIds = []) {
  const skip = new Set([].concat(ignoreIds));
  return reservations.filter(other => !skip.has(other.id)
    && (other.roomId === room.id || (room.roomNumber && other.roomNumber === room.roomNumber))
    && holdsRoom(other) && other.checkIn
    && stayRangesOverlap(checkIn, checkOut, dayOf(other.checkIn), dayOf(other.checkOut || other.checkIn)));
}
