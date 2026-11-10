// POST /api/login-guard
//
// Staff sign-in goes through here first, so wrong passwords are counted on
// the server (the browser can't skip it):
//   { action: 'sign-in', email, password }
//     Checks the password with Firebase. 5 wrong passwords within 15 minutes
//     lock the account for 15 minutes; the admin gets an alert and the lock
//     is saved in the Activity Log. On success the count is cleared and the
//     browser then signs in as usual.
//   { action: 'unlock', uid }   (admin only)
//     Ends a lock early.
// A locked account also can't use any staff API (see lib/verifyStaff.js).

import { getAuth } from 'firebase-admin/auth';
import { adminDb, FieldValue } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';
import { clearAttempts, lockMinutes, recordFailure } from '../lib/attemptLimiter';
import { LOGIN_LIMIT } from '../src/lib/loginLock';

const COLLECTION = 'loginAttempts';
// The Firebase web API key is public (it is also in the browser app).
const API_KEY = process.env.REACT_APP_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBT7gsygZ1N8i61mVxRyRSYLMd0c8NbwJ0';
const WRONG = ['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_EMAIL'];
const lockedMessage = minutes => `Too many wrong attempts. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}. Try again later, ask the admin to unlock it, or use Forgot password.`;

async function checkPassword(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, uid: data.localId };
  return { ok: false, code: String(data?.error?.message || '').split(' ')[0] };
}

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

  if (action !== 'sign-in') return res.status(400).json({ error: 'Choose a valid action.' });
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  try {
    const minutes = await lockMinutes(COLLECTION, email);
    if (minutes) return res.status(423).json({ error: lockedMessage(minutes), locked: true, minutesLeft: minutes });

    const result = await checkPassword(email, password);
    if (result.ok) {
      await clearAttempts(COLLECTION, email);
      const userRef = adminDb.collection('users').doc(result.uid);
      const snap = await userRef.get();
      if (snap.exists && snap.data().loginLockedUntil) await userRef.update({ loginLockedUntil: FieldValue.delete() });
      return res.status(200).json({ ok: true });
    }
    if (result.code === 'USER_DISABLED') return res.status(403).json({ error: 'This account has been disabled. Please contact the resort admin.' });
    if (result.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
      return res.status(429).json({ error: 'Too many sign-in attempts from this device. Please wait a few minutes and try again.' });
    }
    if (!WRONG.includes(result.code)) {
      console.error('login-guard: unexpected sign-in answer', result.code);
      return res.status(502).json({ error: 'Sign-in check is unavailable.' });
    }
    const next = await recordFailure(COLLECTION, email, LOGIN_LIMIT);
    if (next.justLocked) {
      await onLocked(email, next.lockedUntil).catch(error => console.error('login-guard lock alert failed:', error));
      return res.status(423).json({ error: lockedMessage(Math.round(LOGIN_LIMIT.lockMs / 60000)), locked: true });
    }
    return res.status(401).json({
      error: next.attemptsLeft <= 2
        ? `Invalid email or password. ${next.attemptsLeft} attempt${next.attemptsLeft === 1 ? '' : 's'} left before this account is locked for 15 minutes.`
        : 'Invalid email or password.',
      attemptsLeft: next.attemptsLeft,
    });
  } catch (error) {
    console.error('login-guard failed:', error);
    return res.status(500).json({ error: 'Sign-in check is unavailable.' });
  }
}
