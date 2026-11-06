// Booking several rooms in one go (e.g. a family of 5: a couple room and a
// room with an extra bed). Each room is its own linked booking; the guest
// pays once for all of them.
export const MAX_ROOMS_PER_BOOKING = 3;

const cents = n => Math.round(Number(n || 0) * 100);

// Splits one payment across the rooms in proportion to each room's total.
// The last room takes the rounding remainder so the shares add up exactly.
export function splitGroupPayment(amount, totals) {
  const paid = cents(amount);
  const parts = totals.map(cents);
  const sum = parts.reduce((a, b) => a + b, 0);
  if (parts.length <= 1 || sum <= 0) return parts.length ? [paid / 100] : [];
  let used = 0;
  return parts.map((part, index) => {
    const share = index === parts.length - 1 ? paid - used : Math.round((paid * part) / sum);
    used += share;
    return share / 100;
  });
}

// Problems with the extra rooms a guest added, or ''.
export function getAdditionalRoomsError(mainRoomId, additionalRooms) {
  if (additionalRooms === undefined || additionalRooms === null) return '';
  if (!Array.isArray(additionalRooms)) return 'Extra rooms must be a list.';
  if (additionalRooms.length > MAX_ROOMS_PER_BOOKING - 1) return `You can book up to ${MAX_ROOMS_PER_BOOKING} rooms at once.`;
  const ids = [mainRoomId];
  for (const item of additionalRooms) {
    if (!item || typeof item.roomId !== 'string' || !item.roomId) return 'Choose a room for each extra room.';
    if (ids.includes(item.roomId)) return 'Each room can only be added once.';
    ids.push(item.roomId);
    if (!Number.isInteger(item.adults) || item.adults < 1 || !Number.isInteger(item.children) || item.children < 0) {
      return 'Each extra room needs at least 1 adult.';
    }
  }
  return '';
}
