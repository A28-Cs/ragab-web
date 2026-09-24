import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBcwoqzu6TpbsKoPIr-BxDMhO0M5fr6GIQ",
  authDomain: "ragab-pharmacy.firebaseapp.com",
  projectId: "ragab-pharmacy",
  storageBucket: "ragab-pharmacy.firebasestorage.app",
  messagingSenderId: "845568085802",
  appId: "1:845568085802:web:2c87d0568df93feb545853",
  measurementId: "G-898W3RKVVM"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const engeznyDb = db; // keep alias for backwards compatibility

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

export { app, db, engeznyDb, auth, googleProvider, appleProvider };
