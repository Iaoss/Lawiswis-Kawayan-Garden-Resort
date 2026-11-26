// Offline outbox for the staff portal.
//
// When the internet is down, these staff actions are saved on this computer
// instead of failing:
//   payments, extra charges, add-on services, check-in / check-out,
//   arrived guests, walk-in bookings, room status updates, and maintenance reports.
// When the connection comes back they are sent to the server in the same
// order they were made. The server re-checks everything (prices, double
// bookings, balances), and each change carries an id so it is never saved
// twice, even if the connection drops while it is being sent.
//
// A walk-in made offline has no booking number yet. Actions on it use a
// placeholder ("offline-<id>"), which is swapped for the real booking number
// once the walk-in has been sent.

const STORAGE_KEY = 'lkgr_offline_outbox';
const IDS_KEY = 'lkgr_offline_ids';
export const OFFLINE_PREFIX = 'offline-';

// Which actions can wait for the internet. Everything else (previews,
// discounts, promo codes, online payment links, edits) needs the server's
// answer right away.
const QUEUEABLE = {
  'staff-billing': ['record-payment', 'record-group-payment', 'add-charge', 'add-service', 'create-walk-in'],
  'reservation-status': ['set-status', 'set-arrived-guests'],
  housekeeping: ['set-room-status', 'report-issue'],
};

export const isQueueable = (path, body) => Boolean(QUEUEABLE[path]?.includes(String(body?.action || ''))) && !body?.preview;

const listeners = new Set();
const read = (key, fallback) => {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
};
const notify = () => listeners.forEach(listener => { try { listener(getOutbox()); } catch { /* ignore */ } });

export const getOutbox = () => read(STORAGE_KEY, []);
const saveOutbox = items => { write(STORAGE_KEY, items); notify(); };

// Watch the outbox (pending and failed items). Returns an unsubscribe function.
export function subscribeOutbox(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Short description for the "waiting to sync" list.
export function describeAction(path, body = {}) {
  const amount = Number(body.amount);
  const peso = Number.isFinite(amount) && amount > 0 ? ` ₱${amount.toLocaleString()}` : '';
  switch (body.action) {
    case 'record-payment':
    case 'record-group-payment': return `Payment${peso} (${body.method || 'cash'})`;
    case 'add-charge': return `Extra charge${peso}${body.description ? `: ${body.description}` : ''}`;
    case 'add-service': return 'Add-on service';
    case 'create-walk-in': {
      const b = body.booking || {};
      return `Walk-in booking for ${[b.firstName, b.lastName].filter(Boolean).join(' ') || 'guest'}`;
    }
    case 'set-status': return body.status === 'checked-in' ? 'Check-in' : body.status === 'checked-out' ? 'Check-out' : `Status: ${body.status}`;
    case 'set-arrived-guests': return 'Arrived guests';
    case 'set-room-status': return `Room ${body.roomNumber || body.roomId || ''} status: ${body.status || 'updated'}`;
    case 'report-issue': return `Maintenance report for Room ${body.roomNumber || body.roomId || ''}`;
    default: return path;
  }
}

// Save an action for later. Returns the queued item.
export function enqueue(path, body, method = 'POST', uid = '') {
  const item = {
    id: newId(),
    uid, // sent only under the staff member who made it
    path,
    method,
    body: { ...body },
    label: describeAction(path, body),
    createdAt: new Date().toISOString(),
    status: 'pending',
    error: '',
  };
  item.body.offlineRequestId = item.id;
  saveOutbox([...getOutbox(), item]);
  return item;
}

export function dismissItem(id) {
  saveOutbox(getOutbox().filter(item => item.id !== id));
}

export function retryItem(id) {
  saveOutbox(getOutbox().map(item => item.id === id
    ? { ...item, status: 'pending', error: '' }
    : item));
}

// Swap offline placeholders for real booking numbers.
function resolvePlaceholders(body, ids) {
  const swap = value => (typeof value === 'string' && value.startsWith(OFFLINE_PREFIX) ? (ids[value.slice(OFFLINE_PREFIX.length)] || null) : value);
  const next = { ...body };
  let missing = false;
  ['reservationId'].forEach(key => {
    if (key in next) {
      const value = swap(next[key]);
      if (value === null) missing = true;
      else next[key] = value;
    }
  });
  return { body: next, missing };
}

const isNetworkError = error => error instanceof TypeError || /network|failed to fetch|load failed/i.test(String(error?.message || ''));

let flushing = null;

// Send waiting actions in order. `send(path, body, method)` performs the real
// request and throws { status, message } on a server refusal.
export function flushOutbox(send, { uid = '' } = {}) {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    let failed = 0;
    for (const item of getOutbox()) {
      if (item.status !== 'pending') continue;
      if (uid && item.uid && item.uid !== uid) continue;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      const ids = read(IDS_KEY, {});
      const { body, missing } = resolvePlaceholders(item.body, ids);
      if (missing) {
        // The walk-in this belongs to hasn't been saved (or failed).
        const parentFailed = getOutbox().some(other => other.status === 'failed' && item.body.reservationId === `${OFFLINE_PREFIX}${other.id}`);
        if (parentFailed) {
          saveOutbox(getOutbox().map(other => (other.id === item.id ? { ...other, status: 'failed', error: 'The walk-in booking it belongs to could not be saved.' } : other)));
          failed += 1;
        }
        continue;
      }
      try {
        const result = await send(item.path, body, item.method);
        if (item.body.action === 'create-walk-in' && result?.reservationId) {
          write(IDS_KEY, { ...read(IDS_KEY, {}), [item.id]: result.reservationId });
        }
        saveOutbox(getOutbox().filter(other => other.id !== item.id));
        sent += 1;
      } catch (error) {
        // No connection or the server is briefly unavailable: try again later.
        if (item.path === 'housekeeping') {
          const canRetry = isNetworkError(error) || error?.status === 429 || error?.status >= 500;
          saveOutbox(getOutbox().map(other => (other.id === item.id
            ? {
              ...other,
              status: canRetry ? 'pending' : 'failed',
              error: error?.message || 'The room update could not be saved.',
            }
            : other)));
          if (canRetry) break;
          failed += 1;
          continue;
        }
        if (isNetworkError(error) || error?.status === 429 || error?.status >= 500) break;
        saveOutbox(getOutbox().map(other => (other.id === item.id ? { ...other, status: 'failed', error: error?.message || 'The server refused this change.' } : other)));
        failed += 1;
      }
    }
    return { sent, failed, pending: getOutbox().filter(item => item.status === 'pending' && (!uid || !item.uid || item.uid === uid)).length };
  })().finally(() => { flushing = null; });
  return flushing;
}
