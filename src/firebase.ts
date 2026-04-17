import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

type FirebaseServices = {
  db: ReturnType<typeof getFirestore> | null;
  storage: ReturnType<typeof getStorage> | null;
};

let cached: FirebaseServices | null = null;

export const getFirebaseServices = (): FirebaseServices => {
  if (cached) {
    return cached;
  }

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    cached = { db: null, storage: null };
    return cached;
  }

  const app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });

  cached = {
    db: getFirestore(app),
    storage: getStorage(app),
  };

  return cached;
};