// Which rooms need stairs. Floors come from the room's location text (and its
// description when the location doesn't say).
const UPPER_FLOOR = /\b(second|2nd|third|3rd|upper)\s+(floor|level)\b|\bupstairs\b/i;
const GROUND_FLOOR = /\b(first|1st|ground)\s+(floor|level)\b/i;

function floorIn(text) {
  const value = String(text || '');
  if (UPPER_FLOOR.test(value)) return 'upper';
  if (GROUND_FLOOR.test(value)) return 'ground';
  return '';
}

// 'upper', 'ground', or 'unknown'. The floor staff set for the room (Rooms →
// Floor) comes first; otherwise it is read from the room's location or
// description text.
export function roomFloor(room = {}) {
  if (room.floor === 'ground' || room.floor === 'upper') return room.floor;
  return floorIn(room.location) || floorIn(room.description) || 'unknown';
}

export const roomHasStairs = room => roomFloor(room) === 'upper';
// Confirmed to have no stairs (safe to suggest to seniors / PWD).
export const roomIsStepFree = room => roomFloor(room) === 'ground';

// Short label for guests who need a room without stairs.
export function roomAccessLabel(room = {}) {
  const floor = roomFloor(room);
  if (floor === 'ground') return { tone: 'ok', text: 'No stairs · ground floor' };
  if (floor === 'upper') return { tone: 'warn', text: 'Has stairs · upper floor' };
  return { tone: 'unknown', text: 'Floor not confirmed · ask the resort' };
}
