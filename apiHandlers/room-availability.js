import { adminDb } from '../lib/firebaseAdmin';
import { stayRangesOverlap } from '../src/lib/bookingPricing';
import { holdsRoom } from '../src/lib/unpaidBookings';
import { loadActiveReservations, loadRoomsCached } from '../lib/activeReservations';
import { datesOfBooking, peopleOnDate, RESORT_MAX_GUESTS } from '../src/lib/resortCapacity';

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

// start === end means a single-day (day tour) range.
function overlaps(start, end, reservation) {
  return holdsRoom(reservation)
    && stayRangesOverlap(start, end, reservation.checkIn, reservation.checkOut);
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
      || endDate < startDate
      || endDate > maxDateKey)) {
      return res.status(400).json({ error: 'Choose a valid date range within the next two months.' });
    }

    // Only bookings that can still hold a room, shared for a few seconds
    // between visitors (see lib/activeReservations.js).
    const [rooms, activeReservations] = await Promise.all([loadRoomsCached(), loadActiveReservations()]);
    const reservations = activeReservations.map(data => ({ ...data, checkIn: dateKey(data.checkIn), checkOut: dateKey(data.checkOut) })).filter(reservation => reservation.roomId && reservation.checkIn && reservation.checkOut);

    const fullyBookedDates = [];
    // Dates where the resort already holds its guest limit (250 at a time):
    // crossed out like sold-out dates, whatever rooms are left.
    const resortFullDates = [];
    for (let date = new Date(today); formatDate(date) <= maxDateKey; date.setDate(date.getDate() + 1)) {
      const key = formatDate(date);
      const nextKey = formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
      const resortFull = peopleOnDate(activeReservations, key).full;
      if (resortFull) resortFullDates.push(key);
      if (resortFull || (rooms.length && rooms.every(room => unavailableStatus(room.status)
        || reservations.some(reservation => reservation.roomId === room.id && overlaps(key, nextKey, reservation))))) {
        fullyBookedDates.push(key);
      }
    }

    // A chosen stay that touches a full date gets no rooms, with a reason.
    const fullDuringStay = hasStart
      ? datesOfBooking({ checkIn: startDate, checkOut: endDate, bookingType: startDate === endDate ? 'daytour' : 'overnight' })
        .find(date => resortFullDates.includes(date))
      : '';
    const availableRoomIds = hasStart && !fullDuringStay
      ? rooms.filter(room => !unavailableStatus(room.status)
        && !reservations.some(reservation => reservation.roomId === room.id && overlaps(startDate, endDate, reservation)))
        .map(room => room.id)
      : [];
    const resortFull = fullDuringStay
      ? { date: fullDuringStay, message: `The resort is full on ${new Date(`${fullDuringStay}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}: it can host up to ${RESORT_MAX_GUESTS} guests at a time and that limit has been reached. Please choose another date.` }
      : null;

    // Shared CDN cache for a short time: many visitors looking at the same
    // dates share one database read. Booking still re-checks the room.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    // Fewest places left on any date of the chosen stay (out of 250).
    const placesLeft = hasStart
      ? Math.min(...datesOfBooking({ checkIn: startDate, checkOut: endDate, bookingType: startDate === endDate ? 'daytour' : 'overnight' })
        .map(date => peopleOnDate(activeReservations, date).remaining), RESORT_MAX_GUESTS)
      : null;
    return res.status(200).json({ fullyBookedDates, resortFullDates, availableRoomIds, resortFull, placesLeft, maxGuests: RESORT_MAX_GUESTS });
  } catch (error) {
    console.error('room-availability error:', error);
    return res.status(500).json({ error: 'Could not load room availability.' });
  }
}
