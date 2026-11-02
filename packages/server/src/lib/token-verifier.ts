import crypto from 'node:crypto';
import { logger } from './logger';

export interface DecodedSocialToken {
  email: string;
  name?: string;
  sub: string;
}

let firebaseCertCache: { certs: Record<string, string> | null; expiresAt: number } = {
  certs: null,
  expiresAt: 0,
};

async function getGoogleFirebaseCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && firebaseCertCache.certs && now < firebaseCertCache.expiresAt) {
    return firebaseCertCache.certs;
  }
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Firebase certs: ${res.status}`);
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const match = cacheControl.match(/max-age=(\d+)/);
  const maxAge = match ? parseInt(match[1], 10) : 3600;
  const certs = (await res.json()) as Record<string, string>;
  firebaseCertCache = {
    certs,
    expiresAt: now + maxAge * 1000,
  };
  return certs;
}

/**
 * Verifies a Firebase Auth ID token directly using Google's public certificates.
 * 100% self-contained: requires no service account credentials and works reliably
 * on serverless platforms like Vercel.
 */
async function verifyFirebaseTokenDirectly(token: string): Promise<DecodedSocialToken | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    user_id?: string;
    email?: string;
    name?: string;
    exp?: number;
    email_verified?: boolean;
  };

  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Must be RS256 with a key ID
  if (header.alg !== 'RS256' || !header.kid) {
    return null;
  }

  // Check expiration (with 60s leeway)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - 60) {
    logger().warn({ exp: payload.exp, now }, 'Firebase token is expired');
    return null;
  }

  // Check issuer: Firebase ID tokens have issuer https://securetoken.google.com/<projectId>
  if (!payload.iss || !payload.iss.startsWith('https://securetoken.google.com/')) {
    return null;
  }

  // Verify the signature against Google's public certificates
  let certs = await getGoogleFirebaseCerts(false);
  let cert = certs[header.kid];
  if (!cert) {
    // Key may have rotated, retry once with fresh fetch
    certs = await getGoogleFirebaseCerts(true);
    cert = certs[header.kid];
  }

  if (!cert) {
    logger().warn({ kid: header.kid }, 'No matching Google Firebase cert found for kid');
    return null;
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const verified = verifier.verify(cert, Buffer.from(parts[2], 'base64url'));
    if (!verified) {
      logger().warn('Firebase token signature verification failed');
      return null;
    }
  } catch (err) {
    logger().warn({ err }, 'Error during Firebase RSA verification');
    return null;
  }

  const sub = payload.sub || payload.user_id;
  if (!sub || !payload.email) {
    return null;
  }

  return {
    email: payload.email,
    name: payload.name,
    sub,
  };
}

/**
 * Verifies a Google OAuth ID token via Google's tokeninfo endpoint (native mobile flow).
 */
async function verifyGoogleOAuthIdToken(token: string): Promise<DecodedSocialToken | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const info = (await res.json()) as { email?: string; name?: string; sub?: string };
      if (info.email && info.sub) {
        return {
          email: info.email,
          name: info.name,
          sub: info.sub,
        };
      }
    }
  } catch (err) {
    logger().warn({ err }, 'Google tokeninfo verification failed');
  }
  return null;
}

/**
 * Verifies a Google OAuth access token via userinfo endpoint.
 */
async function verifyGoogleAccessToken(token: string): Promise<DecodedSocialToken | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const userinfo = (await res.json()) as { email?: string; name?: string; sub?: string };
      if (userinfo.email && userinfo.sub) {
        return {
          email: userinfo.email,
          name: userinfo.name,
          sub: userinfo.sub,
        };
      }
    }
  } catch (err) {
    logger().warn({ err }, 'Google userinfo verification failed');
  }
  return null;
}

/**
 * Verifies Google and Apple authentication tokens using multiple robust fallback strategies.
 */
export async function verifySocialToken(token: string, provider: 'google' | 'apple'): Promise<DecodedSocialToken | null> {
  // Strategy 1: Direct Firebase ID token verification using Google's public x509 certs
  try {
    const directResult = await verifyFirebaseTokenDirectly(token);
    if (directResult) {
      return directResult;
    }
  } catch (err) {
    logger().warn({ err }, 'Direct Firebase token verification error');
  }

  // Strategy 2: Firebase Admin SDK verification (if credentials available)
  try {
    const { getFirebaseAuth } = await import('./firebase-admin');
    const adminAuth = getFirebaseAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email && decoded.sub) {
      return {
        email: decoded.email,
        name: decoded.name,
        sub: decoded.sub,
      };
    }
  } catch (err: any) {
    logger().debug({ code: err?.code, message: err?.message }, 'Firebase Admin verifyIdToken fallback failed');
  }

  // Strategy 3: Google OAuth ID token (from Mobile GoogleSignIn plugin)
  if (provider === 'google') {
    const oauthIdResult = await verifyGoogleOAuthIdToken(token);
    if (oauthIdResult) {
      return oauthIdResult;
    }

    // Strategy 4: Google OAuth access token
    const oauthAccessResult = await verifyGoogleAccessToken(token);
    if (oauthAccessResult) {
      return oauthAccessResult;
    }
  }

  return null;
}
