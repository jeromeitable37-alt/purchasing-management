import {
  cert,
  getApps,
  initializeApp,
  type App
} from "firebase-admin/app";

import {
  getFirestore,
  type Firestore
} from "firebase-admin/firestore";

function getAdminApp(): App {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

  /*
   * If the Admin credentials are available,
   * initialize Firebase Admin explicitly.
   *
   * This is the correct setup for Vercel.
   */
  if (
    projectId &&
    clientEmail &&
    privateKey
  ) {
    if (getApps().length > 0) {
      return getApps()[0];
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  /*
   * Development fallback.
   *
   * This only works when Google Application
   * Default Credentials are available.
   */
  if (getApps().length > 0) {
    return getApps()[0];
  }

  throw new Error(
    "Firebase Admin is not configured. " +
      "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
      "and FIREBASE_PRIVATE_KEY in your environment variables."
  );
}

const adminApp = getAdminApp();

export const adminDb: Firestore =
  getFirestore(adminApp);