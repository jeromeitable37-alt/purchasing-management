// Compatibility bridge for the legacy root-level firestore.ts module.
// The actual Firebase client initialization lives in lib/firebase.ts.
// Re-exporting it here prevents duplicate initialization and keeps the
// existing root firestore.ts import (`./firebase`) working.
export {
  auth,
  db,
  storage,
  firebaseConfigured,
  subscribeAuth,
  signInGoogle,
  signInEmail,
  registerEmail,
  signOutApp,
  updateFirebaseProfile,
  currentFirebaseUser,
} from "./lib/firebase";
