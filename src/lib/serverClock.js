// The server's clock, for screens in the staff portal.
//
// Staff computers can have the wrong date or time. This asks the server for
// its time, remembers how far off the device is, and gives back the correct
// time with serverNow(). Saved check-in/check-out times already come from
// the server; this keeps what the screen shows correct too.

let offsetMs = 0;
let synced = false;
let lastSync = 0;
let pending = null;
const listeners = new Set();

const notify = () => listeners.forEach(listener => listener());

export function serverNow() {
  return Date.now() + offsetMs;
}

export function getClockState() {
  return { offsetMs, synced };
}

export function onClockChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncServerClock({ force = false } = {}) {
  if (pending) return pending;
  if (!force && synced && Date.now() - lastSync < 5 * 60 * 1000) return Promise.resolve(getClockState());
  pending = (async () => {
    try {
      const sentAt = Date.now();
      const response = await fetch('/api/server-time', { cache: 'no-store' });
      const receivedAt = Date.now();
      const data = await response.json();
      if (!response.ok || !Number.isFinite(data.now)) throw new Error('No server time');
      // The server answered about halfway through the round trip.
      offsetMs = data.now - (sentAt + receivedAt) / 2;
      synced = true;
      lastSync = receivedAt;
      notify();
    } catch {
      // Keep the last known offset; try again on the next sync.
    } finally {
      pending = null;
    }
    return getClockState();
  })();
  return pending;
}

// "YYYY-MM-DD" for today in the Philippines, using the server's clock.
export function serverTodayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(serverNow()));
}
