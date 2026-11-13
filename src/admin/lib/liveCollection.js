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
import { db } from '../../firebase/firebase';

const KEEP_ALIVE_MS = 20 * 60 * 1000;
const feeds = new Map(); // key -> feed

function openFeed(key, makeQuery) {
  let feed = feeds.get(key);
  if (feed) return feed;
  feed = { key, snapshot: null, error: null, listeners: new Set(), waiters: [], stop: null, closeTimer: null, closed: false };
  feeds.set(key, feed);
  const stop = onSnapshot(makeQuery(), snapshot => {
    feed.snapshot = snapshot;
    feed.error = null;
    feed.waiters.splice(0).forEach(({ resolve }) => resolve(snapshot));
    feed.listeners.forEach(listener => listener.onNext(snapshot));
  }, error => {
    feed.error = error;
    feed.waiters.splice(0).forEach(({ reject }) => reject(error));
    feed.listeners.forEach(listener => listener.onError?.(error));
    // A failed feed (e.g. missing permission) is dropped so it can be retried.
    closeFeed(feed);
  });
  // The listener may have failed (and closed the feed) before returning.
  if (feed.closed) stop(); else feed.stop = stop;
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
