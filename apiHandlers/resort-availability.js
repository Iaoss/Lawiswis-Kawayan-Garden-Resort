import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';

// Resort status shown on the website:
//   open    - bookings work as usual
//   limited - bookings still work, with a notice (e.g. pool under repair)
//   closed  - bookings are turned off

const SETTINGS_DOC = 'siteSettings/resortAvailability';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (!adminDb) return res.status(503).json({ error: 'Availability status is unavailable.' });
    try {
      const snapshot = await adminDb.doc(SETTINGS_DOC).get();
      const data = snapshot.exists ? snapshot.data() : {};
      const available = data.available !== false;
      return res.status(200).json({
        available,
        limited: available && data.limited === true,
        reason: String(data.reason || ''),
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
  const staff = await verifyStaff(req);
  if (!staff) return res.status(401).json({ error: 'Not authorized.' });
  if (staff.role !== 'admin') return res.status(403).json({ error: 'Only an admin can change the resort status.' });
  if (!adminDb) return res.status(503).json({ error: 'Availability settings are unavailable.' });

  const { available, limited = false, reason = '' } = req.body || {};
  if (typeof available !== 'boolean' || typeof limited !== 'boolean' || typeof reason !== 'string' || reason.length > 300) {
    return res.status(400).json({ error: 'Provide an availability status and a reason under 300 characters.' });
  }
  const isLimited = available && limited;
  if (isLimited && !reason.trim()) {
    return res.status(400).json({ error: 'Add a message for guests explaining what is limited.' });
  }
  try {
    await adminDb.doc(SETTINGS_DOC).set({
      available,
      limited: isLimited,
      reason: reason.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const label = !available ? 'Closed' : isLimited ? 'Limited' : 'Open';
    await logActivity(staff, { action: 'resort_status_changed', summary: `Set the resort status to ${label}${reason.trim() ? ` (${reason.trim().slice(0, 120)})` : ''}` });
    return res.status(200).json({ available, limited: isLimited, reason: reason.trim() });
  } catch (error) {
    console.error('Resort availability save failed:', error);
    return res.status(500).json({ error: 'Could not save resort availability.' });
  }
}
