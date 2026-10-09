import { adminDb } from '../lib/firebaseAdmin';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONFIRMED_STATUSES = new Set(['confirmed', 'checked-in', 'checked_in', 'checked out', 'checked-out']);

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const asDateKey = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value;
};

function crowdFromGuestCount(guestCount) {
  if (guestCount <= 20) {
    return { level: 'low', guestCount, message: `🟢 Low Crowd — ~${guestCount} guests currently booked. Ideal for a quiet stay.` };
  }
  if (guestCount <= 50) {
    return { level: 'moderate', guestCount, message: `🟡 Moderate Activity — ~${guestCount} guests currently booked.` };
  }
  return { level: 'busy', guestCount, message: `🔴 High Occupancy — ~${guestCount} guests currently booked.` };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Occupancy information is unavailable.' });

  try {
    const queryStart = Array.isArray(req.query.startDate) ? req.query.startDate[0] : req.query.startDate;
    const queryEnd = Array.isArray(req.query.endDate) ? req.query.endDate[0] : req.query.endDate;
    const startDate = queryStart && queryEnd
      ? asDateKey(queryStart)
      : dateKey(new Date());
    const endDate = queryStart && queryEnd
      ? asDateKey(queryEnd)
      : dateKey(new Date(Date.now() + 7 * MS_PER_DAY));

    if (!startDate || !endDate || endDate <= startDate) {
      return res.status(400).json({ error: 'Provide a valid date range.' });
    }

    const reservations = await adminDb.collection('reservations').get();
    const guestCount = reservations.docs.reduce((total, snapshot) => {
      const reservation = snapshot.data();
      const status = String(reservation.status || '').trim().toLowerCase();
      if (!CONFIRMED_STATUSES.has(status)) return total;
      if (typeof reservation.checkIn !== 'string' || typeof reservation.checkOut !== 'string') return total;
      const checkIn = asDateKey(reservation.checkIn);
      const checkOut = asDateKey(reservation.checkOut);
      if (!checkIn || !checkOut || !(startDate < checkOut && endDate > checkIn)) return total;
      const adults = Number(reservation.adults);
      const children = Number(reservation.children);
      return total + (Number.isInteger(adults) && adults > 0 ? adults : 0)
        + (Number.isInteger(children) && children > 0 ? children : 0);
    }, 0);

    return res.status(200).json(crowdFromGuestCount(guestCount));
  } catch (error) {
    console.error('occupancy error:', error);
    return res.status(500).json({ error: 'Could not compute occupancy.' });
  }
}
