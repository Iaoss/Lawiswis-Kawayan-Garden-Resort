// Too many wrong attempts lock an account (or a device) for a while.
//   Staff login: 5 wrong passwords within 15 minutes lock the account for
//   15 minutes. An admin can unlock it early from Users.
//   "My bookings" lookup: 10 wrong tries within an hour from one device
//   pause lookups from that device for an hour.

export const LOGIN_LIMIT = { max: 5, windowMs: 15 * 60000, lockMs: 15 * 60000 };
export const LOOKUP_LIMIT = { max: 10, windowMs: 60 * 60000, lockMs: 60 * 60000 };

// Minutes left on a lock (0 when not locked).
export function minutesLocked(record, now = Date.now()) {
  const until = Number(record?.lockedUntil || 0);
  return until > now ? Math.ceil((until - now) / 60000) : 0;
}

// The record after one more wrong attempt. Attempts older than the window
// don't count; reaching the limit starts the lock and clears the count.
export function registerFailure(record = {}, now = Date.now(), limit = LOGIN_LIMIT) {
  const recent = (Array.isArray(record.failures) ? record.failures : [])
    .map(Number)
    .filter(at => Number.isFinite(at) && now - at < limit.windowMs);
  const failures = [...recent, now];
  if (failures.length >= limit.max) {
    return { failures: [], lockedUntil: now + limit.lockMs, lockedAt: now, justLocked: true, attemptsLeft: 0 };
  }
  return { failures, lockedUntil: 0, justLocked: false, attemptsLeft: limit.max - failures.length };
}
