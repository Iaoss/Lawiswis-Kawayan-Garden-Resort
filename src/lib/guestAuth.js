import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/firebase';

export async function ensureGuestAuth() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
