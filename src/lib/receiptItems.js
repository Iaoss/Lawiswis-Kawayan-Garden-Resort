// Line items for a guest receipt, worked out from the reservation.
// `booking` is what was booked (room or package, extra guests, cottage,
// promo discount). `extras` is everything added later: spa, photoshoot,
// other extra charges and late check-out fees. Sections with nothing in them
// come back empty so the receipt can leave them out.
import { COTTAGE_OPTIONS } from './bookingPricing';

const money = value => Math.round(Number(value || 0) * 100) / 100;

const unitLabel = (reservation, units) => {
  if (reservation.bookingType === 'daytour') {
    const tour = reservation.tourPeriod === 'night' ? 'night tour' : 'day tour';
    return units === 1 ? `1 ${tour}` : `${units} ${tour}s`;
  }
  return units === 1 ? '1 night' : `${units} nights`;
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
  } else {
    const units = Math.max(1, Number(reservation.nights) || 1);
    const baseRate = money(reservation.baseRate);
    const extraGuests = money(reservation.extraGuestCharge);
    const room = reservation.roomName || `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`.trim();
    if (baseRate > 0) {
      booking.push({ label: `${room} · ₱${baseRate.toLocaleString()} × ${unitLabel(reservation, units)}`, amount: money(baseRate * units) });
      if (extraGuests > 0) booking.push({ label: 'Extra guests', amount: extraGuests });
    } else {
      // Older bookings without a price breakdown: one room line.
      booking.push({ label: `${room} · ${unitLabel(reservation, units)}`, amount: money(total + discount - cottageFee) });
    }
  }

  if (cottageFee > 0) {
    const cottage = COTTAGE_OPTIONS.find(option => option.id === reservation.cottageId);
    booking.push({ label: `Cottage: ${cottage ? cottage.label.replace(/\s*\(.*\)$/, '') : 'Cottage rental'}`, amount: cottageFee });
  }
  if (discount > 0) {
    booking.push({ label: `Promo discount${reservation.promoCode ? ` (${reservation.promoCode})` : ''}`, amount: -discount });
  }

  const itemized = Array.isArray(reservation.extraChargeItems) ? reservation.extraChargeItems : [];
  itemized.forEach(item => {
    const amount = money(item?.amount);
    if (amount > 0) extras.push({ label: String(item.description || 'Extra charge'), amount, service: Boolean(item.serviceId) });
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
  };
}
