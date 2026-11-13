// Verifies a Firebase ID token and checks that its user is active staff.
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from './firebaseAdmin';
import { hasFeature } from '../src/lib/staffAccess';

const ALLOWED_ROLES = ['admin', 'receptionist'];
const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

export async function verifyStaff(req) {
  if (!adminDb) return null;

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (error) {
    if (INVALID_TOKEN_CODES.has(error.code)) return null;
    throw error;
  }
  const snap = await adminDb.collection('users').doc(decoded.uid).get();
  const data = snap.data() || {};
  const role = String(data.role || '').trim().toLowerCase();
  const status = String(data.status || 'active').trim().toLowerCase();
  if (!ALLOWED_ROLES.includes(role) || status === 'inactive') return null;
  // Locked after too many wrong passwords (see apiHandlers/login-guard.js).
  if (Number(data.loginLockedUntil || 0) > Date.now()) return null;
  return {
    uid: decoded.uid,
    role,
    name: String(data.name || '').slice(0, 80),
    email: String(data.email || decoded.email || '').slice(0, 120),
    access: data.access && typeof data.access === 'object' ? data.access : {},
  };
}

// True if this staff member may use an admin feature: admins always, a
// receptionist only with an active grant (see src/lib/staffAccess.js).
export function staffCan(staff, featureId) {
  return hasFeature(staff, featureId);
}
