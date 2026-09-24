import { getApp, getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { serverEnv } from '../../config/env';
import { logger } from '../../lib/logger';

let engeznyApp: App | null = null;

/**
 * Initializes and returns the Firebase Admin App for Engezny.
 * Returns null if the service account is not configured.
 */
export function getEngeznyApp(): App | null {
  if (engeznyApp) return engeznyApp;

  const serviceAccount = serverEnv().ENGEZNY_FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    return null;
  }

  try {
    const apps = getApps();
    const existing = apps.find((app) => app.name === 'engezny');
    if (existing) {
      engeznyApp = existing;
      return engeznyApp;
    }

    let parsedCert: object;
    try {
      parsedCert = JSON.parse(
        serviceAccount.startsWith('{')
          ? serviceAccount
          : Buffer.from(serviceAccount, 'base64').toString('utf-8')
      );
    } catch (e) {
      logger().error({ err: e }, 'Failed to parse ENGEZNY_FIREBASE_SERVICE_ACCOUNT');
      return null;
    }

    engeznyApp = initializeApp(
      {
        credential: cert(parsedCert),
      },
      'engezny'
    );
    logger().info('Engezny Firebase Admin SDK initialized successfully');
    return engeznyApp;
  } catch (error) {
    logger().error({ err: error }, 'Failed to initialize Engezny Firebase Admin SDK');
    return null;
  }
}

/**
 * Returns the Firestore instance for Engezny, or null if not configured.
 */
export function getEngeznyFirestore(): Firestore | null {
  const app = getEngeznyApp();
  if (!app) return null;
  return getFirestore(app);
}
