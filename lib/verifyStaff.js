// Verifies a Firebase ID token and checks that its user is active staff.
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
    if (!ALLOWED_ROLES.includes(role) || status === 'inactive') return null;
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}
