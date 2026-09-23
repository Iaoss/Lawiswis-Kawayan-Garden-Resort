// lib/verifyStaff.js
//
// Verifies that a request comes from a logged-in staff member.
// The React app sends its Firebase ID token as "Authorization: Bearer <token>".
// We verify the token, then check the user's role in the `users` collection.
//
// Staff email routes are available to both admins and receptionists.

import { getAuth } from 'firebase-admin/auth';
import { adminDb } from './firebaseAdmin';

const ALLOWED_ROLES = ['admin', 'receptionist'];

export async function verifyStaff(req) {
  if (!adminDb) return null;

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    const data = snap.data() || {};
    const role = String(data.role || '').trim().toLowerCase();
    const status = String(data.status || 'active').trim().toLowerCase();

    if (!ALLOWED_ROLES.includes(role)) return null;
    if (status === 'inactive') return null;

    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}
