import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// The live project's web settings (public by design: access is controlled by
// sign-in and the Firestore rules). A test copy of the site can point to a
// separate test project by setting the REACT_APP_FIREBASE_* variables in its
// own Vercel project (see docs/TEST-ENVIRONMENT.md).
const env = process.env;
const firebaseConfig = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBT7gsygZ1N8i61mVxRyRSYLMd0c8NbwJ0",
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN || "resort-reservation-fea10.firebaseapp.com",
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID || "resort-reservation-fea10",
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET || "resort-reservation-fea10.firebasestorage.app",
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "200522441780",
  appId: env.REACT_APP_FIREBASE_APP_ID || "1:200522441780:web:4877491e32f5b48f4d9661"
};

// True on a test copy of the site, which shows a "TEST SITE" banner.
export const IS_TEST_SITE = env.REACT_APP_SITE_MODE === 'test';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Keep a local copy of what this browser has already read (shared across
// tabs). Live lists that restart when another page opens then only fetch
// what changed, which saves a lot of the daily free reads. Browsers without
// IndexedDB (and the test runner) fall back to the normal setup.
function createDb() {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || process.env.NODE_ENV === 'test') return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
export const storage = getStorage(app);

// Secondary app: used ONLY for creating accounts, so the admin
// stays signed in on the main app while a new user is created.
const secondaryApp =
  getApps().find((a) => a.name === "secondary") ||
  initializeApp(firebaseConfig, "secondary");

export const secondaryAuth = getAuth(secondaryApp);