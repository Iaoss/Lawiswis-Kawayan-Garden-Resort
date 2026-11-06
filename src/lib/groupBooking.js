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

// Splits the group (adults, children) across the chosen rooms so every room
// is within its limits and has at least one adult. When several splits work,
// the cheapest one wins (priceOf(room, adults, children)); without a price
// function, the first room is filled first.
// Returns [{ roomId, adults, children }] in the rooms' order, or null.
export function splitGuestsAcrossRooms(rooms, adults, children, { fits, priceOf } = {}) {
  const totalAdults = Math.max(0, Math.floor(Number(adults) || 0));
  const totalChildren = Math.max(0, Math.floor(Number(children) || 0));
  if (!rooms.length || totalAdults < rooms.length) return null;
  const roomFits = fits || (() => true);
  let best = null;
  let bestPrice = Infinity;
  let tried = 0;
  const walk = (index, leftAdults, leftChildren, picked) => {
    if (tried > 20000) return;
    if (index === rooms.length - 1) {
      tried += 1;
      if (leftAdults < 1 || !roomFits(rooms[index], leftAdults, leftChildren)) return;
      const plan = [...picked, { roomId: rooms[index].id, adults: leftAdults, children: leftChildren }];
      const price = priceOf ? plan.reduce((sum, item, i) => sum + (priceOf(rooms[i], item.adults, item.children) || 0), 0) : 0;
      if (!best || price < bestPrice) { best = plan; bestPrice = price; }
      return;
    }
    const roomsLeft = rooms.length - index - 1;
    for (let a = leftAdults - roomsLeft; a >= 1; a -= 1) {
      for (let c = leftChildren; c >= 0; c -= 1) {
        if (!roomFits(rooms[index], a, c)) continue;
        walk(index + 1, leftAdults - a, leftChildren - c, [...picked, { roomId: rooms[index].id, adults: a, children: c }]);
        if (best && !priceOf) return;
      }
    }
  };
  walk(0, totalAdults, totalChildren, []);
  return best;
}
