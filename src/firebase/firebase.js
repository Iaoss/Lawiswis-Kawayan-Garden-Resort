import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from './firebaseConfig';

// The live project's web settings (public by design: access is controlled by
// sign-in and the Firestore rules). A test copy of the site can point to a
// separate test project by setting the REACT_APP_FIREBASE_* variables in its
// own Vercel project (see docs/TEST-ENVIRONMENT.md).
export { firebaseConfig };

// True on a test copy of the site, which shows a "TEST SITE" banner.
export const IS_TEST_SITE = process.env.REACT_APP_SITE_MODE === 'test';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firebaseApp = app;
// Plain (in-memory) Firestore. A saved copy in the browser (IndexedDB) was
// tried to save reads, but on some browsers and phones it can hang, which
// left staff stuck after signing in. The staff portal's shared live lists
// (src/admin/lib/liveCollection.js) already avoid re-reading data.
export const db = getFirestore(app);
export const storage = getStorage(app);

// Secondary app: used ONLY for creating accounts, so the admin
// stays signed in on the main app while a new user is created.
const secondaryApp =
  getApps().find((a) => a.name === "secondary") ||
  initializeApp(firebaseConfig, "secondary");

export const secondaryAuth = getAuth(secondaryApp);