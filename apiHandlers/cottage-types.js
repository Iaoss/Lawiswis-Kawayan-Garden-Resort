// GET /api/cottage-types → { cottages: [{ id, name, maxGuests, price, archived }] }
// Public: the website and staff pages show the admin's cottage list.
// Removed cottages are included as archived (for old bookings' names).
import { adminDb } from '../lib/firebaseAdmin';
import { COTTAGE_TYPES_DOC } from '../lib/cottageCatalog';
import { normalizeCottageCatalog } from '../src/lib/bookingPricing';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!adminDb) return res.status(503).json({ error: 'Cottages are temporarily unavailable.' });
  try {
    const snapshot = await adminDb.doc(COTTAGE_TYPES_DOC).get();
    const cottages = snapshot.exists ? normalizeCottageCatalog(snapshot.data()) : null;
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ cottages });
  } catch (error) {
    console.error('Cottage list failed:', error);
    return res.status(500).json({ error: 'The cottage list could not be loaded.' });
  }
}
