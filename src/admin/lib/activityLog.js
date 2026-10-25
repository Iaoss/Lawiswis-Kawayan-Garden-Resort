import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';

// Adds an Activity Log entry for something staff did in the browser
// (room changes, staff accounts). The security rules only accept entries
// signed with the staff member's own account. A failed write is ignored so
// it never blocks the action itself.
let cachedProfile = null;

async function staffProfile(user) {
  if (cachedProfile?.uid === user.uid) return cachedProfile;
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  const data = snapshot.data() || {};
  cachedProfile = {
    uid: user.uid,
    name: String(data.name || '').slice(0, 80),
    email: String(data.email || user.email || '').slice(0, 120),
    role: String(data.role || '').slice(0, 20),
  };
  return cachedProfile;
}

export async function logStaffActivity(action, summary, { reservationId = '', guestName = '', details = {} } = {}) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const profile = await staffProfile(user);
    await addDoc(collection(db, 'activityLogs'), {
      action,
      summary: String(summary).slice(0, 300),
      reservationId,
      guestName,
      details,
      staffUid: profile.uid,
      staffName: profile.name,
      staffEmail: profile.email,
      staffRole: profile.role,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Activity log entry was not saved:', error);
  }
}
