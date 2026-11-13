// POST /api/staff-users
//
// Admin-only staff account actions that need the server.
//
//   { action: 'delete-user', uid }
//     Permanently deletes a staff account: the login (Firebase Auth) and the
//     users/{uid} record. An admin can't delete their own account or the last
//     active admin. Past records (bookings, payments, the Activity Log) keep
//     the staff member's name.

import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '../lib/firebaseAdmin';
import { verifyStaff } from '../lib/verifyStaff';
import { logActivity } from '../lib/activityLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!adminDb) return res.status(500).json({ error: 'Service is not configured.' });

  let staff;
  try {
    staff = await verifyStaff(req);
  } catch (error) {
    console.error('Staff verification failed:', error);
    return res.status(503).json({ error: 'Staff verification is temporarily unavailable. Please try again later.' });
  }
  if (!staff) return res.status(401).json({ error: 'Please sign in again.' });
  if (staff.role !== 'admin') return res.status(403).json({ error: 'Only admins can manage staff accounts.' });

  const { action, uid } = req.body || {};
  if (action !== 'delete-user') return res.status(400).json({ error: 'Unknown action.' });
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return res.status(400).json({ error: 'Choose a staff account.' });
  if (uid === staff.uid) return res.status(400).json({ error: 'You can’t delete your own account.' });

  const ref = adminDb.collection('users').doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: 'That staff account no longer exists.' });
  const target = snapshot.data() || {};

  if (String(target.role || '').toLowerCase() === 'admin' && (target.status || 'active') === 'active') {
    const admins = await adminDb.collection('users').where('role', '==', 'admin').get();
    const otherActive = admins.docs.filter(doc => doc.id !== uid && (doc.data().status || 'active') === 'active');
    if (otherActive.length === 0) return res.status(400).json({ error: 'This is the last active admin, so it can’t be deleted.' });
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    // Already gone from Auth: still remove the staff record.
    if (error?.code !== 'auth/user-not-found') {
      console.error('Could not delete the login:', error);
      return res.status(500).json({ error: 'The login could not be deleted. Please try again.' });
    }
  }
  await ref.delete();

  const who = target.name || target.email || 'a staff member';
  await logActivity(staff, {
    action: 'staff_account_deleted',
    summary: `Deleted the ${target.customRoleName || target.role || 'staff'} account of ${who}${target.email ? ` (${target.email})` : ''}`,
    details: { uid, email: target.email || '', role: target.role || '', customRoleName: target.customRoleName || '' },
  });
  return res.status(200).json({ deleted: true, name: who });
}
