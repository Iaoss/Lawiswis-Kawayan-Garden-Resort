// /api/cottage-availability
//
//   GET ?date=YYYY-MM-DD&tourPeriod=day|night|both
//       → { availability: { 'umbrella-hut': { total, booked, left }, … } }
//       left is null when the admin hasn't set a limit for that cottage.
//   GET (no date) → { inventory } for the Settings page.
//   POST { 'umbrella-hut', 'garden-cabana', 'poolside-cabana', pavilion }   (admin only)
//       Saves how many of each cottage the resort has. Empty = not limited.

import { adminDb } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { COTTAGE_INVENTORY_DOC, getCottageAvailabilityFor, readCottageInventory } from '../lib/cottageStock';
import { COTTAGE_IDS, normalizeCottageInventory } from '../src/lib/cottages';

export default async function handler(req, res) {
  if (!adminDb) return res.status(503).json({ error: 'Cottage availability is temporarily unavailable.' });

  if (req.method === 'GET') {
    try {
      const { date, tourPeriod = 'day' } = req.query || {};
      if (!date) return res.status(200).json({ inventory: normalizeCottageInventory(await readCottageInventory()) });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !['day', 'night', 'both'].includes(tourPeriod)) {
        return res.status(400).json({ error: 'Choose a valid date and tour time.' });
      }
      const availability = await getCottageAvailabilityFor(String(date), tourPeriod);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ availability });
    } catch (error) {
      console.error('Cottage availability failed:', error);
      return res.status(500).json({ error: 'Cottage availability could not be checked.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const staff = await verifyStaff(req);
  if (!staff || staff.role !== 'admin') return res.status(403).json({ error: 'Only an admin can change the cottage counts.' });
  const inventory = normalizeCottageInventory(req.body || {});
  const invalid = COTTAGE_IDS.filter(id => {
    const raw = req.body?.[id];
    return raw !== null && raw !== undefined && raw !== '' && inventory[id] === null;
  });
  if (invalid.length) return res.status(400).json({ error: 'Enter whole numbers from 0 to 100, or leave a box empty for no limit.' });
  try {
    await adminDb.doc(COTTAGE_INVENTORY_DOC).set({ ...inventory, updatedAt: new Date().toISOString(), updatedBy: staff.uid });
    await logActivity(staff, {
      action: 'cottage_inventory_changed',
      summary: `Set cottage counts: ${COTTAGE_IDS.map(id => `${id} ${inventory[id] ?? 'no limit'}`).join(', ')}`,
    });
    return res.status(200).json({ inventory });
  } catch (error) {
    console.error('Saving cottage counts failed:', error);
    return res.status(500).json({ error: 'The cottage counts could not be saved.' });
  }
}
