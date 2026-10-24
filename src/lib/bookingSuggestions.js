// Smart suggestions for walk-ins: given how many guests there are, which of
// the free rooms fit them best, and which cottage size suits the group.
import { COTTAGE_OPTIONS, getGuestCountViolation, getRoomMaximumGuests } from './bookingPricing';
import { priceBookingDetails } from './bookingDetails';

// Rooms that can hold the whole group, cheapest first for this booking
// (room rate plus any extra-guest charges), with a short reason each.
export function suggestRooms(rooms, details, limit = 3) {
  if (!details || !Array.isArray(rooms)) return [];
  const guests = details.adults + details.children;
  return rooms
    .filter(room => !getGuestCountViolation(room, details.adults, details.children))
    .map(room => {
      let total = null;
      try { total = priceBookingDetails(room, details).subtotalAmount; } catch { total = null; }
      const maxGuests = getRoomMaximumGuests(room);
      const spare = maxGuests ? maxGuests - guests : null;
      return {
        room,
        total,
        maxGuests,
        reason: spare === 0 ? `Exact fit for ${guests}` : spare ? `Fits ${guests}, room for ${spare} more` : `Fits ${guests}`,
      };
    })
    .filter(item => item.total !== null)
    .sort((a, b) => a.total - b.total || (a.maxGuests || 99) - (b.maxGuests || 99))
    .slice(0, limit);
}

// The smallest, cheapest cottage that seats the group. Groups over 20 are
// pointed to the pavilion plus more cottages.
export function suggestCottage(guests) {
  const options = COTTAGE_OPTIONS.filter(option => option.id && option.maxGuests >= guests)
    .sort((a, b) => a.maxGuests - b.maxGuests || a.price - b.price);
  if (options.length) return { cottage: options[0], note: '' };
  const pavilion = COTTAGE_OPTIONS.find(option => option.id === 'pavilion');
  return { cottage: pavilion, note: `More than ${pavilion.maxGuests} guests: add another cottage for the rest of the group.` };
}

// Shown when no single free room holds the whole group.
export function groupTooLargeNote(rooms, details) {
  if (!details) return '';
  const guests = details.adults + details.children;
  const biggest = Math.max(0, ...rooms.map(room => getRoomMaximumGuests(room) || 0));
  if (guests >= 15) return `Groups of ${guests} can be booked as a corporate / big group package, or split across several rooms.`;
  if (biggest && guests > biggest) return `No single free room holds ${guests} guests (largest free room: ${biggest}). Split the group across rooms with separate bookings.`;
  return 'No free room matches this group size for these dates. Try other dates or split the group.';
}
