// Firestore reads are limited on the free plan (about 50,000 a day), and
// every document a page loads counts as one read. The dashboards, reports,
// history and customer pages each load whole collections, so moving between
// them used to read everything again each time.
//
// loadCollection keeps each collection for a minute and shares it between
// pages. Any change made through the staff API clears it (see staffApi), so
// staff still see their own changes straight away.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const MAX_AGE_MS = 60 * 1000;
const cache = new Map(); // name -> { at, promise }

export function loadCollection(name, { maxAgeMs = MAX_AGE_MS, force = false } = {}) {
  const hit = cache.get(name);
  if (!force && hit && Date.now() - hit.at < maxAgeMs) return hit.promise;
  const promise = getDocs(collection(db, name)).catch(error => {
    cache.delete(name);
    throw error;
  });
  cache.set(name, { at: Date.now(), promise });
  return promise;
}

// Forget saved collections (all of them, or the names given).
export function invalidateCollections(...names) {
  if (!names.length) cache.clear();
  else names.forEach(name => cache.delete(name));
}
