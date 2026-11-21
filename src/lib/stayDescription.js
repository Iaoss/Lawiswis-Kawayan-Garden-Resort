// One-line description of what was booked, with the number of nights and
// the dates, for the PayMongo checkout page and booking summaries:
//   "Bamboo Core · 20 guests · 15 nights (Nov 22 – Dec 7, 2026)"
//   "Room Hirang (Couple) · 2 nights (Nov 22 – 24, 2026)"
//   "Room Hirang (Couple) · day tour (Nov 22, 2026)"

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = key => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
};

// "Nov 22, 2026", "Nov 22 – 24, 2026", "Nov 22 – Dec 7, 2026", "Dec 30, 2026 – Jan 2, 2027".
export function formatDateRange(checkIn, checkOut) {
  const a = parts(checkIn);
  const b = parts(checkOut);
  if (!a) return '';
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return `${MONTHS[a.m]} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${MONTHS[a.m]} ${a.d}, ${a.y} – ${MONTHS[b.m]} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}, ${a.y}`;
  return `${MONTHS[a.m]} ${a.d} – ${b.d}, ${a.y}`;
}

export function nightsBetween(checkIn, checkOut) {
  const a = Date.parse(`${String(checkIn).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(checkOut).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}

// "15 nights (Nov 22 – Dec 7, 2026)" or "day tour (Nov 22, 2026)".
export function describeStayLength(reservation = {}) {
  const dates = formatDateRange(reservation.checkIn, reservation.checkOut);
  // Tours (and group day tours) start and end on the same date.
  const isTour = reservation.bookingType === 'daytour'
    || !reservation.checkOut || String(reservation.checkOut).slice(0, 10) === String(reservation.checkIn).slice(0, 10);
  if (isTour) {
    const tour = reservation.tourPeriod === 'night' ? 'night tour' : 'day tour';
    return dates ? `${tour} (${dates})` : tour;
  }
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut) || Number(reservation.nights) || 1;
  return `${nights} night${nights === 1 ? '' : 's'}${dates ? ` (${dates})` : ''}`;
}

// The full line for a booking. `rooms`: room numbers when several rooms are
// paid together.
export function describeBooking(reservation = {}, { rooms = null } = {}) {
  const stay = describeStayLength(reservation);
  if (reservation.type === 'corporate') {
    const guests = Number(reservation.totalGuests) || 0;
    return `${reservation.packageName || 'Group package'} · ${guests} guest${guests === 1 ? '' : 's'} · ${stay}`;
  }
  if (reservation.cottageOnly) {
    const guests = Number(reservation.totalGuests) || (Number(reservation.adults) || 0) + (Number(reservation.children) || 0);
    return `${reservation.roomNumber || 'Cottage'} · ${guests} guest${guests === 1 ? '' : 's'} · ${stay}`;
  }
  if (Array.isArray(rooms) && rooms.length > 1) {
    return `${rooms.length} rooms (${rooms.filter(Boolean).map(n => `Room ${n}`).join(', ')}) · ${stay}`;
  }
  const room = `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`.trim();
  return `${room} · ${stay}`;
}
