import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

// Reads the VITE_FIREBASE_* vars. Returns null when any are missing, so the
// app stays 100% local (no network calls) without a configured .env.
function readEnv(): FirebaseEnv | null {
  const env = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (!env.apiKey || !env.authDomain || !env.projectId || !env.appId) return null;
  return env as FirebaseEnv;
}

export const firebaseConfigured = readEnv() !== null;

export interface FirebaseClients {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Lazily initializes Firebase from env vars. Returns null when unconfigured so
// callers can no-op and keep the app running offline.
export function getFirebase(): FirebaseClients | null {
  const env = readEnv();
  if (!env) return null;
  if (!app) {
    app = initializeApp(env);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app, auth: auth!, db: db! };
}
