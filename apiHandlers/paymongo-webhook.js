// api/paymongo-webhook.js
//
// Register this URL (https://yourdomain.com/api/paymongo-webhook) in the
// PayMongo dashboard, subscribed to at least:
//   - payment.paid
//   - payment.failed
//   - checkout_session.payment.paid  (if you use Checkout Sessions)
//   - payment.refunded
//   - payment.refund.updated
//
// PayMongo signs every request; we verify that signature before trusting
// anything in the body, then use the Firebase ADMIN SDK (not the client
// SDK) to mark the reservation paid/failed — admin writes bypass your
// Firestore security rules, which is correct here since there is no
// signed-in user making this request, PayMongo is.
//
// IMPORTANT: PayMongo can send different event *shapes* depending on
// which event type fires. `payment.paid` delivers the Payment object
// directly. `checkout_session.payment.paid` delivers a Checkout Session
// object that wraps a payments[] array. Both are handled below.

import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { recordPayMongoPayment } from '../lib/recordPayMongoPayment';
import { sendPaymentReceipt } from '../lib/sendPaymentReceipt';
import { sendRefundDecisionEmail, sendScheduleChangeEmail } from '../lib/email';
import { getRequestedBookingFields } from '../src/lib/bookingDetails';
import { verifyPaidWithPayMongo } from '../lib/paymongoApi';

// Signature verification needs the exact raw request body, so the
// default JSON body-parser has to be turned off for this route.
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// PayMongo's Paymongo-Signature header looks like:
//   t=1234567890,te=<test_mode_signature>,li=<live_mode_signature>
// Live-mode events must carry a valid `li` signature and test-mode events
// a valid `te` one, so a test signature is never accepted for a live event.
function verifySignature(rawBody, signatureHeader, webhookSecret, livemode) {
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  if (!parts.t) return false;
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
  const candidate = livemode ? parts.li : parts.te;
  if (!candidate) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Normalizes both event shapes into one common object so the rest of
// the handler doesn't need to care which event type triggered it.
function extractPaymentInfo(eventType, resource) {
  if (eventType === 'payment.paid' || eventType === 'payment.failed') {
    // `resource` IS the Payment object directly.
    return {
      reservationId: resource.attributes.metadata?.reservationId || null,
      amountPaid: (resource.attributes.amount || 0) / 100,
      paymentMethod: resource.attributes.source?.type || 'unknown',
      paymentId: resource.id,
      checkoutSessionId: resource.attributes.metadata?.checkoutSessionId || null,
      modificationRequestId: resource.attributes.metadata?.modificationRequestId || null,
      failureReason: resource.attributes.failed_at
        ? (resource.attributes.last_payment_error?.failed_message || 'Payment failed')
        : null,
    };
  }

  if (eventType === 'checkout_session.payment.paid') {
    // `resource` IS a Checkout Session wrapping a payments[] array.
    const session = resource;
    const payment = session.attributes.payments?.[0];
    return {
      reservationId: session.attributes.metadata?.reservationId || null,
      amountPaid: (payment?.attributes?.amount || 0) / 100,
      paymentMethod: payment?.attributes?.source?.type || 'unknown',
      paymentId: payment?.id || null,
      checkoutSessionId: session.id,
      modificationRequestId: session.attributes.metadata?.modificationRequestId || null,
      failureReason: null,
    };
  }

  return null;
}

async function completeModificationPayment(db, FieldValue, info) {
  if (!info.modificationRequestId) return null;
  const reservationRef = db.collection('reservations').doc(info.reservationId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists) throw new Error('Reservation not found for schedule-change payment');
    const reservation = snapshot.data();
    const request = reservation.modificationRequest;
    if (!request || request.id !== info.modificationRequestId) {
      throw new Error('Schedule-change payment does not match an active request');
    }
    if (request.status === 'completed') return null;
    if (request.status !== 'awaiting_payment'
      || Math.round(Number(info.amountPaid) * 100) !== Math.round(Number(request.paymentDue || 0) * 100)) {
      throw new Error('Schedule-change payment amount or request status is invalid');
    }
    const updatedTotal = Number(request.updatedTotal);
    const amountPaid = Number(reservation.amountPaid || 0);
    transaction.update(reservationRef, {
      ...getRequestedBookingFields(request),
      checkIn: request.checkIn || request.requestedCheckIn,
      checkOut: request.checkOut || request.requestedCheckOut,
      totalAmount: updatedTotal,
      paymentStatus: Math.round(amountPaid * 100) >= Math.round(updatedTotal * 100) ? 'paid' : 'partial',
      nights: Number(request.nights || reservation.nights || 1),
      modificationRequest: {
        ...request,
        status: 'completed',
        paymentConfirmedAt: FieldValue.serverTimestamp(),
        paymentId: info.paymentId || null,
      },
    });
    transaction.set(reservationRef.collection('modificationAudit').doc(), {
      action: 'schedule_change_payment_confirmed',
      modificationRequestId: info.modificationRequestId,
      paymentId: info.paymentId || null,
      amount: info.amountPaid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { reservation, request };
  });
}

function isRefundSuccess(status) {
  return ['succeeded', 'success', 'completed'].includes(String(status || '').toLowerCase());
}

function isRefundFailure(status) {
  return ['failed', 'canceled', 'cancelled'].includes(String(status || '').toLowerCase());
}

async function processRecordedRefund(db, FieldValue, refundSnapshot, eventType, status, processorRefundId) {
  const refundRef = refundSnapshot.ref;
  const currentStatus = String(refundSnapshot.data().status || '').toLowerCase();
  const incomingStatus = String(status || '').toLowerCase();
  const resolvedStatus = isRefundSuccess(currentStatus) && !isRefundSuccess(incomingStatus)
    ? currentStatus
    : isRefundFailure(currentStatus) && !isRefundSuccess(incomingStatus)
      ? currentStatus
      : incomingStatus;
  await refundRef.update({
    ...(processorRefundId ? { processorRefundId } : {}),
    status: resolvedStatus,
    processorUpdatedAt: FieldValue.serverTimestamp(),
    processorEventType: eventType,
  });
  const refund = refundSnapshot.data();
  const reservationRef = db.collection('reservations').doc(refund.reservationId);

  if (isRefundFailure(resolvedStatus)) {
    const modification = Boolean(refund.modificationRequestId);
    await reservationRef.update(modification ? {
      'modificationRequest.status': 'needs_review',
      'modificationRequest.processingError': 'The payment provider declined or failed to process the refund.',
    } : {
      refundRequestStatus: 'needs_review',
      refundProcessingError: 'The payment provider declined or failed to process the refund.',
    });
    await reservationRef.collection(modification ? 'modificationAudit' : 'refundAudit').add({
      action: 'refund_processor_failed',
      processorRefundId,
      amount: refund.amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!modification) {
      const reservationSnap = await reservationRef.get();
      await sendRefundDecisionEmail({
        reservation: { id: reservationSnap.id, ...reservationSnap.data() },
        bookingRef: refund.reservationId.slice(0, 8).toUpperCase(),
        outcome: 'failed',
        reason: 'The payment provider could not complete this refund. Staff have been asked to review the case.',
        amount: refund.amount,
        processorReference: processorRefundId,
      });
    }
    return true;
  }

  if (!isRefundSuccess(resolvedStatus)) return true;

  const requestField = refund.modificationRequestId ? 'modificationRequestId' : 'refundRequestId';
  const requestId = refund.modificationRequestId || refund.refundRequestId;
  const siblings = await db.collection('refunds')
    .where('reservationId', '==', refund.reservationId)
    .where(requestField, '==', requestId)
    .get();
  const allSucceeded = siblings.docs.every(doc =>
    doc.id === refundRef.id || isRefundSuccess(doc.data().status));
  if (!allSucceeded) return true;

  let closed;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists) throw new Error('Reservation not found for confirmed refund.');
    const reservation = snapshot.data();
    if (refund.modificationRequestId) {
      const request = reservation.modificationRequest;
      if (!request || request.id !== requestId || request.status === 'completed') return;
      const amountPaid = Math.max(0, Number(reservation.amountPaid || 0) - Number(request.refundDue || 0));
      const newTotal = Number(request.updatedTotal);
      transaction.update(reservationRef, {
        ...getRequestedBookingFields(request),
        checkIn: request.requestedCheckIn,
        checkOut: request.requestedCheckOut,
        totalAmount: newTotal,
        amountPaid,
        paymentStatus: Math.round(amountPaid * 100) >= Math.round(newTotal * 100) ? 'paid' : 'partial',
        nights: Number(request.nights || reservation.nights || 1),
        modificationRequest: {
          ...request,
          status: 'completed',
          refundConfirmedAt: FieldValue.serverTimestamp(),
          refundProcessorReferences: siblings.docs.map(doc => doc.data().processorRefundId).filter(Boolean),
        },
      });
      transaction.set(reservationRef.collection('modificationAudit').doc(), {
        action: 'schedule_change_refund_confirmed',
        modificationRequestId: requestId,
        refundReferences: siblings.docs.map(doc => doc.data().processorRefundId).filter(Boolean),
        createdAt: FieldValue.serverTimestamp(),
      });
      closed = {
        kind: 'modification',
        reservation: { ...reservation, amountPaid, totalAmount: newTotal, checkIn: request.requestedCheckIn, checkOut: request.requestedCheckOut },
        request,
      };
      return;
    }
    if (reservation.refundRequestId !== requestId || reservation.refundRequestStatus === 'refunded') return;
    transaction.update(reservationRef, {
      refundRequestStatus: 'refunded',
      refundClosedAt: FieldValue.serverTimestamp(),
      refundProcessorReferences: siblings.docs.map(doc => doc.data().processorRefundId).filter(Boolean),
      refundProcessingError: FieldValue.delete(),
    });
    transaction.set(reservationRef.collection('refundAudit').doc(), {
      action: 'refund_processor_confirmed',
      refundRequestId: requestId,
      refundReferences: siblings.docs.map(doc => doc.data().processorRefundId).filter(Boolean),
      createdAt: FieldValue.serverTimestamp(),
    });
    closed = { kind: 'refund', reservation };
  });

  if (closed?.kind === 'modification') {
    try {
      await sendScheduleChangeEmail({
        reservation: { id: refund.reservationId, ...closed.reservation },
        bookingRef: refund.reservationId.slice(0, 8).toUpperCase(),
        change: {
          ...closed.request,
          status: 'completed',
          checkIn: closed.request.requestedCheckIn,
          checkOut: closed.request.requestedCheckOut,
          reason: 'The refund has been confirmed and your updated reservation dates are now active.',
        },
      });
    } catch (emailError) {
      console.error('Schedule change confirmation email failed:', emailError);
      await reservationRef.update({
        'modificationRequest.emailError': String(emailError.message || 'Email delivery failed').slice(0, 500),
      });
    }
  } else if (closed?.kind === 'refund') {
    try {
      await sendRefundDecisionEmail({
        reservation: { id: refund.reservationId, ...closed.reservation },
        bookingRef: refund.reservationId.slice(0, 8).toUpperCase(),
        outcome: 'refunded',
        reason: 'The payment provider confirmed the refund to your original payment method.',
        amount: siblings.docs.reduce((total, doc) => total + Number(doc.data().amount || 0), 0),
        processorReference: siblings.docs.map(doc => doc.data().processorRefundId).filter(Boolean).join(', '),
      });
    } catch (emailError) {
      console.error('Refund confirmation email failed:', emailError);
      await reservationRef.update({
        refundNotificationError: String(emailError.message || 'Email delivery failed').slice(0, 500),
      });
    }
  }
  return true;
}

async function processRefundEvent(db, FieldValue, eventType, resource) {
  const attributes = resource?.attributes || {};
  const metadata = attributes.metadata || {};
  const processorRefundId = resource?.id;
  const paymentId = attributes.payment_id || attributes.payment?.id || '';
  let matches = processorRefundId
    ? await db.collection('refunds').where('processorRefundId', '==', processorRefundId).limit(1).get()
    : { docs: [] };
  if (!matches.docs.length) {
    const requestField = metadata.modificationRequestId ? 'modificationRequestId' : 'refundRequestId';
    const requestId = metadata.modificationRequestId || metadata.refundRequestId;
    if (requestId && paymentId) {
      matches = await db.collection('refunds')
        .where(requestField, '==', requestId)
        .where('paymentId', '==', paymentId)
        .limit(1)
        .get();
    }
  }
  if (!matches.docs.length) return false;
  return processRecordedRefund(
    db,
    FieldValue,
    matches.docs[0],
    eventType,
    String(attributes.status || '').toLowerCase() || 'pending',
    processorRefundId,
  );
}

async function processPaymentRefundedEvent(db, FieldValue, eventType, payment) {
  const paymentId = payment?.id;
  if (!paymentId) return false;
  const refundSnapshot = await db.collection('refunds').where('paymentId', '==', paymentId).get();
  const refunds = payment.attributes?.refunds;
  const refundEntries = Array.isArray(refunds) ? refunds : refunds?.data || [];
  const refundIds = refundEntries.map(refund => refund.id).filter(Boolean);
  const listedRefunds = refundIds.length
    ? refundSnapshot.docs.filter(snapshot => refundIds.includes(snapshot.data().processorRefundId))
    : [];
  const pendingRefunds = refundSnapshot.docs.filter(snapshot =>
    ['submitting', 'pending', 'processing', 'awaiting_confirmation'].includes(
      String(snapshot.data().status || '').toLowerCase(),
    ));
  const targets = listedRefunds.length ? listedRefunds : pendingRefunds;
  if (!targets.length) {
    return refundSnapshot.docs.some(snapshot => isRefundSuccess(snapshot.data().status));
  }

  let processed = true;
  for (const refund of targets) {
    processed = await processRecordedRefund(
      db,
      FieldValue,
      refund,
      eventType,
      'succeeded',
      refund.data().processorRefundId || undefined,
    ) && processed;
  }
  return processed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signatureHeader = req.headers['paymongo-signature'];
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!signatureHeader || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  let validSignature = false;
  try {
    validSignature = verifySignature(rawBody, signatureHeader, webhookSecret, event.data?.attributes?.livemode === true);
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const eventType = event.data?.attributes?.type;
  const resource = event.data?.attributes?.data;

  console.log('PayMongo webhook received:', eventType, event.data?.id);

  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    if (eventType === 'payment.refunded' || eventType === 'payment.refund.updated') {
      const isRefundResource = Boolean(resource?.attributes?.payment_id || resource?.attributes?.payment?.id);
      const found = eventType === 'payment.refund.updated' && isRefundResource
        ? await processRefundEvent(db, FieldValue, eventType, resource)
        : await processPaymentRefundedEvent(db, FieldValue, eventType, resource);
      if (!found) {
        console.error('PayMongo refund event did not match a recorded refund:', resource?.id);
        return res.status(500).json({ error: 'Refund record is not available yet.' });
      }
      return res.status(200).json({ received: true });
    }

    let info = extractPaymentInfo(eventType, resource);

    if (!info) {
      // Event type we don't care about — acknowledge so PayMongo
      // doesn't keep retrying it.
      return res.status(200).json({ received: true, ignored: eventType });
    }

    if (!info.reservationId) {
      console.warn('No reservationId in metadata for event', eventType, event.data?.id);
      return res.status(200).json({ received: true, warning: 'no reservationId' });
    }

    if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
      // Don't trust the event body alone: confirm with PayMongo's API that
      // this payment succeeded for this reservation, and record the amount
      // PayMongo actually collected.
      const verified = await verifyPaidWithPayMongo(info);
      if (!verified) {
        console.warn('PayMongo did not confirm payment for event', eventType, event.data?.id);
        return res.status(200).json({ received: true, ignored: 'payment not confirmed by PayMongo' });
      }
      info = {
        ...info,
        paymentId: verified.paymentId,
        amountPaid: verified.amountPaid,
        paymentMethod: verified.paymentMethod,
        modificationRequestId: verified.metadata.modificationRequestId || info.modificationRequestId,
      };
      const result = await recordPayMongoPayment(db, FieldValue, {
        ...info,
        eventId: event.data?.id,
      });
      const modification = await completeModificationPayment(db, FieldValue, info);
      await sendPaymentReceipt(db, FieldValue, result.paymentDocumentId);
      if (modification) {
        const updatedSnap = await db.collection('reservations').doc(info.reservationId).get();
        const updatedReservation = { id: updatedSnap.id, ...updatedSnap.data() };
        await sendScheduleChangeEmail({
          reservation: updatedReservation,
          bookingRef: info.reservationId.slice(0, 8).toUpperCase(),
          change: {
            ...modification.request,
            status: 'completed',
            checkIn: modification.request.checkIn || modification.request.requestedCheckIn,
            checkOut: modification.request.checkOut || modification.request.requestedCheckOut,
            updatedTotal: modification.request.updatedTotal,
            reason: 'Your schedule-change payment is confirmed and your reservation dates have been updated.',
          },
        });
      }
    }

    if (eventType === 'payment.failed') {
      console.log('Marking reservation payment failed:', info.reservationId);

      const reservationRef = db.collection('reservations').doc(info.reservationId);
      const reservationSnap = await reservationRef.get();
      if (reservationSnap.exists) {
        const reservation = reservationSnap.data();
        const hasPartialPayment = Number(reservation.amountPaid || 0) > 0;
        const updates = { paymentStatus: hasPartialPayment ? 'partial' : 'failed' };
        if (info.modificationRequestId
          && reservation.modificationRequest?.id === info.modificationRequestId
          && reservation.modificationRequest.status === 'awaiting_payment') {
          updates['modificationRequest.status'] = 'needs_review';
          updates['modificationRequest.processingError'] = info.failureReason || 'Schedule-change deposit payment failed.';
          await reservationRef.collection('modificationAudit').add({
            action: 'schedule_change_payment_failed',
            modificationRequestId: info.modificationRequestId,
            paymentId: info.paymentId,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await reservationRef.update(updates);
      }

      await db.collection('activities').add({
        title: 'PayMongo payment failed',
        sub: `${info.failureReason || 'Payment failed'} — reservation ${info.reservationId}`,
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    // Always 200 once verified and processed — otherwise PayMongo will
    // keep retrying delivery.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 500 so PayMongo retries — this was likely a transient
    // Firestore or code error, not a bad payload.
    return res.status(500).json({ error: 'Internal error' });
  }
}