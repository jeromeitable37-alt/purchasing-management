import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

export const firebaseConfigured = () => {
  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId
  );
};

const app = getApps().length
  ? getApp()
  : initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const googleProvider = new GoogleAuthProvider();

export function subscribeAuth(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, callback);
}

export async function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInEmail(
  email: string,
  password: string
) {
  return signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function registerEmail(
  email: string,
  password: string
) {
  const result =
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

  return result;
}

export async function signOutApp() {
  await signOut(auth);
}

export async function updateFirebaseProfile(
  displayName: string,
  photoURL?: string
) {
  if (!auth.currentUser) return;

  await updateProfile(auth.currentUser, {
    displayName,
    photoURL:
      photoURL || auth.currentUser.photoURL || undefined,
  });
}

export function currentFirebaseUser() {
  return auth.currentUser;
}