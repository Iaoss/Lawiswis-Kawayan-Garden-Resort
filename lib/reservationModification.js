import { calculateBookingPrice } from '../src/lib/bookingPricing';
import { getCancellationPolicyOutcome, getDateRangeNights, normalizeCancellationPolicy } from '../src/lib/cancellationPolicy';
import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';

export function calculateReservationModification(reservation, room, checkIn, checkOut, policy) {
  if (reservation.type === 'corporate' || !reservation.roomId || !room) {
    return {
      outcome: 'needs_review',
      reason: 'This reservation needs staff to review its package pricing before changing dates.',
    };
  }
  if (reservation.promoCode || Number(reservation.extraCharges || 0) > 0) {
    return {
      outcome: 'needs_review',
      reason: 'This reservation has a promotion or additional charges that need manual repricing.',
    };
  }

  const isDayTour = reservation.bookingType === 'daytour';
  const newNights = isDayTour ? 1 : getDateRangeNights(checkIn, checkOut);
  const oldNights = isDayTour ? 1 : getDateRangeNights(reservation.checkIn, reservation.checkOut);
  const normalizedPolicy = normalizeCancellationPolicy(policy);
  if (!newNights || !oldNights || !normalizedPolicy) {
    return {
      outcome: 'needs_review',
      reason: 'The stay dates or cancellation policy could not be verified for automatic repricing.',
    };
  }

  try {
    const priceFor = nights => calculateBookingPrice({
      room,
      bookingType: reservation.bookingType,
      nights,
      adults: Number(reservation.adults),
      children: Number(reservation.children || 0),
      tourPeriod: reservation.tourPeriod || 'day',
      cottageId: reservation.cottageId || '',
      cottageFee: Number(reservation.cottageFee || 0),
    }).subtotalAmount;

    const oldTotal = Number(reservation.totalAmount);
    const calculatedOriginalTotal = priceFor(oldNights) - Number(reservation.promoDiscount || 0);
    if (!Number.isFinite(oldTotal) || oldTotal <= 0
      || Math.abs(calculatedOriginalTotal - oldTotal) > 0.01) {
      return {
        outcome: 'needs_review',
        reason: 'The stored reservation total differs from current room pricing; staff must verify the adjustment.',
      };
    }

    const updatedTotal = Math.max(0, priceFor(newNights) - Number(reservation.promoDiscount || 0));
    const difference = Math.round((updatedTotal - oldTotal) * 100) / 100;
    const result = {
      outcome: 'eligible',
      reason: '',
      checkIn,
      checkOut,
      oldTotal,
      updatedTotal,
      difference,
      changeType: difference > 0 ? 'extension' : difference < 0 ? 'reduction' : 'date_change',
      cancellationFee: 0,
      refundDue: 0,
      balanceDue: 0,
      paymentDue: 0,
      nights: newNights,
    };

    if (difference > 0) {
      result.paymentDue = getOnlinePaymentAmount(difference, 'deposit');
      result.reason = `The new stay costs ₱${difference.toLocaleString()} more. A 50% down payment on the difference is required.`;
    } else if (difference < 0) {
      const reduction = Math.abs(difference);
      const policyOutcome = getCancellationPolicyOutcome({
        policy: normalizedPolicy,
        checkIn: reservation.checkIn,
        amount: reduction,
        amountPaid: reduction,
      });
      if (policyOutcome.outcome === 'needs_review') {
        return { outcome: 'needs_review', reason: policyOutcome.reason };
      }
      result.cancellationFee = policyOutcome.feeAmount;
      const adjustedTotal = updatedTotal + result.cancellationFee;
      const amountPaid = Number(reservation.amountPaid || 0);
      result.refundDue = Math.max(0, Math.round((amountPaid - adjustedTotal) * 100) / 100);
      result.balanceDue = Math.max(0, Math.round((adjustedTotal - amountPaid) * 100) / 100);
      result.updatedTotal = adjustedTotal;
      result.reason = `The shortened stay has a ₱${result.cancellationFee.toLocaleString()} cancellation fee under the current policy. Any unpaid balance is offset before calculating a refund.`;
    } else {
      result.reason = 'The requested dates have the same price as the current reservation.';
    }

    return result;
  } catch (error) {
    return {
      outcome: 'needs_review',
      reason: error.message || 'Room pricing could not be verified automatically.',
    };
  }
}

