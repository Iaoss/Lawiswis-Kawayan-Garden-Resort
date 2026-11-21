// Returning guests: find someone who booked before (by name, mobile or
// email) to fill in their details for a new booking, and list their active
// bookings so the new stay can be added to one of them (one bill).
import { splitGuestName } from '../../lib/nameValidation';

const ACTIVE = ['pending', 'confirmed', 'checked-in'];
const digits = value => String(value || '').replace(/\D/g, '');
const lower = value => String(value || '').trim().toLowerCase();
const toMs = value => (value?.toMillis ? value.toMillis() : value?.seconds ? value.seconds * 1000 : Date.parse(value) || 0);

// The same person across bookings: mobile number first, then email, then name.
export function guestKeyOf(reservation = {}) {
  const phone = digits(reservation.phone);
  if (phone.length >= 10) return `phone:${phone.slice(-10)}`;
  const email = lower(reservation.email);
  if (email) return `email:${email}`;
  return `name:${lower(reservation.guestName)}`;
}

// Contact details to fill in a new booking form.
export function guestPrefillFrom(reservation = {}) {
  const split = splitGuestName(reservation.guestName || '');
  return {
    firstName: String(reservation.firstName || split.firstName || '').trim(),
    lastName: String(reservation.lastName || split.lastName || '').trim(),
    phone: String(reservation.phone || ''),
    email: String(reservation.email || ''),
    address: String(reservation.address || ''),
    preferredContactMethod: String(reservation.preferredContactMethod || ''),
    contactLink: String(reservation.contactLink || ''),
  };
}

export const isActiveBooking = reservation => ACTIVE.includes(lower(reservation.status))
  && reservation.type !== 'corporate-room';

// Up to `limit` guests matching the search (2+ characters), newest first.
export function findReturningGuests(reservations = [], query = '', { limit = 6 } = {}) {
  const text = lower(query);
  const queryDigits = digits(query);
  if (text.length < 2) return [];
  const groups = new Map();
  reservations.forEach(r => {
    if (!r || r.type === 'corporate-room' || !r.guestName) return;
    const matches = lower(r.guestName).includes(text)
      || (queryDigits.length >= 4 && digits(r.phone).includes(queryDigits))
      || (text.includes('@') && lower(r.email).includes(text))
      || (text.length >= 3 && lower(r.email).includes(text));
    if (!matches) return;
    const key = guestKeyOf(r);
    const group = groups.get(key) || { key, bookings: [] };
    group.bookings.push(r);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map(group => {
      const bookings = group.bookings.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
      // The booking whose group is shown when several rooms are linked.
      const leads = bookings.filter(isActiveBooking).filter(b => !b.groupId || b.groupId === b.id);
      return {
        key: group.key,
        ...guestPrefillFrom(bookings[0]),
        guestName: bookings[0].guestName,
        bookingCount: bookings.length,
        lastStay: bookings[0].checkIn || '',
        activeBookings: leads,
      };
    })
    .sort((a, b) => String(b.lastStay).localeCompare(String(a.lastStay)))
    .slice(0, limit);
}
