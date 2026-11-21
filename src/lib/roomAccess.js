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

// 'upper', 'ground', or 'unknown'.
export function roomFloor(room = {}) {
  return floorIn(room.location) || floorIn(room.description) || 'unknown';
}

export const roomHasStairs = room => roomFloor(room) === 'upper';
