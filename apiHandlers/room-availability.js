import { adminDb } from '../lib/firebaseAdmin';

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDate(date);
}

function addMonthsClamped(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

function overlaps(start, end, reservation) {
  return reservation.status !== 'cancelled'
    && reservation.checkIn < end
    && reservation.checkOut > start;
}

function unavailableStatus(status) {
  return ['maintenance', 'cleaning', 'unavailable', 'out-of-service'].includes(String(status || '').toLowerCase());
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(500).json({ error: 'Availability service is not configured.' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = formatDate(today);
    const maxDateKey = formatDate(addMonthsClamped(today, 2));
    const { startDate, endDate } = req.query || {};
    const hasStart = Boolean(startDate);
    const hasEnd = Boolean(endDate);

    if (hasStart !== hasEnd) return res.status(400).json({ error: 'Both startDate and endDate are required.' });
    if (hasStart && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)
      || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      || startDate < todayKey
      || endDate <= startDate
      || endDate > maxDateKey)) {
      return res.status(400).json({ error: 'Choose a valid date range within the next two months.' });
    }

    const [roomsSnapshot, reservationsSnapshot] = await Promise.all([
      adminDb.collection('rooms').get(),
      adminDb.collection('reservations').get(),
    ]);
    const rooms = roomsSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const reservations = reservationsSnapshot.docs.map(document => {
      const data = document.data();
      return { ...data, checkIn: dateKey(data.checkIn), checkOut: dateKey(data.checkOut) };
    }).filter(reservation => reservation.roomId && reservation.checkIn && reservation.checkOut);

    const fullyBookedDates = [];
    for (let date = new Date(today); formatDate(date) <= maxDateKey; date.setDate(date.getDate() + 1)) {
      const key = formatDate(date);
      const nextKey = formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
      if (rooms.length && rooms.every(room => unavailableStatus(room.status)
        || reservations.some(reservation => reservation.roomId === room.id && overlaps(key, nextKey, reservation)))) {
        fullyBookedDates.push(key);
      }
    }

    const availableRoomIds = hasStart
      ? rooms.filter(room => !unavailableStatus(room.status)
        && !reservations.some(reservation => reservation.roomId === room.id && overlaps(startDate, endDate, reservation)))
        .map(room => room.id)
      : [];

    return res.status(200).json({ fullyBookedDates, availableRoomIds });
  } catch (error) {
    console.error('room-availability error:', error);
    return res.status(500).json({ error: 'Could not load room availability.' });
  }
}
