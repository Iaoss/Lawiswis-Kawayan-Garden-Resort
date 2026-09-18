// lib/firebaseAdmin.js
//
// Server-side Firebase Admin SDK setup. Used only inside /api serverless
// functions — never import this from client-side React code.
//
// Admin SDK credentials bypass Firestore security rules entirely, which is
// exactly why reservation creation needs to happen here instead of in the
// browser: it lets us run spam checks (honeypot, rate limiting, date-overlap)
// on the server, where a bot skipping your page's JavaScript can't get
// around them.
//
// Required environment variables (set these in Vercel → Project → Settings
// → Environment Variables):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//
// These three values come from a Firebase service account key:
//   Firebase Console → Project Settings → Service Accounts → Generate new
//   private key. That downloads a JSON file containing project_id,
//   client_email, and private_key — copy those three values into Vercel's
//   env vars (the private_key will contain literal "\n" sequences; paste it
//   exactly as-is, the code below converts them back to real newlines).

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export const adminDb = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
