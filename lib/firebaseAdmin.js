// Server-side Firebase Admin SDK setup. Import only from server functions.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const hasAdminConfig = Boolean(projectId && clientEmail && privateKey);

if (!getApps().length && hasAdminConfig) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminDb = getApps().length ? getFirestore() : null;
export { FieldValue };
