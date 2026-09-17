// api/paymongo-webhook.js
//
// Register this URL (https://yourdomain.com/api/paymongo-webhook) in the
// PayMongo dashboard, subscribed to the `checkout_session.payment.paid`
// event. PayMongo signs every request; we verify that signature before
// trusting anything in the body, then use the Firebase ADMIN SDK (not
// the client SDK) to mark the reservation paid — admin writes bypass
// your Firestore security rules, which is correct here since there is
// no signed-in user making this request, PayMongo is.

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

  if (eventType === 'checkout_session.payment.paid') {
    const session = event.data.attributes.data;
    const reservationId = session.attributes.metadata?.reservationId;
    const paidCents = session.attributes.payments?.[0]?.attributes?.amount || 0;
    const amountPaid = paidCents / 100;
    const paymentMethod = session.attributes.payments?.[0]?.attributes?.source?.type || 'unknown';

    if (reservationId) {
      const app = getAdminApp();
      const db = getFirestore(app);

      await db.collection('reservations').doc(reservationId).update({
        paymentStatus: 'paid',
        amountPaid: FieldValue.increment(amountPaid),
      });

      await db.collection('payments').add({
        reservationId,
        amount: amountPaid,
        method: paymentMethod,
        provider: 'paymongo',
        checkoutSessionId: session.id,
        createdAt: FieldValue.serverTimestamp(),
      });

      await db.collection('activities').add({
        title: 'PayMongo payment received',
        sub: `₱${amountPaid.toLocaleString()} via ${paymentMethod} — reservation ${reservationId}`,
        timestamp: FieldValue.serverTimestamp(),
      });
    }
  }

  // Always 200 once verified, even for event types we ignore —
  // otherwise PayMongo will keep retrying delivery.
  return res.status(200).json({ received: true });
}