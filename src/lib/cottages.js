// How many of each cottage are free on a date, for a day tour or night tour.
//
// The resort's cottage counts are set by an admin in Settings (stored in
// siteSettings/cottageInventory as { 'umbrella-hut', 'garden-cabana',
// 'poolside-cabana', pavilion }). A count
// left empty means "not limited" — the system then never blocks that cottage.
//
// A cottage is in use by any active booking that rented it for that date:
//   - day/night tours on that date and the same tour time, and
//   - overnight stays covering that date (they keep it for the whole day).
import { COTTAGE_OPTIONS, LEGACY_COTTAGE_IDS } from './bookingPricing';
import { holdsRoom } from './unpaidBookings';

export const COTTAGE_IDS = COTTAGE_OPTIONS.filter(option => option.id).map(option => option.id);

const dateKey = value => String(value || '').slice(0, 10);
// Expired unpaid online holds don't take a cottage either.
const isActive = r => holdsRoom(r || {});

export function cottageInUse(reservation, date, tourPeriod) {
  if (!reservation?.cottageId || !isActive(reservation)) return false;
  const checkIn = dateKey(reservation.checkIn);
  const checkOut = dateKey(reservation.checkOut) || checkIn;
  if (reservation.bookingType === 'daytour') {
    return checkIn === date && (reservation.tourPeriod === 'night' ? 'night' : 'day') === tourPeriod;
  }
  // Overnight stay: from the check-in date up to (not including) check-out.
  return checkIn <= date && (date < checkOut || checkIn === checkOut);
}

export function countCottagesInUse(reservations, date, tourPeriod, ignoreId = '') {
  const counts = Object.fromEntries(COTTAGE_IDS.map(id => [id, 0]));
  reservations.forEach(r => {
    if (r.id === ignoreId || !cottageInUse(r, date, tourPeriod)) return;
    const id = LEGACY_COTTAGE_IDS[r.cottageId] || r.cottageId;
    if (counts[id] !== undefined) counts[id] += 1;
  });
  return counts;
}

// Cleans the admin's numbers: whole numbers 0–100, or null for "not limited".
export function normalizeCottageInventory(input = {}) {
  return Object.fromEntries(COTTAGE_IDS.map(id => {
    const raw = input?.[id];
    if (raw === null || raw === undefined || raw === '') return [id, null];
    const value = Number(raw);
    return [id, Number.isInteger(value) && value >= 0 && value <= 100 ? value : null];
  }));
}

// { 'umbrella-hut': { total, booked, left }, … } — left is null when not limited.
export function getCottageAvailability(inventory, counts) {
  const clean = normalizeCottageInventory(inventory);
  return Object.fromEntries(COTTAGE_IDS.map(id => {
    const total = clean[id];
    const booked = counts?.[id] || 0;
    return [id, { total, booked, left: total === null ? null : Math.max(0, total - booked) }];
  }));
}

export function cottageAvailabilityError(availability, cottageId) {
  const entry = availability?.[cottageId];
  if (!entry || entry.left === null || entry.left > 0) return '';
  const option = COTTAGE_OPTIONS.find(item => item.id === cottageId);
  const name = String(option?.label || 'That cottage').replace(/\s*\(.*\)$/, '');
  return `All ${name}s are already booked for that date and time. Please choose another cottage or date.`;
}
