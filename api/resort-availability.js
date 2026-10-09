import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';

const SETTINGS_DOC = 'siteSettings/resortAvailability';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (!adminDb) return res.status(503).json({ error: 'Availability status is unavailable.' });
    try {
      const snapshot = await adminDb.doc(SETTINGS_DOC).get();
      return res.status(200).json({
        available: snapshot.exists ? snapshot.data().available !== false : true,
        reason: snapshot.exists ? String(snapshot.data().reason || '') : '',
      });
    } catch (error) {
      console.error('Resort availability read failed:', error);
      return res.status(500).json({ error: 'Could not load resort availability.' });
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await verifyStaff(req)) return res.status(401).json({ error: 'Not authorized.' });
  if (!adminDb) return res.status(503).json({ error: 'Availability settings are unavailable.' });

  const { available, reason = '' } = req.body || {};
  if (typeof available !== 'boolean' || typeof reason !== 'string' || reason.length > 300) {
    return res.status(400).json({ error: 'Provide an availability status and a reason under 300 characters.' });
  }
  try {
    await adminDb.doc(SETTINGS_DOC).set({
      available,
      reason: reason.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return res.status(200).json({ available, reason: reason.trim() });
  } catch (error) {
    console.error('Resort availability save failed:', error);
    return res.status(500).json({ error: 'Could not save resort availability.' });
  }
}
