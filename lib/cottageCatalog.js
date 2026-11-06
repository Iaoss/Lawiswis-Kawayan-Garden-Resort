// Loads the admin's cottage list (settings/cottageTypes) on the server and
// applies it to the shared price list (see src/lib/bookingPricing.js).
// Cached for 30 seconds, so a change shows up almost straight away.
import { adminDb } from './firebaseAdmin';
import { applyCottageCatalog } from '../src/lib/bookingPricing';

export const COTTAGE_TYPES_DOC = 'settings/cottageTypes';
let loadedAt = 0;

export async function loadCottageCatalog({ force = false } = {}) {
  if (!adminDb || (!force && Date.now() - loadedAt < 30000)) return;
  try {
    const snapshot = await adminDb.doc(COTTAGE_TYPES_DOC).get();
    if (snapshot.exists) applyCottageCatalog(snapshot.data());
    loadedAt = Date.now();
  } catch (error) {
    console.error('Cottage list could not be loaded; using the last known list:', error);
  }
}
