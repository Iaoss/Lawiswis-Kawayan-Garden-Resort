import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { calculateReservationModification } from '../lib/reservationModification';
import { sendRefundDecisionEmail, sendScheduleChangeEmail } from '../lib/email';
import { createPayMongoCheckoutSession } from '../lib/paymongoCheckout';
import { DEFAULT_CANCELLATION_POLICY, getDateRangeNights } from '../src/lib/cancellationPolicy';
import { getOnlinePaymentAmount } from '../src/lib/paymentPolicy';
import { getStayUnits, stayRangesOverlap } from '../src/lib/bookingPricing';
import { getRequestedBookingFields } from '../src/lib/bookingDetails';
import { getDateChangeBlock } from '../src/lib/cancellationPolicy';

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed'];

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

async function paymongoRefund(paymentId, amount, reservationId, requestId, modification = false) {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret) throw new Error('PayMongo secret key is not configured.');
  const response = await fetch('https://api.paymongo.com/v1/refunds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: cents(amount),
          payment_id: paymentId,
          reason: 'requested_by_customer',
          notes: `Reservation ${reservationId}; refund request ${requestId}`,
          metadata: {
            reservationId,
            ...(modification ? { modificationRequestId: requestId } : { refundRequestId: requestId }),
          },
        },
      },
    }),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('PayMongo returned an invalid refund response.');
  }
  if (!response.ok) throw new Error(json.errors?.[0]?.detail || 'PayMongo refund request failed.');
  if (!json.data?.id) throw new Error('PayMongo did not return a refund reference.');
  return json.data;
}

async function getPaymentAllocations(reservationId, refundAmount, requestId, requestField) {
  const [paymentsSnapshot, refundsSnapshot] = await Promise.all([
    adminDb.collection('payments').where('reservationId', '==', reservationId).get(),
    adminDb.collection('refunds').where('reservationId', '==', reservationId).get(),
  ]);
  const refunded = new Map();
  let alreadyPendingForRequest = 0;
  refundsSnapshot.docs.forEach(snapshot => {
    const refund = snapshot.data();
    const failed = ['failed', 'canceled', 'cancelled'].includes(String(refund.status || '').toLowerCase());
    if (refund[requestField] === requestId && !failed) {
      alreadyPendingForRequest += Number(refund.amount || 0);
    }
    if (!refund.processorRefundId || failed) return;
    refunded.set(refund.paymentId, (refunded.get(refund.paymentId) || 0) + Number(refund.amount || 0));
  });
  let left = Math.max(0, cents(refundAmount) - cents(alreadyPendingForRequest));
  const allocations = [];
  for (const snapshot of paymentsSnapshot.docs) {
    const payment = snapshot.data();
    if (payment.provider !== 'paymongo' || !payment.paymentId) continue;
    const available = Math.max(0, cents(payment.amount) - cents(refunded.get(payment.paymentId) || 0));
    const allocated = Math.min(left, available);
    if (allocated > 0) {
      allocations.push({
        paymentId: payment.paymentId,
        paymentDocumentId: snapshot.id,
        amount: allocated / 100,
      });
      left -= allocated;
    }
    if (left <= 0) break;
  }
  if (left > 0) throw new Error('Original PayMongo transactions do not cover the approved refund.');
  return allocations;
}

async function submitModificationRefund(reservationRef, reservationId, requestId, amount, staff) {
  const created = [];
  try {
    const allocations = await getPaymentAllocations(reservationId, amount, requestId, 'modificationRequestId');
    const refundRefs = allocations.map(allocation => ({
      allocation,
      ref: adminDb.collection('refunds').doc(
        `modrefund_${requestId}_${allocation.paymentId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      ),
    }));
    for (const { allocation, ref } of refundRefs) {
      await ref.set({
        reservationId,
        modificationRequestId: requestId,
        paymentId: allocation.paymentId,
        paymentDocumentId: allocation.paymentDocumentId,
        amount: allocation.amount,
        provider: 'paymongo',
        status: 'submitting',
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: staff.uid,
      }, { merge: true });
    }
    await reservationRef.update({ 'modificationRequest.status': 'awaiting_refund' });
    for (const { allocation, ref } of refundRefs) {
      const refund = await paymongoRefund(allocation.paymentId, allocation.amount, reservationId, requestId, true);
      const status = refund.attributes?.status || 'pending';
      await ref.update({
        processorRefundId: refund.id,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      created.push({ id: refund.id, status });
    }
  } catch (error) {
    await reservationRef.update({
      'modificationRequest.status': 'needs_review',
      'modificationRequest.processingError': String(error.message || 'Refund processing failed').slice(0, 500),
    });
    await reservationRef.collection('modificationAudit').add({
      action: 'schedule_change_refund_error',
      modificationRequestId: requestId,
      staffUid: staff.uid,
      error: String(error.message || 'Refund processing failed').slice(0, 500),
      createdAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }
  await reservationRef.update({
    'modificationRequest.status': 'awaiting_refund',
    'modificationRequest.refundProcessorReferences': created,
    'modificationRequest.processingError': FieldValue.delete(),
  });
  return created;
}

async function approveRefund({ reservationRef, reservationId, requestId, staff, amountOverride }) {
  if (staff.role !== 'admin') throw new Error('Only an administrator can approve refund requests.');
  const claim = await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists) throw new Error('Reservation not found.');
    const reservation = snapshot.data();
    const request = reservation.refundRequestId === requestId ? reservation.refundDecision : null;
    if (!request) throw new Error('Refund request no longer matches this reservation.');
    if (['processing', 'awaiting_confirmation', 'refunded'].includes(reservation.refundRequestStatus)) {
      return { duplicate: true, reservation, amount: Number(request.refundableAmount || 0) };
    }
    if (!['eligible', 'needs_review'].includes(reservation.refundRequestStatus)) {
      throw new Error('This refund request is not awaiting approval.');
    }
    const amount = amountOverride === undefined
      ? Number(request.refundableAmount || 0)
      : Number(amountOverride);
    if (!Number.isFinite(amount) || amount <= 0 || cents(amount) > cents(reservation.amountPaid)) {
      throw new Error('Enter a positive refund amount no greater than the amount paid.');
    }
    transaction.update(reservationRef, {
      refundRequestStatus: 'processing',
      refundApprovedAt: FieldValue.serverTimestamp(),
      refundApprovedBy: staff.uid,
      refundApprovedAmount: amount,
    });
    const auditRef = reservationRef.collection('refundAudit').doc();
    transaction.set(auditRef, {
      action: 'refund_approved',
      staffUid: staff.uid,
      amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { duplicate: false, reservation, amount };
  });
  if (claim.duplicate) return { status: 'processing', amount: claim.amount, alreadyProcessing: true };

  const created = [];
  try {
    const allocations = await getPaymentAllocations(reservationId, claim.amount, requestId, 'refundRequestId');
    const refundRefs = allocations.map(allocation => ({
      allocation,
      ref: adminDb.collection('refunds').doc(
        `refund_${requestId}_${allocation.paymentId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      ),
    }));
    for (const { allocation, ref } of refundRefs) {
      await ref.set({
        reservationId,
        refundRequestId: requestId,
        paymentId: allocation.paymentId,
        paymentDocumentId: allocation.paymentDocumentId,
        amount: allocation.amount,
        provider: 'paymongo',
        status: 'submitting',
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: staff.uid,
      }, { merge: true });
    }
    await reservationRef.update({ refundRequestStatus: 'awaiting_confirmation' });
    for (const { allocation, ref } of refundRefs) {
      const refund = await paymongoRefund(allocation.paymentId, allocation.amount, reservationId, requestId);
      const status = refund.attributes?.status || 'pending';
      await ref.update({
        processorRefundId: refund.id,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      created.push({ id: refund.id, status });
    }
  } catch (error) {
    await reservationRef.update({
      refundRequestStatus: 'needs_review',
      refundProcessingError: String(error.message || 'Refund processing failed').slice(0, 500),
    });
    await reservationRef.collection('refundAudit').add({
      action: 'refund_processor_error',
      staffUid: staff.uid,
      error: String(error.message || 'Refund processing failed').slice(0, 500),
      createdAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }
  await reservationRef.update({
    refundProcessorReferences: created,
    refundProcessingError: FieldValue.delete(),
  });
  try {
    await sendRefundDecisionEmail({
      reservation: claim.reservation,
      bookingRef: reservationId.slice(0, 8).toUpperCase(),
      outcome: 'approved',
      reason: 'Your refund has been submitted to the original payment method.',
      amount: claim.amount,
      processorReference: created.map(item => item.id).join(', '),
      timeline: 'The refund is being processed by the payment provider. The case will close after PayMongo confirms the refund.',
    });
  } catch (emailError) {
    console.error('Refund decision email failed:', emailError);
  }
  return { status: 'awaiting_confirmation', amount: claim.amount, refunds: created };
}

async function decideRefund({ reservationRef, reservationId, requestId, staff, action, reason }) {
  if (staff.role !== 'admin') throw new Error('Only an administrator can decide refund requests.');
  const status = action === 'reject-refund' ? 'rejected' : 'needs_review';
  let reservationData;
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists) throw new Error('Reservation not found.');
    reservationData = snapshot.data();
    if (reservationData.refundRequestId !== requestId
      || !['eligible', 'needs_review'].includes(reservationData.refundRequestStatus)) {
      throw new Error('This refund request is no longer awaiting a decision.');
    }
    transaction.update(reservationRef, {
      refundRequestStatus: status,
      refundDecision: { ...reservationData.refundDecision, staffReason: reason },
      refundDecidedAt: FieldValue.serverTimestamp(),
      refundDecidedBy: staff.uid,
    });
    transaction.set(reservationRef.collection('refundAudit').doc(), {
      action: status === 'rejected' ? 'refund_rejected' : 'refund_returned_for_review',
      staffUid: staff.uid,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  if (status === 'rejected') {
    try {
      await sendRefundDecisionEmail({
        reservation: reservationData,
        bookingRef: reservationId.slice(0, 8).toUpperCase(),
        outcome: 'rejected',
        reason,
        alternatives: ['Contact the resort if you would like staff to review additional information.'],
        amount: 0,
      });
    } catch (emailError) {
      console.error('Refund rejection email failed:', emailError);
      await reservationRef.update({
        refundNotificationError: String(emailError.message || 'Email delivery failed').slice(0, 500),
      });
    }
  }
  return { status };
}

async function decideModification({ reservationRef, reservationId, requestId, staff, action, reason, body, siteUrl }) {
  let checkout = null;
  const result = await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists) throw new Error('Reservation not found.');
    const reservation = snapshot.data();
    const request = reservation.modificationRequest;
    if (!request || request.id !== requestId) throw new Error('Schedule-change request no longer matches.');
    if (!['requested', 'needs_review'].includes(request.status)) {
      throw new Error('This schedule-change request is no longer awaiting review.');
    }
    const auditRef = reservationRef.collection('modificationAudit').doc();
    if (action === 'reject-modification') {
      transaction.update(reservationRef, {
        'modificationRequest.status': 'rejected',
        'modificationRequest.staffReason': reason,
        'modificationRequest.decidedAt': FieldValue.serverTimestamp(),
        'modificationRequest.decidedBy': staff.uid,
      });
      transaction.set(auditRef, {
        action: 'schedule_change_rejected', staffUid: staff.uid, reason,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { rejected: true, reservation };
    }

    if (!ACTIVE_RESERVATION_STATUSES.includes(String(reservation.status || '').toLowerCase())) {
      throw new Error('Only pending or confirmed reservations can be modified.');
    }
    const requestedCheckIn = request.requestedCheckIn;
    const requestedCheckOut = request.requestedCheckOut;
    // Re-checked at approval time: the 30-day window may have passed since
    // the guest asked.
    const dateBlock = getDateChangeBlock({ originalCheckIn: reservation.checkIn, newCheckIn: requestedCheckIn });
    if (dateBlock) throw new Error(`${dateBlock} Reject this request instead.`);
    const roomRef = reservation.roomId ? adminDb.collection('rooms').doc(reservation.roomId) : null;
    let change;
    if (roomRef) {
      const [roomSnapshot, conflicts] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(adminDb.collection('reservations').where('roomId', '==', reservation.roomId)),
      ]);
      if (!roomSnapshot.exists) throw new Error('The booked room could not be found.');
      const conflict = conflicts.docs.some(doc => {
        if (doc.id === reservationId) return false;
        const other = doc.data();
        return !['cancelled', 'checked-out', 'rejected'].includes(String(other.status || '').toLowerCase())
          && typeof other.checkIn === 'string' && typeof other.checkOut === 'string'
          && stayRangesOverlap(requestedCheckIn, requestedCheckOut, other.checkIn.slice(0, 10), other.checkOut.slice(0, 10));
      });
      if (conflict) throw new Error('The requested dates are no longer available.');
      const policySnapshot = await transaction.get(adminDb.doc('settings/cancellationPolicy'));
      change = calculateReservationModification(
        reservation, roomSnapshot.data(), requestedCheckIn, requestedCheckOut,
        policySnapshot.exists ? policySnapshot.data() : DEFAULT_CANCELLATION_POLICY,
        getRequestedBookingFields(request),
      );
    } else {
      change = { outcome: 'needs_review', reason: 'This reservation requires a staff-entered total.' };
    }
    if (request.outcome === 'needs_review' || change.outcome === 'needs_review') {
      const manualTotal = Number(body.updatedTotal);
      if (!Number.isFinite(manualTotal) || manualTotal <= 0) {
        throw new Error(change.reason || request.reason || 'Enter the verified updated reservation total.');
      }
      const difference = Math.round((manualTotal - Number(reservation.totalAmount || 0)) * 100) / 100;
      const manualRefundDue = difference < 0
        ? Math.max(0, Math.round((Number(reservation.amountPaid || 0) - manualTotal) * 100) / 100)
        : 0;
      change = {
        ...change,
        outcome: 'eligible',
        reason: reason || 'Schedule change reviewed and repriced by staff.',
        checkIn: requestedCheckIn,
        checkOut: requestedCheckOut,
        oldTotal: Number(reservation.totalAmount || 0),
        updatedTotal: manualTotal,
        difference,
        changeType: difference > 0 ? 'extension' : difference < 0 ? 'reduction' : 'date_change',
        paymentDue: difference > 0 ? getOnlinePaymentAmount(difference, 'deposit') : 0,
        refundDue: manualRefundDue,
        cancellationFee: Number(request.cancellationFee || 0),
        nights: (request.requestedBookingType || reservation.bookingType) === 'daytour'
          ? getStayUnits(requestedCheckIn, requestedCheckOut)
          : getDateRangeNights(requestedCheckIn, requestedCheckOut),
      };
    }
    const nextStatus = change.paymentDue > 0
      ? 'awaiting_payment'
      : change.refundDue > 0 ? 'awaiting_refund' : 'completed';
    const updatedRequest = {
      ...request,
      ...change,
      status: nextStatus,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: staff.uid,
      staffReason: reason || '',
    };
    if (['awaiting_payment', 'awaiting_refund'].includes(nextStatus)) {
      transaction.update(reservationRef, { modificationRequest: updatedRequest });
    } else {
      transaction.update(reservationRef, {
        ...getRequestedBookingFields(request),
        checkIn: requestedCheckIn,
        checkOut: requestedCheckOut,
        totalAmount: change.updatedTotal,
        nights: change.nights || reservation.nights,
        modificationRequest: updatedRequest,
      });
    }
    transaction.set(auditRef, {
      action: nextStatus === 'awaiting_payment' ? 'schedule_change_approved_payment_due' : 'schedule_change_approved',
      staffUid: staff.uid,
      requestedCheckIn,
      requestedCheckOut,
      updatedTotal: change.updatedTotal,
      paymentDue: change.paymentDue || 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { reservation, change: updatedRequest, nextStatus };
  });
  if (result.rejected) {
    try {
      await sendScheduleChangeEmail({
        reservation: result.reservation,
        bookingRef: reservationId.slice(0, 8).toUpperCase(),
        change: { ...result.reservation.modificationRequest, status: 'rejected', reason },
      });
    } catch (emailError) {
      console.error('Schedule change rejection email failed:', emailError);
      await reservationRef.update({
        'modificationRequest.emailError': String(emailError.message || 'Email delivery failed').slice(0, 500),
      });
    }
    return { status: 'rejected' };
  }

  if (result.nextStatus === 'awaiting_payment') {
    try {
      checkout = await createPayMongoCheckoutSession({
        reservationId,
        amount: result.change.paymentDue,
        guestName: result.reservation.guestName,
        guestEmail: result.reservation.email || result.reservation.guestEmail,
        description: `Schedule change deposit for booking #${reservationId.slice(0, 8).toUpperCase()}`,
        paymentType: 'billing',
        modificationRequestId: requestId,
        siteUrl,
      });
      await reservationRef.update({
        'modificationRequest.paymentCheckoutSessionId': checkout.checkoutSessionId,
      });
    } catch (error) {
      await reservationRef.update({
        'modificationRequest.status': 'requested',
        'modificationRequest.processingError': String(error.message || 'Checkout setup failed').slice(0, 500),
      });
      throw error;
    }
  } else if (result.nextStatus === 'awaiting_refund') {
    await submitModificationRefund(reservationRef, reservationId, requestId, result.change.refundDue, staff);
  }
  try {
    await sendScheduleChangeEmail({
      reservation: result.reservation,
      bookingRef: reservationId.slice(0, 8).toUpperCase(),
      change: result.change,
      paymentUrl: checkout?.checkoutUrl || '',
    });
  } catch (emailError) {
    console.error('Schedule change decision email failed:', emailError);
    await reservationRef.update({
      'modificationRequest.emailError': String(emailError.message || 'Email delivery failed').slice(0, 500),
    });
  }
  return { status: result.nextStatus, checkoutUrl: checkout?.checkoutUrl || '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  if (!adminDb) return res.status(503).json({ error: 'Reservation service is unavailable.' });
  const { action, reservationId, requestId, reason = '', amount, updatedTotal } = req.body || {};
  if (!reservationId || !requestId || typeof reason !== 'string' || reason.length > 500) {
    return res.status(400).json({ error: 'A reservation, request ID, and valid reason are required.' });
  }
  const reservationRef = adminDb.collection('reservations').doc(reservationId);
  try {
    let result;
    if (action === 'approve-refund') {
      result = await approveRefund({
        reservationRef, reservationId, requestId, staff,
        amountOverride: amount === '' || amount === undefined ? undefined : amount,
      });
    } else if (action === 'reject-refund' || action === 'review-refund') {
      result = await decideRefund({ reservationRef, reservationId, requestId, staff, action, reason });
    } else if (['approve-modification', 'reject-modification'].includes(action)) {
      result = await decideModification({
        reservationRef, reservationId, requestId, staff, action, reason,
        body: { updatedTotal },
        siteUrl: process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`,
      });
    } else {
      return res.status(400).json({ error: 'Choose a valid reservation action.' });
    }
    const ref = `#${String(reservationId).slice(0, 8).toUpperCase()}`;
    const summaries = {
      'approve-refund': `Approved a refund on booking ${ref}`,
      'reject-refund': `Rejected a refund request on booking ${ref}`,
      'review-refund': `Sent a refund request on booking ${ref} back for review`,
      'approve-modification': `Approved a date change on booking ${ref}`,
      'reject-modification': `Rejected a date change on booking ${ref}`,
    };
    await logActivity(staff, {
      action: action.replace('-', '_'),
      summary: reason ? `${summaries[action]} (${reason.slice(0, 120)})` : summaries[action],
      reservationId,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Staff reservation action failed:', error);
    return res.status(409).json({ error: error.message || 'Could not process the staff decision.' });
  }
}
