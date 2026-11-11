// Line items for a guest receipt, worked out from the reservation.
// `booking` is what was booked (room or package, extra guests, cottage,
// promo discount). `extras` is everything added later: spa, photoshoot,
// other extra charges and late check-out fees. Sections with nothing in them
// come back empty so the receipt can leave them out.
import { getCottageLabel, getVatBreakdown } from './bookingPricing';

const money = value => Math.round(Number(value || 0) * 100) / 100;

const unitLabel = (reservation, units) => {
  if (reservation.bookingType === 'daytour') {
    const tour = reservation.tourPeriod === 'night' ? 'night tour' : 'day tour';
    return units === 1 ? `1 ${tour}` : `${units} ${tour}s`;
  }
  return units === 1 ? '1 night' : `${units} nights`;
};

// "Day visitors (2 adults, 1 child · day tour)"
const dayVisitorLabel = reservation => {
  const adults = Number(reservation.dayVisitorAdults || 0);
  const children = Number(reservation.dayVisitorChildren || 0);
  const people = [
    adults ? `${adults} adult${adults === 1 ? '' : 's'}` : '',
    children ? `${children} child${children === 1 ? '' : 'ren'}` : '',
  ].filter(Boolean).join(', ');
  return `Day visitors (${people} · ${reservation.dayVisitorPeriod === 'night' ? 'night tour' : 'day tour'})`;
};

export function getReceiptLineItems(reservation = {}) {
  const booking = [];
  const extras = [];
  const total = money(reservation.totalAmount);
  const cottageFee = money(reservation.cottageFee);
  const discount = money(reservation.promoDiscount || reservation.discountAmount);

  if (reservation.type === 'corporate') {
    const guests = Number(reservation.totalGuests || 0);
    const nights = Number(reservation.nights || 1);
    const rate = Number(reservation.packageRate || 0);
    const stay = nights > 1 ? ` × ${nights} nights` : '';
    booking.push({
      label: `${reservation.packageName || 'Group package'}${guests ? ` · ${guests} guests` : ''}${rate ? ` × ₱${rate.toLocaleString()}` : ''}${stay}`,
      amount: money(total + discount),
    });
  } else if (reservation.cottageOnly) {
    // Cottage-only tour: swimming entrance per person (the cottage is added below).
    const adults = Number(reservation.adults || 0);
    const children = Number(reservation.children || 0);
    const tour = reservation.tourPeriod === 'night' ? 'Night tour' : 'Day tour';
    const parts = [
      adults ? `${adults} adult${adults === 1 ? '' : 's'} × ₱${Number(reservation.entranceAdultRate || 0).toLocaleString()}` : '',
      children ? `${children} child${children === 1 ? '' : 'ren'} × ₱${Number(reservation.entranceChildRate || 0).toLocaleString()}` : '',
    ].filter(Boolean).join(', ');
    booking.push({ label: `${tour} entrance · ${parts}`, amount: money(reservation.entranceFee ?? (total + discount - cottageFee)) });
  } else {
    const units = Math.max(1, Number(reservation.nights) || 1);
    const baseRate = money(reservation.baseRate);
    const lateArrival = money(reservation.lateArrivalSurcharge);
    const seasonal = money(reservation.seasonalSurcharge);
    const extraGuests = money(reservation.extraGuestCharge);
    const extraMeals = money(reservation.extraMealCharge);
    const dayVisitors = money(reservation.dayVisitorCharge);
    const room = reservation.roomName || `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`.trim();
    if (baseRate > 0) {
      booking.push({ label: `${room} · ₱${baseRate.toLocaleString()} × ${unitLabel(reservation, units)}`, amount: money(baseRate * units) });
      if (extraGuests > 0) booking.push({ label: 'Extra guests', amount: extraGuests });
      if (extraMeals > 0) booking.push({ label: `Meals for extra guests · ${Number(reservation.extraMealGuests || 0)} × ₱${Number(reservation.extraMealRate || 350).toLocaleString()}`, amount: extraMeals });
      if (dayVisitors > 0) booking.push({ label: dayVisitorLabel(reservation), amount: dayVisitors });
      if (lateArrival > 0) booking.push({ label: 'Late arrival after 9:00 PM (10% of room rate)', amount: lateArrival });
      if (seasonal !== 0) booking.push({ label: `${seasonal > 0 ? 'Peak-season rate' : 'Season discount'}${reservation.seasonalLabel ? ` · ${reservation.seasonalLabel}` : ''}`, amount: seasonal });
    } else {
      // Older bookings without a price breakdown: one room line.
      booking.push({ label: `${room} · ${unitLabel(reservation, units)}`, amount: money(total + discount - cottageFee - dayVisitors - lateArrival) });
      if (dayVisitors > 0) booking.push({ label: dayVisitorLabel(reservation), amount: dayVisitors });
      if (lateArrival > 0) booking.push({ label: 'Late arrival after 9:00 PM (10% of room rate)', amount: lateArrival });
    }
  }

  if (cottageFee > 0) {
    // Older cottage names still show on bookings made with them.
    const name = reservation.cottageId ? getCottageLabel(reservation.cottageId).replace(/\s*\(.*\)$/, '') : 'Cottage rental';
    booking.push({ label: `Cottage: ${name}`, amount: cottageFee });
  }
  if (discount > 0) {
    booking.push({ label: `Promo discount${reservation.promoCode ? ` (${reservation.promoCode})` : ''}`, amount: -discount });
  }

  const itemized = Array.isArray(reservation.extraChargeItems) ? reservation.extraChargeItems : [];
  itemized.forEach(item => {
    const amount = money(item?.amount);
    // Senior / PWD discounts are saved as negative lines.
    if (amount > 0 || (amount < 0 && item.kind === 'discount')) extras.push({ label: String(item.description || 'Extra charge'), amount, service: Boolean(item.serviceId), discount: amount < 0 });
  });
  const lateFees = Array.isArray(reservation.lateCheckoutCharges) ? reservation.lateCheckoutCharges : [];
  lateFees.forEach(fee => {
    const amount = money(fee?.amount);
    if (amount > 0) extras.push({ label: `Late check-out${fee.note ? ` (${fee.note})` : ''}`, amount, service: false });
  });
  // Any charge total not covered by the items above (older records).
  const listed = money(extras.reduce((sum, item) => sum + item.amount, 0));
  const extraTotal = money(reservation.extraCharges);
  if (extraTotal - listed > 0.009) extras.push({ label: 'Other charges', amount: money(extraTotal - listed), service: false });

  const extrasTotal = money(extras.reduce((sum, item) => sum + item.amount, 0));
  return {
    booking,
    extras,
    bookingTotal: total,
    extrasTotal,
    grandTotal: money(total + extrasTotal),
    // All prices include 12% VAT.
    vat: getVatBreakdown(money(total + extrasTotal)),
  };
}

// One receipt for rooms booked together: each room's booking lines, then
// every room's add-ons (named by room), with combined totals.
export function getGroupReceiptLineItems(reservations = []) {
  const parts = reservations.map(r => ({ r, items: getReceiptLineItems(r) }));
  const booking = parts.flatMap(({ items }) => items.booking);
  const extras = parts.flatMap(({ r, items }) => items.extras.map(item => ({ ...item, label: `Room ${r.roomNumber || ''}: ${item.label}` })));
  const bookingTotal = money(parts.reduce((sum, p) => sum + p.items.bookingTotal, 0));
  const extrasTotal = money(extras.reduce((sum, item) => sum + item.amount, 0));
  return {
    booking,
    extras,
    bookingTotal,
    extrasTotal,
    grandTotal: money(bookingTotal + extrasTotal),
    vat: getVatBreakdown(money(bookingTotal + extrasTotal)),
  };
}
