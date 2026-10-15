import { adminDb } from '../lib/firebaseAdmin';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function reservationKey(email, roomNumber) {
  return `${normalize(email)}|${normalize(roomNumber)}`;
}

function publicAvatar(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) {
    return res.status(503).json({ error: 'Guest feedback is temporarily unavailable.' });
  }

  try {
    const [feedbackSnapshot, reservationSnapshot] = await Promise.all([
      adminDb.collection('feedback').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('reservations').where('status', '==', 'checked-out').get(),
    ]);

    const completedReservations = new Set(
      reservationSnapshot.docs.map(document => {
        const reservation = document.data();
        return reservationKey(reservation.emailLower || reservation.email, reservation.roomNumber);
      })
    );

    const feedback = feedbackSnapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(item => (
        typeof item.comment === 'string'
        && item.comment.trim().length > 0
        && item.comment.length <= 2000
        && typeof item.rating === 'number'
        && Number.isFinite(item.rating)
        && item.rating >= 0
        && item.rating <= 5
        && completedReservations.has(reservationKey(item.email, item.roomNumber))
      ))
      .map(item => {
        const tags = Array.isArray(item.tags)
          ? item.tags
            .filter(tag => typeof tag === 'string')
            .map(tag => tag.trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 5)
          : [];
        const category = typeof item.category === 'string'
          ? item.category
          : (typeof item.guestCategory === 'string' ? item.guestCategory : (tags[0] || 'Verified Guest'));
        return {
          id: item.id,
          guestName: typeof item.guestName === 'string' ? item.guestName.trim().slice(0, 100) : '',
          comment: item.comment.trim(),
          rating: item.rating,
          tags,
          category: category.trim().slice(0, 80) || 'Verified Guest',
          avatarUrl: publicAvatar(item.avatarUrl),
          verified: true,
        };
      });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ feedback });
  } catch (error) {
    console.error('Public feedback lookup failed:', error);
    return res.status(500).json({ error: 'Could not load guest feedback.' });
  }
}
