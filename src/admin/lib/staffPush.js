import { deleteToken, getMessaging, getToken } from 'firebase/messaging';
import { auth, firebaseApp } from '../../firebase/firebase';

const endpoint = '/api/staff-push';

async function updateToken(action, token) {
  const user = auth.currentUser;
  if (!user || !token) throw new Error('Sign in before managing phone alerts.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ action, token }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Phone alert registration failed.');
}

export async function registerStaffPush() {
  const vapidKey = process.env.REACT_APP_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error('Phone alerts are not configured. Add the Firebase web-push VAPID key to the site environment.');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support background phone alerts.');
  }
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to receive phone alerts.');
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('The browser did not create a push subscription. Try again.');
  await updateToken('register', token);
}

export async function unregisterStaffPush() {
  if (!('serviceWorker' in navigator) || !auth.currentUser) return;
  const vapidKey = process.env.REACT_APP_FIREBASE_VAPID_KEY;
  if (!vapidKey) return;
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return;
  await updateToken('unregister', token);
  await deleteToken(messaging);
}
