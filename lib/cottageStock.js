// Server helpers for cottage availability (reads Firestore with the Admin SDK).
import { adminDb } from './firebaseAdmin';
import { COTTAGE_IDS, countCottagesInUse, getCottageAvailability } from '../src/lib/cottages';
import { LEGACY_COTTAGE_IDS } from '../src/lib/bookingPricing';

export const COTTAGE_INVENTORY_DOC = 'siteSettings/cottageInventory';

export async function readCottageInventory() {
  const snap = await adminDb.doc(COTTAGE_INVENTORY_DOC).get();
  return snap.exists ? snap.data() : {};
}

// Availability of every cottage on `date` for a tour time ('day' | 'night').
// Overnight stays use the cottage for both tour times.
export async function getCottageAvailabilityFor(date, tourPeriod, { ignoreId = '' } = {}) {
  const [inventory, snapshot] = await Promise.all([
    readCottageInventory(),
    adminDb.collection('reservations').where('cottageId', 'in', [...COTTAGE_IDS, ...Object.keys(LEGACY_COTTAGE_IDS)]).get(),
  ]);
  const reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const periods = tourPeriod === 'both' ? ['day', 'night'] : [tourPeriod === 'night' ? 'night' : 'day'];
  // For an overnight booking, a cottage must be free for both tour times.
  const results = periods.map(period => getCottageAvailability(inventory, countCottagesInUse(reservations, date, period, ignoreId)));
  if (results.length === 1) return results[0];
  return Object.fromEntries(Object.keys(results[0]).map(id => {
    const tightest = results.reduce((worst, current) => (
      current[id].left !== null && (worst[id].left === null || current[id].left < worst[id].left) ? current : worst
    ));
    return [id, tightest[id]];
  }));
}
