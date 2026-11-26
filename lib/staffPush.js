import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from './firebaseAdmin';

export async function sendStaffPush({ roles, title, body, url }) {
  if (!adminDb || !Array.isArray(roles) || roles.length === 0) return;
  try {
    const now = Date.now();
    const snapshot = await adminDb.collection('staffPushTokens')
      .where('role', 'in', roles.slice(0, 10))
      .get();
    const unexpired = snapshot.docs.filter(doc => Number(doc.data().expiresAt || 0) > now);
    const userSnapshots = [];
    for (let index = 0; index < unexpired.length; index += 500) {
      userSnapshots.push(...await adminDb.getAll(
        ...unexpired.slice(index, index + 500).map(doc => adminDb.collection('users').doc(doc.data().uid)),
      ));
    }
    const usersById = new Map(userSnapshots.map(doc => [doc.id, doc.data() || {}]));
    const active = unexpired.filter(doc => {
      const tokenData = doc.data();
      const user = usersById.get(tokenData.uid);
      return user
        && String(user.role || '').trim().toLowerCase() === tokenData.role
        && String(user.status || 'active').trim().toLowerCase() !== 'inactive'
        && Number(user.loginLockedUntil || 0) <= now;
    });
    if (!active.length) return;

    for (let index = 0; index < active.length; index += 500) {
      const batch = active.slice(index, index + 500);
      const response = await getMessaging().sendEach(batch.map(doc => {
        const role = doc.data().role;
        const targetUrl = role === 'receptionist'
          ? String(url || '/').replace(/^\/admin(?=\/|$)/, '/receptionist')
          : String(url || '/');
        return {
          token: doc.data().token,
          notification: { title: String(title).slice(0, 100), body: String(body).slice(0, 220) },
          data: { url: targetUrl },
          webpush: { notification: { icon: '/logo192.png', badge: '/favicon.ico', vibrate: [250, 120, 250] } },
        };
      }));
      const stale = [];
      response.responses.forEach((result, responseIndex) => {
        if (!result.success && [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
        ].includes(result.error?.code)) stale.push(batch[responseIndex].ref.delete());
      });
      await Promise.all(stale);
    }
  } catch (error) {
    console.error('Staff push notification could not be sent:', error);
  }
}
