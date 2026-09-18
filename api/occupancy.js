// api/occupancy.js
//
// Returns a friendly occupancy "level" (quiet / moderate / busy) for a given
// date range, computed from real reservation data — but deliberately does
// NOT return raw room counts or percentages in the response. That keeps
// exact occupancy numbers from being visible to anyone inspecting network
// requests (e.g. a competitor scraping your booking site), while still
// giving guests something genuinely useful: "will it feel crowded?"
//
// Usage:
//   GET /api/occupancy                          → next 7 days (listing page banner)
//   GET /api/occupancy?startDate=...&endDate=... → a specific stay (booking page)

import { adminDb } from '../lib/firebaseAdmin';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnly(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function levelFromPercentage(pct) {
  if (pct <= 30) {
    return { level: 'quiet', message: 'Quiet — shared facilities like the pools should be relaxed.' };
  }
  if (pct <= 65) {
    return { level: 'moderate', message: 'Moderate — expect some company around the pools and common areas.' };
  }
  return { level: 'busy', message: 'Busy — pools and common areas may be more crowded than usual.' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { startDate, endDate } = req.query;

    let start;
    let end;

    if (startDate && endDate) {
      start = toDateOnly(startDate);
      end = toDateOnly(endDate);
    } else {
      // Default window for the room-listing page's resort-wide banner:
      // "how busy is the resort over the coming week", rather than a
      // specific guest's chosen dates.
      start = toDateOnly(new Date());
      end = toDateOnly(new Date(Date.now() + 7 * MS_PER_DAY));
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Invalid date range.' });
    }

    const [roomsSnap, reservationsSnap] = await Promise.all([
      adminDb.collection('rooms').get(),
      adminDb.collection('reservations').get(),
    ]);

    const totalRooms = roomsSnap.size;
    if (totalRooms === 0) {
      return res.status(200).json({ level: 'quiet', message: 'Quiet — shared facilities should be relaxed.' });
    }

    // Count DISTINCT rooms with an overlapping, non-cancelled reservation —
    // not total reservations — since a room booked twice in the window
    // should only count once toward "how many rooms are occupied."
    const occupiedRoomIds = new Set();
    reservationsSnap.docs.forEach((d) => {
      const r = d.data();
      if (!r.roomId || !r.checkIn || !r.checkOut) return;
      if (r.status === 'cancelled') return;

      const resIn = toDateOnly(r.checkIn);
      const resOut = toDateOnly(r.checkOut);
      const overlaps = start < resOut && end > resIn;
      if (overlaps) occupiedRoomIds.add(r.roomId);
    });

    const percentage = Math.round((occupiedRoomIds.size / totalRooms) * 100);
    const result = levelFromPercentage(percentage);

    return res.status(200).json(result);
  } catch (err) {
    console.error('occupancy error:', err);
    return res.status(500).json({ error: 'Could not compute occupancy.' });
  }
}
