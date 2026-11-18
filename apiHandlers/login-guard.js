// POST /api/login-guard
//
// Counts wrong staff passwords and locks an account after too many.
//
// The password itself is checked by Firebase in the staff member's own
// browser. (It used to be checked here, but then every sign-in came from
// this server's one address, and after a burst of wrong passwords Google
// blocked that address for everyone, so no account could sign in.)
//
//   { action: 'check', email }
//     Before signing in: refuses (423) while the account is locked.
//   { action: 'failed', email }
//     After a wrong password: counts it. 5 within 15 minutes lock the
//     account for 15 minutes; the admin gets an alert and it goes in the
//     Activity Log. Returns attemptsLeft, or 423 when locked.
//   { action: 'succeeded' }  with the staff member's ID token
//     After signing in: clears the count.
//   { action: 'unlock', uid }   (admin only)
//     Ends a lock early.
// A locked account also can't use any staff API (see lib/verifyStaff.js)
// or open staff pages (RequireStaffRoute checks loginLockedUntil).

import { getAuth } from 'firebase-admin/auth';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { clearAttempts, lockMinutes, recordFailure } from '../lib/attemptLimiter';
import { LOGIN_LIMIT } from '../src/lib/loginLock';

const COLLECTION = 'loginAttempts';
const lockedMessage = minutes => `Too many wrong attempts. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}. Try again later, ask the admin to unlock it, or use Forgot password.`;

// Saves the lock on the staff account and tells the admins.
async function onLocked(email, lockedUntil) {
  let user = null;
  try { user = await getAuth().getUserByEmail(email); } catch { user = null; }
  if (!user) return;
  const userRef = adminDb.collection('users').doc(user.uid);
  const snap = await userRef.get();
  if (!snap.exists) return;
  const name = snap.data().name || email;
  await userRef.update({ loginLockedUntil: lockedUntil });
  await adminDb.collection('notifications').add({
    type: 'login-locked',
    uid: user.uid,
    name,
    email,
    lockedUntil,
    resolved: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  await logActivity(
    { uid: user.uid, name, email, role: snap.data().role || '' },
    { action: 'staff_login_locked', summary: `Locked the account of ${name} after ${LOGIN_LIMIT.max} wrong passwords (15 minutes)` },
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!adminDb) return res.status(503).json({ error: 'Sign-in check is unavailable.' });
  const { action } = req.body || {};

  if (action === 'unlock') {
    const staff = await verifyStaff(req);
    if (!staff || staff.role !== 'admin') return res.status(403).json({ error: 'Only an admin can unlock accounts.' });
    const uid = String(req.body?.uid || '');
    const userRef = adminDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'This account could not be found.' });
    const email = String(snap.data().email || '').trim().toLowerCase();
    await userRef.update({ loginLockedUntil: FieldValue.delete() });
    if (email) await clearAttempts(COLLECTION, email);
    await logActivity(staff, { action: 'staff_login_unlocked', summary: `Unlocked the account of ${snap.data().name || email}` });
    return res.status(200).json({ unlocked: true });
  }

  // 'sign-in' is what older open pages still send: treat it as 'check'.
  if (!['check', 'sign-in', 'failed', 'succeeded'].includes(action)) return res.status(400).json({ error: 'Choose a valid action.' });

  try {
    if (action === 'succeeded') {
      const header = String(req.headers.authorization || '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      let decoded;
      try { decoded = token ? await getAuth().verifyIdToken(token) : null; } catch { decoded = null; }
      if (!decoded) return res.status(401).json({ error: 'Not signed in.' });
      const email = String(decoded.email || '').trim().toLowerCase();
      // Still locked (signed in without the check): keep the lock.
      if (email && await lockMinutes(COLLECTION, email)) return res.status(423).json({ error: lockedMessage(await lockMinutes(COLLECTION, email)), locked: true });
      if (email) await clearAttempts(COLLECTION, email);
      const userRef = adminDb.collection('users').doc(decoded.uid);
      const snap = await userRef.get();
      if (snap.exists && snap.data().loginLockedUntil) await userRef.update({ loginLockedUntil: FieldValue.delete() });
      return res.status(200).json({ ok: true });
    }

    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
    if (!email) return res.status(400).json({ error: 'Enter your email.' });

    const minutes = await lockMinutes(COLLECTION, email);
    if (minutes) return res.status(423).json({ error: lockedMessage(minutes), locked: true, minutesLeft: minutes });
    if (action === 'check' || action === 'sign-in') return res.status(200).json({ ok: true });

    // action === 'failed'
    const next = await recordFailure(COLLECTION, email, LOGIN_LIMIT);
    if (next.justLocked) {
      await onLocked(email, next.lockedUntil).catch(error => console.error('login-guard lock alert failed:', error));
      return res.status(423).json({ error: lockedMessage(Math.round(LOGIN_LIMIT.lockMs / 60000)), locked: true });
    }
    return res.status(200).json({
      attemptsLeft: next.attemptsLeft,
      error: next.attemptsLeft <= 2
        ? `Invalid email or password. ${next.attemptsLeft} attempt${next.attemptsLeft === 1 ? '' : 's'} left before this account is locked for 15 minutes.`
        : 'Invalid email or password.',
    });
  } catch (error) {
    console.error('login-guard failed:', error);
    return res.status(503).json({ error: 'Sign-in check is unavailable.' });
  }
}
