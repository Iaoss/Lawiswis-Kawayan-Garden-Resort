// Rooms still being cleaned (or under maintenance) while a guest is due to
// arrive in them today. Shown in the bell and on the Rooms page so the
// cleaning staff know which room to finish first.
const NOT_READY = ['cleaning', 'maintenance'];
const ARRIVING = ['pending', 'confirmed'];

export function getRoomsNotReadyForArrivals(rooms = [], reservations = [], todayKey) {
  const arrivalsByRoom = new Map();
  reservations.forEach(r => {
    if (!r.roomId || !ARRIVING.includes(String(r.status || '').toLowerCase())) return;
    if (String(r.checkIn || '').slice(0, 10) !== todayKey) return;
    if (!arrivalsByRoom.has(r.roomId)) arrivalsByRoom.set(r.roomId, []);
    arrivalsByRoom.get(r.roomId).push(r);
  });
  return rooms
    .filter(room => NOT_READY.includes(String(room.status || '').toLowerCase()) && arrivalsByRoom.has(room.id))
    .map(room => {
      const arrivals = arrivalsByRoom.get(room.id)
        .sort((a, b) => String(a.checkInTime || '14:00').localeCompare(String(b.checkInTime || '14:00')));
      return { room, arrivals, first: arrivals[0] };
    });
}

// "2:00 PM" from "14:00" (check-in time saved on the booking).
export function formatClockLabel(value, fallback = '2:00 PM') {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return fallback;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export function roomNotReadyNotifications(rooms, reservations, { todayKey, prefix = '/admin', now = Date.now() } = {}) {
  return getRoomsNotReadyForArrivals(rooms, reservations, todayKey).map(({ room, arrivals, first }) => ({
    id: `room-not-ready_${room.id}_${todayKey}`,
    icon: 'ti-bucket-droplet',
    badge: 'Room Not Ready',
    message: `Room ${room.roomNumber || ''} is still ${String(room.status).toLowerCase()} · guest arriving today`,
    details: `${first.guestName || 'Guest'} checks in at ${formatClockLabel(first.checkInTime)}${arrivals.length > 1 ? ` (+${arrivals.length - 1} more)` : ''}. Clean it, then mark it as available.`,
    timeMs: now,
    path: `${prefix}/rooms`,
  }));
}
