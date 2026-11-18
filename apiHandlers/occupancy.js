import { adminDb } from '../lib/firebaseAdmin';
import { getDateOccupancy } from '../src/lib/dateOccupancy';
import { loadActiveReservations } from '../lib/activeReservations';
import { getCrowdedDates, peopleOnDate, RESORT_MAX_GUESTS } from '../src/lib/resortCapacity';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const asDateKey = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value;
};

const shortDate = key => new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

// The crowd level shown on the website, from the busiest date in the range
// (people at the resort at its busiest moment; the resort holds up to 250).
function crowdFromGuestCount(guestCount, { busiestDate = '', max = RESORT_MAX_GUESTS } = {}) {
  const base = { guestCount, max, remaining: Math.max(0, max - guestCount), busiestDate };
  if (guestCount >= max) {
    return { ...base, level: 'full', full: true, message: `⛔ Fully booked${busiestDate ? ` on ${shortDate(busiestDate)}` : ''}: the resort has reached its ${max}-guest limit. Please choose another date.` };
  }
  if (guestCount <= Math.round(max * 0.4)) {
    return { ...base, level: 'low', message: `🟢 Low Crowd — ~${guestCount} guests booked. Ideal for a quiet stay.` };
  }
  if (guestCount <= Math.round(max * 0.8)) {
    return { ...base, level: 'moderate', message: `🟡 Moderate Activity — ~${guestCount} guests booked.` };
  }
  return { ...base, level: 'busy', message: `🔴 High Occupancy — ~${guestCount} of ${max} guests booked${busiestDate ? ` on ${shortDate(busiestDate)}` : ''}. Only ${max - guestCount} places left.` };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Occupancy information is unavailable.' });

  try {
    // ?date=YYYY-MM-DD → bookings and guests already on that date, per slot.
    // Only counts are returned, never guest details.
    const queryDate = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
    if (queryDate !== undefined) {
      const date = asDateKey(queryDate);
      if (!date) return res.status(400).json({ error: 'Provide a valid date.' });
      // Bookings that can still be at the resort (not cancelled or checked out).
      const active = await loadActiveReservations();
      res.setHeader('Cache-Control', 'no-store');
      // capacity: people at the busiest moment of the day, out of 250.
      return res.status(200).json({ ...getDateOccupancy(active, date), capacity: peopleOnDate(active, date) });
    }

    // ?alerts=1 → upcoming dates (next 60 days) that are full or nearly full,
    // for staff alerts. Counts only.
    if (req.query.alerts !== undefined) {
      const active = await loadActiveReservations();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res.status(200).json({ max: RESORT_MAX_GUESTS, dates: getCrowdedDates(active, { from: dateKey(new Date(Date.now() + 8 * 3600000)) }) });
    }

    const queryStart = Array.isArray(req.query.startDate) ? req.query.startDate[0] : req.query.startDate;
    const queryEnd = Array.isArray(req.query.endDate) ? req.query.endDate[0] : req.query.endDate;
    const startDate = queryStart && queryEnd
      ? asDateKey(queryStart)
      : dateKey(new Date());
    const endDate = queryStart && queryEnd
      ? asDateKey(queryEnd)
      : dateKey(new Date(Date.now() + 7 * MS_PER_DAY));

    if (!startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: 'Provide a valid date range.' });
    }

    // People at the resort on the busiest date of the range (all bookings
    // that still hold a place: pending, confirmed and checked in; groups
    // counted by their total; day visitors included).
    const reservations = await loadActiveReservations();
    let guestCount = 0;
    let busiestDate = '';
    for (let day = new Date(`${startDate}T00:00:00Z`), n = 0; day.toISOString().slice(0, 10) <= endDate && n < 62; day.setUTCDate(day.getUTCDate() + 1), n += 1) {
      const key = day.toISOString().slice(0, 10);
      const { peak } = peopleOnDate(reservations, key);
      if (peak > guestCount) { guestCount = peak; busiestDate = key; }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(crowdFromGuestCount(Math.max(0, guestCount), { busiestDate }));
  } catch (error) {
    console.error('occupancy error:', error);
    return res.status(500).json({ error: 'Could not compute occupancy.' });
  }
}
