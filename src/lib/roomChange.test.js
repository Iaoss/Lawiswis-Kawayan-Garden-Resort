import { getRoomChangeError } from './roomChange';

const room = (roomNumber, maxGuests) => ({ roomNumber, type: 'Room', maxGuests, capacity: maxGuests });

test('a booking can move to a room of the same size or bigger', () => {
  expect(getRoomChangeError(room('1', 2), room('2', 2))).toBe('');
  expect(getRoomChangeError(room('1', 2), room('3', 4))).toBe('');
});

test('a booking cannot move to a smaller room', () => {
  expect(getRoomChangeError(room('3', 4), room('1', 2))).toMatch(/fewer than Room 3/);
});
