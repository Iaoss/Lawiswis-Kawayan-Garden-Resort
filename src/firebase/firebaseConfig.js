const env = process.env;

export const firebaseConfig = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyBT7gsygZ1N8i61mVxRyRSYLMd0c8NbwJ0',
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'resort-reservation-fea10.firebaseapp.com',
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID || 'resort-reservation-fea10',
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'resort-reservation-fea10.firebasestorage.app',
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '200522441780',
  appId: env.REACT_APP_FIREBASE_APP_ID || '1:200522441780:web:4877491e32f5b48f4d9661',
};
