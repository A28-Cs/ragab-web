import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Named (not the default/unnamed) app: getApps().length counts every app
// regardless of name, so checking that and then calling the no-args getApp()
// (which only ever resolves the app literally named '[DEFAULT]') breaks the
// moment ANY other named app exists — e.g. the 'engezny' Firebase Admin app
// (src/integrations/engezny/firebase.ts), initialized whenever
// ENGEZNY_FIREBASE_SERVICE_ACCOUNT is set, as it is in production. Giving
// this app its own name sidesteps that collision entirely.
const APP_NAME = 'ragab-auth';

function getFirebaseAdminApp() {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  // For verifying ID tokens, we often only need the projectId if we don't need
  // to write to DB/Auth.
  return initializeApp(
    {
      projectId: 'ragab-490cc',
    },
    APP_NAME,
  );
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseAdminApp());
}
