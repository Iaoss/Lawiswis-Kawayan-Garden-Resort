// One shared live connection per list (a collection or a query) for the
// staff portal.
//
// Why: Firestore counts one read for every document a listener or getDocs
// returns. Each staff page builds its own layout, so the notification bell,
// the Reservations list and the dashboards used to start over and re-read
// every booking whenever staff switched pages.
//
// Now a list is read once and then kept live: later changes cost one read
// per changed document only. The connection stays open for a while after the
// last page using it closes, so moving between pages reads nothing new.
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { isSavedList, readOfflineCopy, saveOfflineCopy } from './offlineCopy';

const KEEP_ALIVE_MS = 20 * 60 * 1000;
const feeds = new Map(); // key -> feed

function openFeed(key, makeQuery) {
  let feed = feeds.get(key);
  if (feed) return feed;
  feed = { key, snapshot: null, error: null, listeners: new Set(), waiters: [], stop: null, closeTimer: null, closed: false };
  feeds.set(key, feed);
  const deliver = snapshot => {
    feed.snapshot = snapshot;
    feed.error = null;
    feed.waiters.splice(0).forEach(({ resolve }) => resolve(snapshot));
    feed.listeners.forEach(listener => listener.onNext(snapshot));
  };
  // No internet: show the copy saved on this computer (see offlineCopy.js).
  const loadSavedCopy = async fallback => {
    await auth?.authStateReady?.();
    const copy = await readOfflineCopy(auth?.currentUser?.uid, key);
    if (feed.closed || feed.hasServerData) return;
    if (copy) deliver(copy);
    else if (fallback) deliver(fallback);
  };
  const stop = onSnapshot(makeQuery(), snapshot => {
    if (!snapshot.metadata?.fromCache) {
      feed.hasServerData = true;
      saveOfflineCopy(auth?.currentUser?.uid, key, snapshot);
    } else if (snapshot.empty && isSavedList(key) && !feed.hasServerData) {
      // Firestore's "nothing yet" while offline must not blank the list.
      loadSavedCopy(snapshot);
      return;
    }
    deliver(snapshot);
  }, error => {
    feed.error = error;
    feed.waiters.splice(0).forEach(({ reject }) => reject(error));
    feed.listeners.forEach(listener => listener.onError?.(error));
    // A failed feed (e.g. missing permission) is dropped so it can be retried.
    closeFeed(feed);
  });
  // The listener may have failed (and closed the feed) before returning.
  if (feed.closed) stop(); else feed.stop = stop;
  if (!feed.closed && isSavedList(key) && typeof navigator !== 'undefined' && navigator.onLine === false) loadSavedCopy(null);
  return feed;
}

function closeFeed(feed) {
  clearTimeout(feed.closeTimer);
  feed.closed = true;
  feed.stop?.();
  if (feeds.get(feed.key) === feed) feeds.delete(feed.key);
}

function scheduleClose(feed) {
  clearTimeout(feed.closeTimer);
  if (feed.listeners.size > 0) return;
  feed.closeTimer = setTimeout(() => {
    if (feed.listeners.size === 0) closeFeed(feed);
  }, KEEP_ALIVE_MS);
}

// Like onSnapshot, but shared. `key` names the list (use the collection name
// for a whole collection, or a short unique name for a query). Returns an
// unsubscribe function.
export function subscribeLive(key, makeQuery, onNext, onError) {
  const feed = openFeed(key, makeQuery);
  clearTimeout(feed.closeTimer);
  const listener = { onNext, onError };
  feed.listeners.add(listener);
  // A list that's already loaded is handed over straight away (no read).
  if (feed.snapshot) onNext(feed.snapshot);
  return () => {
    feed.listeners.delete(listener);
    scheduleClose(feed);
  };
}

// The latest snapshot of a list, waiting for the first one if needed.
// Keeps the list live for later visits.
export function getLiveSnapshot(key, makeQuery) {
  const feed = openFeed(key, makeQuery);
  if (feed.snapshot) {
    scheduleClose(feed);
    return Promise.resolve(feed.snapshot);
  }
  return new Promise((resolve, reject) => {
    feed.waiters.push({
      resolve: snapshot => { scheduleClose(feed); resolve(snapshot); },
      reject,
    });
  });
}

// Shortcuts for a whole collection.
export const subscribeCollection = (name, onNext, onError) =>
  subscribeLive(name, () => collection(db, name), onNext, onError);
export const getCollectionSnapshot = name => getLiveSnapshot(name, () => collection(db, name));
