// How busy a single date is, per time slot: day tour, night tour and
// overnight. Used by /api/occupancy?date=YYYY-MM-DD for the live indicator
// shown when a date is picked (guest site, walk-in and staff edits).

const NOT_COUNTED = ['cancelled', 'rejected'];

const emptySlot = () => ({ bookings: 0, guests: 0 });

function guestsOf(reservation) {
  const adults = Number(reservation.adults);
  const children = Number(reservation.children);
  const counted = (Number.isInteger(adults) && adults > 0 ? adults : 0)
    + (Number.isInteger(children) && children > 0 ? children : 0);
  return counted || Number(reservation.totalGuests) || 0;
}

// Which slot a booking falls in on `date`, or '' if it isn't there that day.
export function getSlotOnDate(reservation, date) {
  const checkIn = typeof reservation.checkIn === 'string' ? reservation.checkIn.slice(0, 10) : '';
  const checkOut = typeof reservation.checkOut === 'string' ? reservation.checkOut.slice(0, 10) : '';
  if (!checkIn || NOT_COUNTED.includes(String(reservation.status || '').toLowerCase())) return '';
  const singleDay = !checkOut || checkOut <= checkIn;
  const isTour = reservation.bookingType === 'daytour' || (reservation.type === 'corporate' && singleDay);
  if (isTour) {
    // Tours occupy their date (older multi-day tours occupy each day).
    const onDate = singleDay ? date === checkIn : date >= checkIn && date < checkOut;
    if (!onDate) return '';
    return reservation.tourPeriod === 'night' ? 'night' : 'day';
  }
  // Overnight stays occupy each night from check-in up to (not including) check-out.
  return date >= checkIn && date < checkOut ? 'overnight' : '';
}

export function getDateOccupancy(reservations, date) {
  const slots = { day: emptySlot(), night: emptySlot(), overnight: emptySlot() };
  reservations.forEach(reservation => {
    const slot = getSlotOnDate(reservation, date);
    if (!slot) return;
    slots[slot].bookings += 1;
    slots[slot].guests += guestsOf(reservation);
  });
  return {
    date,
    ...slots,
    total: {
      bookings: slots.day.bookings + slots.night.bookings + slots.overnight.bookings,
      guests: slots.day.guests + slots.night.guests + slots.overnight.guests,
    },
  };
}
