// GET /api/public-rooms — the room list for the public website.
//
// Every guest page (Home, Rooms, booking) used to read all room documents
// straight from Firestore, one read per room per visitor. This route reads
// them once and lets Vercel's CDN share the answer with every visitor for a
// minute, so a busy day costs a few hundred reads at most instead of thousands.
// Rooms are already public (the Firestore rules allow anyone to read them).
import { adminDb } from '../lib/firebaseAdmin';
import { loadRoomsCached } from '../lib/activeReservations';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Rooms are unavailable right now.' });
  try {
    const rooms = await loadRoomsCached();
    // Shared cache: fresh for 1 minute, so a new or edited room shows on the
    // website within about a minute. Browsers keep it 30 seconds.
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({ rooms });
  } catch (error) {
    console.error('public-rooms failed:', error);
    return res.status(500).json({ error: 'Rooms could not be loaded.' });
  }
}
