// Counts wrong attempts (staff passwords, booking lookups) in Firestore and
// reports when the limit is reached. Keys are hashed, so no email address or
// IP address is stored in plain text.
import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';
import { minutesLocked, registerFailure } from '../src/lib/loginLock';

export const hashKey = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');

// The caller's IP address (Vercel puts it in x-forwarded-for).
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

const refFor = (collection, key) => adminDb.collection(collection).doc(hashKey(key));

// Minutes left on a lock for this key (0 = not locked).
export async function lockMinutes(collection, key) {
  const snap = await refFor(collection, key).get();
  return snap.exists ? minutesLocked(snap.data()) : 0;
}

// Records one wrong attempt. Returns { justLocked, attemptsLeft, lockedUntil }.
export async function recordFailure(collection, key, limit, extra = {}) {
  const ref = refFor(collection, key);
  return adminDb.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const next = registerFailure(snap.exists ? snap.data() : {}, Date.now(), limit);
    transaction.set(ref, {
      failures: next.failures,
      lockedUntil: next.lockedUntil,
      ...(next.justLocked ? { lockedAt: next.lockedAt } : {}),
      updatedAt: Date.now(),
      ...extra,
    }, { merge: true });
    return next;
  });
}

export async function clearAttempts(collection, key) {
  await refFor(collection, key).delete().catch(() => {});
}
