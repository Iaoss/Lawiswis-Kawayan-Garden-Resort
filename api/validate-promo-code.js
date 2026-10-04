import { adminDb } from '../lib/firebaseAdmin';
import { evaluatePromo, normalizePromoCode } from '../lib/promoPolicy';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!adminDb) return res.status(500).json({ error: 'Promo validation is unavailable.' });

  const code = normalizePromoCode(req.body?.code);
  const subtotal = Number(req.body?.subtotal);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  try {
    const snapshot = await adminDb.collection('promoCodes').doc(code).get();
    const result = evaluatePromo(snapshot.exists ? { code: snapshot.id, ...snapshot.data() } : null, subtotal);
    if (!result.valid) return res.status(422).json({ error: result.error });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Promo validation failed:', error);
    return res.status(500).json({ error: 'Could not validate this promo code. Please try again.' });
  }
}
