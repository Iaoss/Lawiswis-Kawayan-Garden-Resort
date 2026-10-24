import { calculateBookingPrice, getStayUnits } from '../src/lib/bookingPricing';
import { getDateChangeBlock, getDateRangeNights, normalizeCancellationPolicy } from '../src/lib/cancellationPolicy';
import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';

// Works out the new price for a change to a reservation. `requested` holds
// the new dates and, optionally, a new booking type, tour period and guest
// count (from src/lib/bookingDetails normalizeBookingDetails). Anything not
// given keeps the reservation's current value.
export function calculateReservationModification(reservation, room, checkIn, checkOut, policy, requested = {}) {
  if (reservation.type === 'corporate' || !reservation.roomId || !room) {
    return {
      outcome: 'needs_review',
      reason: 'This reservation needs staff to review its package pricing before changing dates.',
    };
  }
  // Policy: dates can only move 30+ days before arrival, never on or after it.
  const dateBlock = getDateChangeBlock({ originalCheckIn: reservation.checkIn, newCheckIn: checkIn, now: requested.now });
  if (dateBlock) return { outcome: 'not_allowed', reason: dateBlock };
  if (reservation.promoCode || Number(reservation.extraCharges || 0) > 0) {
    return {
      outcome: 'needs_review',
      reason: 'This reservation has a promotion or additional charges that need manual repricing.',
    };
  }

  const next = {
    bookingType: requested.bookingType || reservation.bookingType,
    tourPeriod: requested.bookingType ? requested.tourPeriod : reservation.tourPeriod,
    adults: requested.adults ?? Number(reservation.adults),
    children: requested.children ?? Number(reservation.children || 0),
  };
  // Tours are single-day bookings; overnight stays count nights.
  const newNights = next.bookingType === 'daytour' ? getStayUnits(checkIn, checkOut) : getDateRangeNights(checkIn, checkOut);
  const oldNights = Number(reservation.nights) || (reservation.bookingType === 'daytour'
    ? getStayUnits(reservation.checkIn, reservation.checkOut) || 1
    : getDateRangeNights(reservation.checkIn, reservation.checkOut));
  const normalizedPolicy = normalizeCancellationPolicy(policy);
  if (!newNights || !oldNights || !normalizedPolicy) {
    return {
      outcome: 'needs_review',
      reason: 'The stay dates or cancellation policy could not be verified for automatic repricing.',
    };
  }

  try {
    const priceFor = (booking, nights) => calculateBookingPrice({
      room,
      bookingType: booking.bookingType,
      nights,
      adults: Number(booking.adults),
      children: Number(booking.children || 0),
      tourPeriod: booking.tourPeriod || 'day',
      cottageId: reservation.cottageId || '',
      cottageFee: Number(reservation.cottageFee || 0),
    }).subtotalAmount;

    const oldTotal = Number(reservation.totalAmount);
    const calculatedOriginalTotal = priceFor(reservation, oldNights) - Number(reservation.promoDiscount || 0);
    if (!Number.isFinite(oldTotal) || oldTotal <= 0
      || Math.abs(calculatedOriginalTotal - oldTotal) > 0.01) {
      return {
        outcome: 'needs_review',
        reason: 'The stored reservation total differs from current room pricing; staff must verify the adjustment.',
      };
    }

    const newPrice = Math.max(0, priceFor(next, newNights) - Number(reservation.promoDiscount || 0));
    // Policy: reducing rooms, changing room type or shortening the stay is
    // not refunded, so the total never goes below what was booked.
    const updatedTotal = Math.max(newPrice, oldTotal);
    const difference = Math.round((updatedTotal - oldTotal) * 100) / 100;
    const result = {
      outcome: 'eligible',
      reason: '',
      checkIn,
      checkOut,
      oldTotal,
      updatedTotal,
      difference,
      changeType: difference > 0 ? 'extension' : newPrice < oldTotal ? 'reduction_no_refund' : 'date_change',
      cancellationFee: 0,
      refundDue: 0,
      balanceDue: 0,
      paymentDue: 0,
      nights: newNights,
    };

    if (difference > 0) {
      result.paymentDue = getOnlinePaymentAmount(difference, 'deposit');
      result.reason = `The new booking costs ₱${difference.toLocaleString()} more. A 50% down payment on the difference is required.`;
    } else if (newPrice < oldTotal) {
      result.reason = `The new booking would cost ₱${newPrice.toLocaleString()}, but under the resort policy reductions and shorter stays aren't refunded, so the full ₱${oldTotal.toLocaleString()} charge stays.`;
    } else {
      result.reason = 'The requested change has the same price as the current reservation.';
    }

    return result;
  } catch (error) {
    return {
      outcome: 'needs_review',
      reason: error.message || 'Room pricing could not be verified automatically.',
    };
  }
}

