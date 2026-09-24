import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBnTTk-bMD5XYt1Uh-FzWLQ6iY5SPKE-F0",
  authDomain: "ragab-490cc.firebaseapp.com",
  projectId: "ragab-490cc",
  storageBucket: "ragab-490cc.firebasestorage.app",
  messagingSenderId: "635950199489",
  appId: "1:635950199489:web:9a6d96b9ef19ecf7abda40",
  measurementId: "G-YXV9XH6NJQ"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const engeznyDb = db; // keep alias for backwards compatibility

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

export { app, db, engeznyDb, auth, googleProvider, appleProvider };
