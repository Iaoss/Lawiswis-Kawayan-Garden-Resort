import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


const firebaseConfig = {
  apiKey: "AIzaSyBT7gsygZ1N8i61mVxRyRSYLMd0c8NbwJ0",
  authDomain: "resort-reservation-fea10.firebaseapp.com",
  projectId: "resort-reservation-fea10",
  storageBucket: "resort-reservation-fea10.firebasestorage.app",
  messagingSenderId: "200522441780",
  appId: "1:200522441780:web:4877491e32f5b48f4d9661"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);