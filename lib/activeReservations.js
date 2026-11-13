// Cheaper reads for the public website (availability, crowd level, chat).
//
// Firestore's free plan allows about 50,000 reads a day, and every booking
// returned by a query counts as one read. Loading the whole reservations
// collection on every visit used that up quickly, so:
//   - only bookings that can still hold a room are read (cancelled,
//     checked-out and rejected bookings are skipped, and those are most of
//     the history), and
//   - results are kept for a short time, so a burst of visitors (or one
//     guest changing dates a few times) shares one read.
import { adminDb } from './firebaseAdmin';

// Same statuses that never hold a room (see holdsRoom in src/lib/unpaidBookings).
const CLOSED_STATUSES = ['cancelled', 'checked-out', 'rejected', 'Cancelled', 'Checked-out', 'checked_out', 'checked out'];
const CACHE_MS = 30 * 1000;

const cache = new Map(); // key -> { at, promise }

function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = load().catch(error => {
    cache.delete(key); // don't keep a failed read
    throw error;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

// Bookings that may still hold a room: [{ id, ...data }].
export function loadActiveReservations() {
  return cached('reservations', async () => {
    const snapshot = await adminDb.collection('reservations').where('status', 'not-in', CLOSED_STATUSES).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
}

// All rooms: [{ id, ...data }].
export function loadRoomsCached() {
  return cached('rooms', async () => {
    const snapshot = await adminDb.collection('rooms').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
}
