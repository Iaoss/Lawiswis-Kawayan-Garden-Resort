import { adminDb } from '../lib/firebaseAdmin';

const MAX_PUBLIC_REVIEWS = 9;
const MIN_PUBLIC_RATING = 4;
const PLACEHOLDER_NAMES = new Set(['anonymous', 'guest', 'n/a', 'na', 'none', 'unknown']);
const PLACEHOLDER_ROOMS = new Set(['', 'n/a', 'na', 'none', 'unknown', 'room not given', 'not given']);

function cleanText(value, maximumLength) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
}

// "Maria Santos" -> "Maria S."; placeholders and anonymous reviews fall back to "Verified Guest".
function displayName(item) {
  if (item.isAnonymous === true) return 'Verified Guest';
  const first = cleanText(item.firstName, 35);
  const last = cleanText(item.lastName, 35);
  let name = [first, last].filter(Boolean).join(' ') || cleanText(item.guestName, 100);
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) return 'Verified Guest';
  const parts = name.split(/\s+/);
  if (parts.length > 1) name = `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
  return name;
}

function displayRoom(item) {
  const room = cleanText(item.roomName || item.roomNumber, 120);
  return PLACEHOLDER_ROOMS.has(room.toLowerCase()) ? '' : room;
}

function createdAtIso(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
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
    const snapshot = await adminDb.collection('feedback').orderBy('createdAt', 'desc').limit(200).get();

    const feedback = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(item => {
        const sentiment = String(item.sentiment || '').toLowerCase();
        const rating = Number(item.rating);
        const positive = sentiment ? sentiment === 'positive' : (Number.isFinite(rating) && rating >= MIN_PUBLIC_RATING);
        return positive
          && Number.isFinite(rating) && rating <= 5
          && typeof item.comment === 'string'
          && item.comment.trim().length > 0
          && item.comment.length <= 2000
          && item.hidden !== true;
      })
      .slice(0, MAX_PUBLIC_REVIEWS)
      .map(item => {
        const tags = Array.isArray(item.tags)
          ? item.tags.map(tag => cleanText(tag, 80)).filter(Boolean).slice(0, 5)
          : [];
        return {
          id: item.id,
          guestName: displayName(item),
          comment: item.comment.trim(),
          rating: Number(item.rating),
          tags,
          roomName: displayRoom(item),
          createdAt: createdAtIso(item.createdAt),
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
