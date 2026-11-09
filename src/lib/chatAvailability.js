// "Check availability" in the guest chat: the guest picks dates and how many
// guests, and the bot answers with the rooms that are free on those dates,
// the best fits for the group and their estimated price, plus a link to book.
import { getResortNow, getRoomMaximumGuests, stayRangesOverlap } from './bookingPricing';
import { pickRecommendedRooms } from './bookingSuggestions';
import { priceBookingDetails } from './bookingDetails';
import { holdsRoom } from './unpaidBookings';
import { MIN_GROUP_GUESTS } from './corporatePackages';

const SITE = 'https://lawiswis-kawayan-garden-resort.vercel.app';
export const MAX_CHAT_GUESTS = 60;
const peso = value => `₱${Math.round(Number(value) || 0).toLocaleString('en-PH')}`;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const addDaysKey = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
// Same booking window as the website: today up to 2 months ahead.
export const addMonthsKey = (key, months) => {
  const [y, m, d] = key.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d, lastDay));
  return result.toISOString().slice(0, 10);
};
const nightsBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const shortDate = key => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function bookingWindow(now = new Date()) {
  const today = getResortNow(now).dateKey;
  return { today, maxDate: addMonthsKey(today, 2) };
}

// Cleans the guest's choice; returns { checkIn, checkOut, guests } or { error }.
export function normalizeAvailabilityRequest(input = {}, now = new Date()) {
  const checkIn = String(input.checkIn || '');
  const checkOut = String(input.checkOut || '');
  const guests = Number(input.guests);
  const { today, maxDate } = bookingWindow(now);
  if (!DATE_KEY.test(checkIn) || !DATE_KEY.test(checkOut)) return { error: 'Choose your check-in and check-out dates.' };
  if (checkIn < today) return { error: 'Check-in can’t be in the past.' };
  if (checkOut <= checkIn) return { error: 'Check-out must be after check-in.' };
  if (checkOut > maxDate) return { error: `We take bookings up to ${shortDate(maxDate)}.` };
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_CHAT_GUESTS) return { error: `Enter 1 to ${MAX_CHAT_GUESTS} guests.` };
  return { checkIn, checkOut, guests };
}

const BLOCKED_STATUS = ['maintenance', 'cleaning', 'unavailable', 'out-of-service'];
const dateKeyOf = value => {
  if (typeof value === 'string') return value.slice(0, 10);
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : getResortNow(date).dateKey;
};

// Rooms with no active booking overlapping the dates.
export function freeRoomsFor(rooms = [], reservations = [], checkIn, checkOut, now = Date.now()) {
  return rooms.filter(room => room && !room.archived && !room.hidden
    && !BLOCKED_STATUS.includes(String(room.status || '').toLowerCase())
    && !reservations.some(reservation => reservation.roomId === room.id
      && holdsRoom(reservation, now)
      && stayRangesOverlap(checkIn, checkOut, dateKeyOf(reservation.checkIn), dateKeyOf(reservation.checkOut))));
}

const roomName = room => `${room.roomNumber || room.name || 'Room'}${room.type ? ` (${String(room.type).replace(/([a-z])([A-Z])/g, '$1 $2')})` : ''}`;

// The chat question shown for the guest.
export const availabilityQuestion = ({ checkIn, checkOut, guests }) =>
  `Is there a free room from ${shortDate(checkIn)} to ${shortDate(checkOut)} for ${guests} guest${guests === 1 ? '' : 's'}?`;

// The bot's answer, from the live rooms and bookings.
export function buildAvailabilityAnswer({ rooms = [], reservations = [], seasonPeriods = [], checkIn, checkOut, guests, now = Date.now() }) {
  const nights = nightsBetween(checkIn, checkOut);
  const stay = `${shortDate(checkIn)} → ${shortDate(checkOut)} (${nights} night${nights === 1 ? '' : 's'})`;
  const bookLink = `${SITE}/book?${new URLSearchParams({ type: 'personal', stay: 'overnight', checkIn, checkOut, adults: String(guests), children: '0', step: 'room' })}`;
  const free = freeRoomsFor(rooms, reservations, checkIn, checkOut, now);

  if (!free.length) {
    return [
      `Sorry, all rooms are booked for ${stay}.`,
      'Try other dates, or come for a day tour (8 AM–5 PM) or night tour (5 PM–10 PM), which don’t need a room.',
      'Our staff can also help: just type your question here.',
    ].join('\n');
  }

  if (guests >= MIN_GROUP_GUESTS) {
    const capacity = free.reduce((sum, room) => sum + (getRoomMaximumGuests(room) || 0), 0);
    return [
      `${free.length} room${free.length === 1 ? ' is' : 's are'} free for ${stay}, holding up to ${capacity} guests in total.`,
      `For groups of ${MIN_GROUP_GUESTS} or more, we offer group / corporate packages: ${SITE}/corporate-booking`,
      'Or type your question here and our staff will help you plan.',
    ].join('\n');
  }

  const details = { bookingType: 'overnight', nights, adults: guests, children: 0, checkIn, checkOut, checkInTime: '' };
  const entries = free
    .filter(room => (getRoomMaximumGuests(room) || 0) >= guests)
    .map(room => {
      let price = null;
      try { price = priceBookingDetails(room, details, { seasonPeriods }).subtotalAmount; } catch { price = null; }
      const maxGuests = getRoomMaximumGuests(room);
      return { room, price, maxGuests, spare: maxGuests - guests };
    })
    .filter(entry => entry.price !== null);

  if (!entries.length) {
    const biggest = [...free].sort((a, b) => (getRoomMaximumGuests(b) || 0) - (getRoomMaximumGuests(a) || 0)).slice(0, 3);
    return [
      `No single free room holds ${guests} guests for ${stay}, but you can book up to 3 rooms together:`,
      ...biggest.map(room => `• ${roomName(room)}: up to ${getRoomMaximumGuests(room) || '?'} guests`),
      `Book here: ${bookLink}`,
    ].join('\n');
  }

  const { recommended, others } = pickRecommendedRooms(entries);
  return [
    `Good news! ${entries.length} room${entries.length === 1 ? '' : 's'} free for ${guests} guest${guests === 1 ? '' : 's'}, ${stay}:`,
    ...recommended.map(entry => `• ${roomName(entry.room)}, up to ${entry.maxGuests}: ${peso(entry.price)} total`),
    ...(others.length ? [`…and ${others.length} more on the booking page.`] : []),
    'Prices include breakfast and pool access. The final total shows when you book.',
    `Book here: ${bookLink}`,
  ].join('\n');
}
