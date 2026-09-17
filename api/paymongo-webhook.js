// api/paymongo-webhook.js
//
// Register this URL (https://yourdomain.com/api/paymongo-webhook) in the
// PayMongo dashboard, subscribed to at least:
//   - payment.paid
//   - payment.failed
//   - checkout_session.payment.paid  (if you use Checkout Sessions)
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
// Use `li` in live mode, `te` while testing with test-mode webhook keys.
function verifySignature(rawBody, signatureHeader, webhookSecret) {
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
  const candidate = parts.li || parts.te;
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
      failureReason: null,
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signatureHeader = req.headers['paymongo-signature'];
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!signatureHeader || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let validSignature = false;
  try {
    validSignature = verifySignature(rawBody, signatureHeader, webhookSecret);
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);
  const eventType = event.data?.attributes?.type;
  const resource = event.data?.attributes?.data;

  console.log('PayMongo webhook received:', eventType, event.data?.id);

  try {
    const info = extractPaymentInfo(eventType, resource);

    if (!info) {
      // Event type we don't care about — acknowledge so PayMongo
      // doesn't keep retrying it.
      return res.status(200).json({ received: true, ignored: eventType });
    }

    if (!info.reservationId) {
      console.warn('No reservationId in metadata for event', eventType, event.data?.id);
      return res.status(200).json({ received: true, warning: 'no reservationId' });
    }

    const app = getAdminApp();
    const db = getFirestore(app);

    if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
      console.log('Marking reservation paid:', info.reservationId, info.amountPaid);

      await db.collection('reservations').doc(info.reservationId).update({
        paymentStatus: 'paid',
        amountPaid: FieldValue.increment(info.amountPaid),
      });

      await db.collection('payments').add({
        reservationId: info.reservationId,
        amount: info.amountPaid,
        method: info.paymentMethod,
        provider: 'paymongo',
        checkoutSessionId: info.checkoutSessionId,
        paymentId: info.paymentId,
        createdAt: FieldValue.serverTimestamp(),
      });

      await db.collection('activities').add({
        title: 'PayMongo payment received',
        sub: `₱${info.amountPaid.toLocaleString()} via ${info.paymentMethod} — reservation ${info.reservationId}`,
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    if (eventType === 'payment.failed') {
      console.log('Marking reservation payment failed:', info.reservationId);

      await db.collection('reservations').doc(info.reservationId).update({
        paymentStatus: 'failed',
      });

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