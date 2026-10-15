import crypto from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { DEFAULT_CANCELLATION_POLICY, getCancellationPolicyOutcome, getDateRangeNights } from '../src/lib/cancellationPolicy';
import { sendRefundDecisionEmail, sendScheduleChangeEmail } from '../lib/email';
import { calculateReservationModification } from '../lib/reservationModification';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const ACTIVE_REFUND_STATUSES = ['eligible', 'needs_review', 'approved', 'processing', 'awaiting_confirmation'];
const ACTIVE_MODIFICATION_STATUSES = ['requested', 'needs_review', 'approved', 'awaiting_payment', 'awaiting_refund'];

function publicReservation(snapshot) {
  const reservation = snapshot.data();
  return {
    bookingId: snapshot.id,
    roomName: reservation.type === 'corporate'
      ? `${reservation.packageName || 'Corporate package'} · ${Number(reservation.totalGuests || 0)} guests`
      : `Room ${reservation.roomNumber || ''}${reservation.roomType ? ` (${reservation.roomType})` : ''}`.trim(),
    checkIn: reservation.checkIn || '',
    checkOut: reservation.checkOut || '',
    totalAmount: Number(reservation.totalAmount || 0),
    amountPaid: Number(reservation.amountPaid || 0),
    status: reservation.status || 'pending',
    refundRequestStatus: reservation.refundRequestStatus || '',
    refundDecision: reservation.refundDecision || null,
    modificationRequest: reservation.modificationRequest || null,
    adults: Number(reservation.adults || 0),
    children: Number(reservation.children || 0),
    type: reservation.type || '',
    bookingType: reservation.bookingType || '',
  };
}

async function findReservation(reference, contact) {
  const normalizedReference = reference.replace(/^#/, '').toUpperCase();
  const normalizedPhone = contact.replace(/\D/g, '');
  const normalizedEmail = contact.toLowerCase();
  const contactIsEmail = EMAIL_RE.test(normalizedEmail);
  if (!contactIsEmail && !/^09\d{9}$/.test(normalizedPhone)) {
    throw new Error('Enter the email or 11-digit phone number used for the booking.');
  }

  const field = contactIsEmail ? 'emailLower' : 'phone';
  const value = contactIsEmail ? normalizedEmail : normalizedPhone;
  const snapshot = await adminDb.collection('reservations').where(field, '==', value).get();
  const reservation = snapshot.docs.find(document => document.id.toUpperCase().startsWith(normalizedReference));
  if (!reservation) return null;
  return reservation;
}

async function readCancellationPolicy() {
  const policySnapshot = await adminDb.doc('settings/cancellationPolicy').get();
  return policySnapshot.exists ? policySnapshot.data() : DEFAULT_CANCELLATION_POLICY;
}

async function requestRefund(reservation, contact) {
  const data = reservation.data();
  if (!['pending', 'confirmed', 'checked-in'].includes(String(data.status || '').toLowerCase())) {
    return { error: 'A refund request cannot be submitted for this reservation status.' };
  }
  if (ACTIVE_REFUND_STATUSES.includes(String(data.refundRequestStatus || '').toLowerCase())
    || ['refunded', 'rejected', 'not_eligible'].includes(String(data.refundRequestStatus || '').toLowerCase())) {
    return { alreadyRequested: true, outcome: data.refundDecision?.outcome || data.refundRequestStatus };
  }

  const [policy, paymentSnapshot, refundSnapshot] = await Promise.all([
    readCancellationPolicy(),
    adminDb.collection('payments').where('reservationId', '==', reservation.id).get(),
    adminDb.collection('refunds').where('reservationId', '==', reservation.id).get(),
  ]);
  const paymentRows = paymentSnapshot.docs
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    .filter(payment => payment.provider === 'paymongo' && payment.paymentId && Number(payment.amount) > 0);
  const previousRefunds = refundSnapshot.docs.map(snapshot => snapshot.data())
    .filter(refund => !['failed', 'canceled', 'cancelled'].includes(refund.status));
  const refundedByPayment = previousRefunds.reduce((amounts, refund) => {
    amounts[refund.paymentId] = (amounts[refund.paymentId] || 0) + Number(refund.amount || 0);
    return amounts;
  }, {});
  const remainingPaidAmount = paymentRows.reduce((total, payment) =>
    total + Math.max(0, Number(payment.amount) - Number(refundedByPayment[payment.paymentId] || 0)), 0);
  const recordedPaid = Number(data.amountPaid || 0);
  let decision = getCancellationPolicyOutcome({
    policy,
    checkIn: data.checkIn,
    amount: data.totalAmount,
    amountPaid: recordedPaid,
  });

  if (data.disputeStatus || data.paymentDisputeStatus) {
    decision = {
      outcome: 'needs_review',
      reason: 'A payment dispute or chargeback is recorded for this reservation and needs manual review.',
      alternatives: ['Ask resort staff to review the dispute and payment processor status.'],
    };
  } else if (recordedPaid > 0
    && (remainingPaidAmount <= 0 || remainingPaidAmount + 0.01 < recordedPaid)) {
    decision = {
      outcome: 'needs_review',
      reason: 'The original payment transactions could not be fully matched to the recorded amount paid.',
      alternatives: ['Ask resort staff to verify the original payment transactions before making a decision.'],
    };
  } else if (decision.outcome === 'eligible' && remainingPaidAmount < decision.refundableAmount) {
    decision = {
      ...decision,
      refundableAmount: Math.max(0, Math.round(remainingPaidAmount * 100) / 100),
    };
    if (decision.refundableAmount <= 0) {
      decision.outcome = 'needs_review';
      decision.reason = 'No refundable amount could be matched to the original payment method.';
    }
  }

  const requestId = crypto.randomUUID();
  const result = await adminDb.runTransaction(async transaction => {
    const currentSnapshot = await transaction.get(reservation.ref);
    if (!currentSnapshot.exists) return { error: 'Reservation not found.' };
    const current = currentSnapshot.data();
    if (!['pending', 'confirmed', 'checked-in'].includes(String(current.status || '').toLowerCase())) {
      return { error: 'A refund request cannot be submitted for this reservation status.' };
    }
    if (current.refundRequestStatus) {
      return { alreadyRequested: true, outcome: current.refundDecision?.outcome || current.refundRequestStatus };
    }

    transaction.update(reservation.ref, {
      refundRequestId: requestId,
      refundRequestStatus: decision.outcome,
      refundRequestedAt: FieldValue.serverTimestamp(),
      refundRequestContactType: EMAIL_RE.test(contact.toLowerCase()) ? 'email' : 'phone',
      refundDecision: {
        outcome: decision.outcome,
        reason: decision.reason,
        alternatives: decision.alternatives || [],
        policyRate: decision.policyRate ?? null,
        feeAmount: decision.feeAmount ?? null,
        refundableAmount: decision.refundableAmount ?? 0,
        daysBeforeCheckIn: decision.daysBeforeCheckIn ?? null,
      },
    });
    const auditRef = reservation.ref.collection('refundAudit').doc(requestId);
    transaction.set(auditRef, {
      action: 'guest_request_submitted',
      outcome: decision.outcome,
      contactType: EMAIL_RE.test(contact.toLowerCase()) ? 'email' : 'phone',
      refundableAmount: decision.refundableAmount || 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { alreadyRequested: false };
  });

  if (result.error || result.alreadyRequested) return { ...result, outcome: result.outcome || decision.outcome };
  try {
    await sendRefundDecisionEmail({
      reservation: data,
      bookingRef: reservation.id.slice(0, 8).toUpperCase(),
      outcome: decision.outcome,
      reason: decision.reason,
      alternatives: decision.alternatives || [],
      amount: decision.refundableAmount || 0,
      timeline: decision.outcome === 'eligible'
        ? 'Your request is awaiting staff approval. Refunds are sent to the original payment method after approval; processing time depends on that provider.'
        : undefined,
    });
  } catch (emailError) {
    console.error('Could not send refund request decision email:', emailError);
  }
  return { alreadyRequested: false, outcome: decision.outcome, decision };
}

async function requestScheduleChange(reservation, body) {
  const data = reservation.data();
  if (!['pending', 'confirmed'].includes(String(data.status || '').toLowerCase())) {
    return { error: 'A schedule change cannot be requested for this reservation status.' };
  }
  if (data.modificationRequest
    && ACTIVE_MODIFICATION_STATUSES.includes(String(data.modificationRequest.status || '').toLowerCase())) {
    return { alreadyRequested: true, modificationRequest: data.modificationRequest };
  }

  const { checkIn, checkOut } = body;
  const isDayTour = data.bookingType === 'daytour';
  const nights = isDayTour ? 1 : getDateRangeNights(checkIn, checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
  const requestedStart = new Date(`${checkIn}T00:00:00`);
  const requestedEnd = new Date(`${checkOut}T00:00:00`);
  if (!nights || Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())
    || requestedStart < today || requestedStart > maxDate
    || (isDayTour ? checkOut !== checkIn : requestedEnd > maxDate)) {
    return { error: 'Choose valid dates within the next two months.' };
  }

  let change = {
    outcome: 'needs_review',
    reason: 'The reservation dates require staff review.',
    checkIn,
    checkOut,
  };
  if (data.roomId) {
    const [roomSnapshot, policy] = await Promise.all([
      adminDb.collection('rooms').doc(data.roomId).get(),
      readCancellationPolicy(),
    ]);
    if (roomSnapshot.exists) {
      change = calculateReservationModification(data, roomSnapshot.data(), checkIn, checkOut, policy);
      change.checkIn = checkIn;
      change.checkOut = checkOut;
    }
  }

  const modificationRequest = {
    id: crypto.randomUUID(),
    status: change.outcome === 'needs_review' ? 'needs_review' : 'requested',
    outcome: change.outcome,
    reason: change.reason,
    requestedCheckIn: checkIn,
    requestedCheckOut: checkOut,
    originalCheckIn: data.checkIn,
    originalCheckOut: data.checkOut,
    originalTotal: Number(data.totalAmount || 0),
    proposedTotal: change.updatedTotal ?? null,
    difference: change.difference ?? null,
    changeType: change.changeType || 'manual_review',
    cancellationFee: change.cancellationFee || 0,
    refundDue: change.refundDue || 0,
    balanceDue: change.balanceDue || 0,
    paymentDue: change.paymentDue || 0,
    requestedAt: FieldValue.serverTimestamp(),
  };

  const result = await adminDb.runTransaction(async transaction => {
    const currentSnapshot = await transaction.get(reservation.ref);
    if (!currentSnapshot.exists) return { error: 'Reservation not found.' };
    const current = currentSnapshot.data();
    if (!['pending', 'confirmed'].includes(String(current.status || '').toLowerCase())) {
      return { error: 'A schedule change cannot be requested for this reservation status.' };
    }
    if (current.modificationRequest
      && ACTIVE_MODIFICATION_STATUSES.includes(String(current.modificationRequest.status || '').toLowerCase())) {
      return { alreadyRequested: true, modificationRequest: current.modificationRequest };
    }
    transaction.update(reservation.ref, { modificationRequest });
    const auditRef = reservation.ref.collection('modificationAudit').doc(modificationRequest.id);
    transaction.set(auditRef, {
      action: 'guest_schedule_change_requested',
      outcome: change.outcome,
      requestedCheckIn: checkIn,
      requestedCheckOut: checkOut,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { alreadyRequested: false };
  });
  if (result.error || result.alreadyRequested) return result;

  try {
    await sendScheduleChangeEmail({
      reservation: data,
      bookingRef: reservation.id.slice(0, 8).toUpperCase(),
      change: {
        ...modificationRequest,
        status: modificationRequest.status,
        checkIn,
        checkOut,
        updatedTotal: change.updatedTotal,
        reason: change.reason,
      },
    });
  } catch (emailError) {
    console.error('Could not send schedule change request email:', emailError);
  }
  return { alreadyRequested: false, modificationRequest };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Reservation lookup is temporarily unavailable.' });

  const { action, reference, contact } = req.body || {};
  const normalizedReference = typeof reference === 'string' ? reference.trim() : '';
  const normalizedContact = typeof contact === 'string' ? contact.trim() : '';
  if (!/^(?:#)?[A-Za-z0-9-]{8,32}$/.test(normalizedReference) || !normalizedContact || normalizedContact.length > 254) {
    return res.status(400).json({ error: 'Provide a valid booking reference and the booking phone number or email.' });
  }

  try {
    const reservation = await findReservation(normalizedReference, normalizedContact);
    if (!reservation) return res.status(404).json({ error: 'No reservation matched that reference and contact detail.' });

    if (action === 'lookup') {
      return res.status(200).json({ reservation: publicReservation(reservation) });
    }
    if (action === 'refund') {
      const result = await requestRefund(reservation, normalizedContact);
      if (result.error) return res.status(409).json({ error: result.error });
      return res.status(200).json({
        requested: !result.alreadyRequested,
        alreadyRequested: result.alreadyRequested,
        outcome: result.outcome,
        decision: result.decision || null,
      });
    }
    if (action === 'schedule-change') {
      const result = await requestScheduleChange(reservation, req.body || {});
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'Choose a valid reservation action.' });
  } catch (error) {
    if (error.message === 'Enter the email or 11-digit phone number used for the booking.') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Guest reservation action failed:', error);
    return res.status(500).json({ error: 'Could not process the reservation request.' });
  }
}
