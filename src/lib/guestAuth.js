import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/firebase';

let guestSignInPromise = null;

export async function ensureGuestAuth() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!guestSignInPromise) {
    guestSignInPromise = signInAnonymously(auth)
      .then(credential => credential.user)
      .finally(() => {
        guestSignInPromise = null;
      });
  }
  return guestSignInPromise;
}

export function guestAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/operation-not-allowed':
      return 'Guest chat is not enabled in Firebase. Enable Authentication → Sign-in method → Anonymous, then try again.';
    case 'auth/unauthorized-domain':
      return 'This website domain is not authorized for Firebase sign-in. Add it under Firebase Authentication → Settings → Authorized domains.';
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'Chat access was denied by Firestore rules. Check the guest conversation and message permissions.';
    case 'unavailable':
    case 'auth/network-request-failed':
      return 'Chat could not reach Firebase. Check your connection and try again.';
    default:
      return 'Guest chat could not connect to Firebase. Please try again, or contact the resort if the problem continues.';
  }
}
