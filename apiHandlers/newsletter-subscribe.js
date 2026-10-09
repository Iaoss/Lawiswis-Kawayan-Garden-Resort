import { createHash } from 'crypto';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Subscriptions are temporarily unavailable.' });

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const id = createHash('sha256').update(email).digest('hex');
  const subscriberRef = adminDb.collection('newsletterSubscribers').doc(id);
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(subscriberRef);
      if (existing.exists && existing.data().status === 'active') return 'already-subscribed';
      transaction.set(subscriberRef, {
        email,
        status: 'active',
        joinedAt: existing.exists && existing.data().joinedAt
          ? existing.data().joinedAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return 'subscribed';
    });
    return res.status(200).json({ status: result });
  } catch (error) {
    console.error('Newsletter subscription failed:', error);
    return res.status(500).json({ error: 'Could not save your subscription. Please try again.' });
  }
}
