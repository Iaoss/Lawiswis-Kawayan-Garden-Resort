import { getRoomsNotReadyForArrivals, roomNotReadyNotifications } from './roomReadiness';

const rooms = [
  { id: 'a', roomNumber: '1', status: 'cleaning' },
  { id: 'b', roomNumber: '2', status: 'available' },
  { id: 'c', roomNumber: '3', status: 'cleaning' },
];
const reservations = [
  { id: 'r1', roomId: 'a', status: 'confirmed', checkIn: '2026-11-06', checkInTime: '15:00', guestName: 'Ana' },
  { id: 'r2', roomId: 'b', status: 'confirmed', checkIn: '2026-11-06' },
  { id: 'r3', roomId: 'c', status: 'confirmed', checkIn: '2026-11-07' },
  { id: 'r4', roomId: 'c', status: 'cancelled', checkIn: '2026-11-06' },
];

test('only rooms still being cleaned with a guest arriving today', () => {
  const list = getRoomsNotReadyForArrivals(rooms, reservations, '2026-11-06');
  expect(list.map(item => item.room.id)).toEqual(['a']);
  const [note] = roomNotReadyNotifications(rooms, reservations, { todayKey: '2026-11-06' });
  expect(note.message).toMatch(/Room 1 is still cleaning/);
  expect(note.details).toMatch(/Ana checks in at 3:00 PM/);
});
