import { sendPaymentReceiptEmail } from './email';

export async function sendPaymentReceipt(db, FieldValue, paymentDocumentId) {
  const paymentRef = db.collection('payments').doc(paymentDocumentId);
  const claim = await db.runTransaction(async transaction => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) throw new Error('Payment transaction not found');
    const payment = paymentSnap.data();
    if (payment.receiptSent) return { skip: true, alreadySent: true };
    const sendingAt = payment.receiptSendingAt?.toMillis?.() || 0;
    if (sendingAt > Date.now() - 5 * 60 * 1000) return { skip: true, pending: true };

    transaction.update(paymentRef, {
      receiptSendingAt: FieldValue.serverTimestamp(),
      receiptError: FieldValue.delete(),
    });
    return { payment };
  });

  if (claim.skip) return { sent: false, ...claim };

  try {
    const payment = claim.payment;
    const reservationSnap = await db.collection('reservations').doc(payment.reservationId).get();
    if (!reservationSnap.exists) throw new Error('Reservation for payment not found');
    const reservation = { id: reservationSnap.id, ...reservationSnap.data() };
    const email = reservation.email || reservation.guestEmail;
    if (!email) throw new Error('Guest email address is missing');

    const total = Number(reservation.totalAmount || 0)
      + Number(reservation.extraCharges || 0)
      + Number(reservation.taxAmount || 0);
    const balanceRemaining = Math.max(0, total - Number(reservation.amountPaid || 0));
    const receiptNumber = `RCP-${paymentDocumentId.slice(-8).toUpperCase()}`;
    await sendPaymentReceiptEmail(reservation, payment, receiptNumber, balanceRemaining);
    await paymentRef.update({
      receiptSent: true,
      receiptSentAt: FieldValue.serverTimestamp(),
      receiptSendingAt: FieldValue.delete(),
      receiptError: FieldValue.delete(),
    });
    return { sent: true, receiptNumber };
  } catch (error) {
    await paymentRef.update({
      receiptSendingAt: FieldValue.delete(),
      receiptError: String(error.message || 'Email delivery failed').slice(0, 500),
    });
    throw error;
  }
}
