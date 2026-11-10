// Reads the holiday / peak-season periods (settings/seasonalRates) on the
// server. See src/lib/seasonalRates.js.
import { adminDb } from './firebaseAdmin';
import { normalizeSeasonPeriods } from '../src/lib/seasonalRates';

export async function readSeasonPeriods() {
  if (!adminDb) return [];
  try {
    const snapshot = await adminDb.doc('settings/seasonalRates').get();
    return normalizeSeasonPeriods(snapshot.exists ? snapshot.data() : null);
  } catch (error) {
    console.error('Seasonal rates could not be read:', error);
    return [];
  }
}
