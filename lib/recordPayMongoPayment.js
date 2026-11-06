import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';
import { stayRangesOverlap } from '../src/lib/bookingPricing';
import { holdsRoom, isHoldExpired } from '../src/lib/unpaidBookings';
import { splitGroupPayment } from '../src/lib/groupBooking';

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

// Several rooms booked together are paid with one checkout on the first
// booking. The first online payment is split across the linked bookings in
// proportion to their totals, so each room gets its own payment record.
export async function recordPayMongoPayment(db, FieldValue, payment) {
  const transactionKey = payment.paymentId || payment.checkoutSessionId || payment.eventId;
  if (!transactionKey) throw new Error('PayMongo payment has no transaction identifier');

  const safeTransactionKey = String(transactionKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  const reservationRef = db.collection('reservations').doc(payment.reservationId);
  const paymentRef = db.collection('payments').doc(`paymongo_${safeTransactionKey}`);
  const activityRef = db.collection('activities').doc(`paymongo_${safeTransactionKey}`);

  return db.runTransaction(async transaction => {
    const paymentSnap = await transaction.get(paymentRef);
    if (paymentSnap.exists) return { recorded: false, paymentDocumentId: paymentRef.id, group: [] };

    const reservationSnap = await transaction.get(reservationRef);
    if (!reservationSnap.exists) throw new Error('Reservation not found for PayMongo payment');
    const main = reservationSnap.data();

    // Which bookings this payment covers (one, or the linked rooms).
    const groupIds = (!payment.paymentType || payment.paymentType === 'booking')
      && !payment.modificationRequestId
      && Number(main.amountPaid || 0) === 0
      && Array.isArray(main.groupReservationIds) && main.groupReservationIds.length > 1
      ? main.groupReservationIds
      : [payment.reservationId];
    const targets = [];
    for (const id of groupIds) {
      const ref = id === payment.reservationId ? reservationRef : db.collection('reservations').doc(id);
      const snap = id === payment.reservationId ? reservationSnap : await transaction.get(ref);
      if (snap.exists) targets.push({ id, ref, data: snap.data() });
    }
    const shares = splitGroupPayment(Number(payment.amountPaid || 0), targets.map(t => Number(t.data.totalAmount || 0)));

    // Reads first (Firestore transactions): hold conflicts for each room.
    for (const target of targets) {
      const r = target.data;
      target.holdConflict = false;
      if (r.roomId && isHoldExpired(r)) {
        const others = await transaction.get(db.collection('reservations').where('roomId', '==', r.roomId));
        target.holdConflict = others.docs.some(doc => {
          if (doc.id === target.id) return false;
          const other = doc.data();
          return holdsRoom(other) && typeof other.checkIn === 'string'
            && stayRangesOverlap(String(r.checkIn).slice(0, 10), String(r.checkOut || r.checkIn).slice(0, 10),
              other.checkIn.slice(0, 10), String(other.checkOut || other.checkIn).slice(0, 10));
        });
      }
    }

    const group = targets.map((target, index) => {
      const r = target.data;
      const share = shares[index];
      const newAmountPaid = Number(r.amountPaid || 0) + share;
      const total = Number(r.totalAmount || 0) + Number(r.extraCharges || 0);
      const isFullyPaid = Math.round(newAmountPaid * 100) >= Math.round(total * 100);
      const autoConfirmed = !target.holdConflict && shouldAutoConfirm(r, payment, newAmountPaid);
      // The paying booking keeps the main record (it guards against recording twice).
      const docRef = target.id === payment.reservationId
        ? paymentRef
        : db.collection('payments').doc(`paymongo_${safeTransactionKey}_${index}`);
      transaction.update(target.ref, {
        ...(target.holdConflict ? { holdConflict: true, holdConflictAt: FieldValue.serverTimestamp() } : {}),
        paymentStatus: isFullyPaid ? 'paid' : 'partial',
        amountPaid: newAmountPaid,
        ...(autoConfirmed ? {
          status: 'confirmed',
          autoConfirmedAt: FieldValue.serverTimestamp(),
          statusUpdatedAt: FieldValue.serverTimestamp(),
          statusUpdatedBy: 'paymongo',
        } : {}),
      });
      transaction.set(docRef, {
        reservationId: target.id,
        guestName: r.guestName || '',
        roomNumber: r.roomNumber || '',
        amount: share,
        method: payment.paymentMethod || 'unknown',
        provider: 'paymongo',
        checkoutSessionId: payment.checkoutSessionId || null,
        paymentId: payment.paymentId || null,
        ...(targets.length > 1 ? { groupId: main.groupId || payment.reservationId, groupPaymentTotal: Number(payment.amountPaid || 0) } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        reservationId: target.id,
        paymentDocumentId: docRef.id,
        amountPaid: newAmountPaid,
        paymentStatus: isFullyPaid ? 'paid' : 'partial',
        autoConfirmed,
        holdConflict: target.holdConflict,
      };
    });
    transaction.set(activityRef, {
      title: 'PayMongo payment received',
      sub: `₱${Number(payment.amountPaid || 0).toLocaleString()} via ${payment.paymentMethod || 'unknown'} — reservation ${payment.reservationId}${targets.length > 1 ? ` (${targets.length} rooms)` : ''}`,
      timestamp: FieldValue.serverTimestamp(),
    });

    const first = group.find(item => item.reservationId === payment.reservationId) || group[0];
    return {
      recorded: true,
      paymentDocumentId: first.paymentDocumentId,
      amountPaid: first.amountPaid,
      paymentStatus: first.paymentStatus,
      autoConfirmed: first.autoConfirmed,
      holdConflict: first.holdConflict,
      // The other linked rooms (empty for a single booking).
      group: group.filter(item => item !== first),
    };
  });
}
