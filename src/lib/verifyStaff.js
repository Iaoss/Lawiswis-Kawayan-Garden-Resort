// lib/verifyStaff.js
//
// Verifies that a request comes from a logged-in staff member.
// The React app sends its Firebase ID token as "Authorization: Bearer <token>".
// We verify the token, then check the user's role in the `users` collection.
//
// Add 'receptionist' to ALLOWED_ROLES later when you open Email to them.

import { getAuth } from 'firebase-admin/auth';
import { adminDb } from './firebaseAdmin';

const ALLOWED_ROLES = ['admin'];

export async function verifyStaff(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = String(snap.data()?.role || '').toLowerCase();
    return ALLOWED_ROLES.includes(role) ? { uid: decoded.uid, role } : null;
  } catch {
    return null;
  }
}
