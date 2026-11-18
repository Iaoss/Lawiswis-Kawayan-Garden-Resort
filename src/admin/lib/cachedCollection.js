// Shared, live copies of whole collections for the staff pages (dashboards,
// reports, history, customers, payments).
//
// Each collection is read once and then kept up to date by a live listener
// (see liveCollection.js), so switching between these pages reads nothing
// again and staff always see current data, including their own changes.
import { getCollectionSnapshot } from './liveCollection';

export function loadCollection(name) {
  return getCollectionSnapshot(name);
}

// Kept for older callers: live lists update by themselves, so there is
// nothing to clear.
export function invalidateCollections() {}
