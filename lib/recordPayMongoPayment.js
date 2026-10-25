import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';

// A verified online booking payment confirms a pending reservation once it
// covers at least the required deposit. Not for balance top-ups, date-change
// payments, group/corporate bookings (staff review those), or bookings that
// are cancelled or already past Pending.
export function shouldAutoConfirm(reservation, payment, newAmountPaid) {
  if (String(reservation.status || '').toLowerCase() !== 'pending') return false;
  if (reservation.type === 'corporate') return false;
  if (payment.paymentType && payment.paymentType !== 'booking') return false;
  if (payment.modificationRequestId) return false;
  const total = Number(reservation.totalAmount || 0);
  if (!(total > 0)) return false;
  const deposit = getOnlinePaymentAmount(total, 'deposit');
  return Math.round(newAmountPaid * 100) >= Math.round(deposit * 100);
}

export async function recordPayMongoPayment(db, FieldValue, payment) {
  const transactionKey = payment.paymentId || payment.checkoutSessionId || payment.eventId;
  if (!transactionKey) throw new Error('PayMongo payment has no transaction identifier');

  const safeTransactionKey = String(transactionKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  const reservationRef = db.collection('reservations').doc(payment.reservationId);
  const paymentRef = db.collection('payments').doc(`paymongo_${safeTransactionKey}`);
  const activityRef = db.collection('activities').doc(`paymongo_${safeTransactionKey}`);

  return db.runTransaction(async transaction => {
    const paymentSnap = await transaction.get(paymentRef);
    if (paymentSnap.exists) return { recorded: false, paymentDocumentId: paymentRef.id };

    const reservationSnap = await transaction.get(reservationRef);
    if (!reservationSnap.exists) throw new Error('Reservation not found for PayMongo payment');

    const reservation = reservationSnap.data();
    const newAmountPaid = Number(reservation.amountPaid || 0) + Number(payment.amountPaid || 0);
    const reservationTotal = Number(reservation.totalAmount || 0) + Number(reservation.extraCharges || 0);
    const isFullyPaid = Math.round(newAmountPaid * 100) >= Math.round(reservationTotal * 100);

    const autoConfirmed = shouldAutoConfirm(reservation, payment, newAmountPaid);
    transaction.update(reservationRef, {
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      amountPaid: newAmountPaid,
      ...(autoConfirmed ? {
        status: 'confirmed',
        autoConfirmedAt: FieldValue.serverTimestamp(),
        statusUpdatedAt: FieldValue.serverTimestamp(),
        statusUpdatedBy: 'paymongo',
      } : {}),
    });
    transaction.set(paymentRef, {
      reservationId: payment.reservationId,
      guestName: reservation.guestName || '',
      roomNumber: reservation.roomNumber || '',
      amount: Number(payment.amountPaid || 0),
      method: payment.paymentMethod || 'unknown',
      provider: 'paymongo',
      checkoutSessionId: payment.checkoutSessionId || null,
      paymentId: payment.paymentId || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(activityRef, {
      title: 'PayMongo payment received',
      sub: `₱${Number(payment.amountPaid || 0).toLocaleString()} via ${payment.paymentMethod || 'unknown'} — reservation ${payment.reservationId}`,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      recorded: true,
      paymentDocumentId: paymentRef.id,
      amountPaid: newAmountPaid,
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      autoConfirmed,
    };
  });
}
