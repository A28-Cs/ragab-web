import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { serverEnv } from '../config/env';

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

  try {
    const serviceAccount = serverEnv().ENGEZNY_FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      try {
        const parsedCert = JSON.parse(
          serviceAccount.startsWith('{')
            ? serviceAccount
            : Buffer.from(serviceAccount, 'base64').toString('utf-8')
        );
        return initializeApp(
          {
            credential: cert(parsedCert),
            projectId: parsedCert.project_id || 'ragab-pharmacy',
          },
          APP_NAME
        );
      } catch {
        // Fall through to projectId initialization
      }
    }
  } catch {
    // serverEnv() may throw if secrets missing, fall through to projectId
  }

  // For verifying ID tokens, we often only need the projectId if we don't need
  // to write to DB/Auth.
  return initializeApp(
    {
      projectId: 'ragab-pharmacy',
    },
    APP_NAME,
  );
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseAdminApp());
}
