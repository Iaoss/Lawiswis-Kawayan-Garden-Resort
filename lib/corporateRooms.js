import { adminDb, FieldValue } from './firebaseAdmin';

// Rooms given to a corporate / group booking. Each assigned room has a
// 0-peso "room block" booking (type 'corporate-room') on the same dates, so
// the usual availability checks keep that room free for the group. Blocks
// follow the group booking's status (check-in, check-out, cancel).
export const ROOM_BLOCK_TYPE = 'corporate-room';
export const isRoomBlock = reservation => reservation?.type === ROOM_BLOCK_TYPE;

const ROOM_STATUS_AFTER = { 'checked-in': 'occupied', 'checked-out': 'cleaning' };

// Call inside a transaction after the group booking's status was written
// (writes only, no reads).
export function syncCorporateRoomBlocks(transaction, reservation, status) {
  if (reservation?.type !== 'corporate' || !Array.isArray(reservation.assignedRooms)) return;
  for (const item of reservation.assignedRooms) {
    if (item.blockId) {
      transaction.update(adminDb.collection('reservations').doc(item.blockId), {
        status,
        statusUpdatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (ROOM_STATUS_AFTER[status] && item.roomId) {
      transaction.update(adminDb.collection('rooms').doc(item.roomId), { status: ROOM_STATUS_AFTER[status] });
    }
  }
}
