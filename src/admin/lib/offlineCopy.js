// A saved copy of the main staff lists, for when the internet is down.
//
// Firestore's own browser cache is not used because it could hang staff login
// on some browsers. This copy is separate and only ever runs on the side:
// saving happens in the background, reading has a time limit, and every
// failure is ignored, so it can never hold up a page or the login.
//
// It holds guest details, so it belongs to one signed-in staff member and is
// erased when anyone signs out.
import { Timestamp } from 'firebase/firestore';

const DB_NAME = 'lkgr-offline';
const STORE = 'lists';
const TIME_LIMIT_MS = 3000;
const SAVE_EVERY_MS = 30000;

// The lists worth keeping: bookings, rooms and payments.
const SAVED_LISTS = ['reservations', 'reservations:open', 'reservations:agency', 'rooms', 'payments'];
export const isSavedList = key => SAVED_LISTS.includes(key);

// Dates are kept as real Firestore Timestamps when read back.
export function serializeDocs(docs) {
  return JSON.stringify(docs.map(doc => ({ id: doc.id, data: doc.data() })), function replacer(key, value) {
    const raw = this[key];
    return typeof Timestamp === 'function' && raw instanceof Timestamp ? { __ts: [raw.seconds, raw.nanoseconds] } : value;
  });
}

export function deserializeDocs(text) {
  return JSON.parse(text, (key, value) => {
    if (!Array.isArray(value?.__ts)) return value;
    return typeof Timestamp === 'function' ? new Timestamp(value.__ts[0], value.__ts[1]) : { seconds: value.__ts[0], nanoseconds: value.__ts[1] };
  });
}

// Looks like a Firestore query snapshot, so pages need no changes.
export function toSnapshot(items, savedAt = 0) {
  const docs = items.map(item => ({ id: item.id, exists: () => true, data: () => item.data }));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: callback => docs.forEach(callback),
    docChanges: () => [],
    metadata: { fromCache: true, hasPendingWrites: false },
    savedAt,
  };
}

const limited = promise => Promise.race([
  promise,
  new Promise((_, reject) => { setTimeout(() => reject(new Error('Offline copy timed out')), TIME_LIMIT_MS); }),
]);

function openDb() {
  return limited(new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('No IndexedDB')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Offline copy is blocked'));
  }));
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await limited(new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  } finally {
    db.close();
  }
}

const lastSaved = new Map();

// Saves a list in the background (at most every 30 seconds per list).
export function saveOfflineCopy(uid, key, snapshot) {
  if (!uid || !isSavedList(key) || typeof indexedDB === 'undefined') return;
  const id = `${uid}:${key}`;
  const now = Date.now();
  if (now - (lastSaved.get(id) || 0) < SAVE_EVERY_MS) return;
  lastSaved.set(id, now);
  setTimeout(() => {
    try {
      const value = { savedAt: now, docs: serializeDocs(snapshot.docs) };
      run('readwrite', store => store.put(value, id)).catch(() => {});
    } catch { /* the copy is optional */ }
  }, 0);
}

// The saved list as a snapshot, or null.
export async function readOfflineCopy(uid, key) {
  if (!uid || !isSavedList(key)) return null;
  try {
    const saved = await run('readonly', store => store.get(`${uid}:${key}`));
    return saved?.docs ? toSnapshot(deserializeDocs(saved.docs), saved.savedAt) : null;
  } catch {
    return null;
  }
}

// Erases everything (on sign-out).
export function clearOfflineCopies() {
  lastSaved.clear();
  if (typeof indexedDB === 'undefined') return;
  run('readwrite', store => store.clear()).catch(() => {});
}
