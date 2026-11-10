// GET /api/seasonal-rates → { periods: [{ id, name, from, to, percent }] }
// Public: the website shows holiday / peak-season prices before booking.
// The server always recalculates the price itself when a booking is made.
import { readSeasonPeriods } from '../lib/seasonStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const periods = await readSeasonPeriods();
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  return res.status(200).json({ periods });
}
