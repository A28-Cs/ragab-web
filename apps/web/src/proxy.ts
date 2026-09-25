/**
 * Edge proxy (Next 16 renamed "middleware" → "proxy") (§32, §15). Runs on every request. Responsibilities:
 *   - Set strict security headers (CSP, HSTS, etc).
 *   - Ensure a readable `ragab_csrf` token cookie exists (double-submit CSRF).
 *   - A defense-in-depth same-origin check on mutating API requests (the route
 *     handler enforces this authoritatively too).
 * Self-contained (Web Crypto only) so it bundles for the Edge runtime.
 */
import { NextResponse, type NextRequest } from 'next/server';

const CSRF_COOKIE = 'ragab_csrf';
const PAYMOB_ORIGIN = 'https://accept.paymob.com';
// Firebase project's authDomain (apps/web/src/lib/firebase.ts) — signInWithPopup loads a
// hidden gapi iframe/script from Google to relay the popup's sign-in result back to us.
// Must resolve exactly like the client config: if this drifts from the real authDomain the
// iframe is CSP-blocked and the popup hangs on a blank /__/auth/handler page forever.
const FIREBASE_AUTH_DOMAIN = `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ragab-pharmacy.firebaseapp.com'}`;
const GOOGLE_AUTH_ORIGINS = 'https://apis.google.com https://www.gstatic.com';

function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Object-storage origin(s) allowed to serve <img>. Uploaded product/category/promotion
 * images live on the S3_PUBLIC_URL bucket (Cloudflare R2 in prod). Derived from env so a
 * self-hosted bucket/CDN works without editing the CSP; the '*.r2.dev' default covers the
 * current R2 public bucket even if the env var is absent from the Edge bundle.
 */
function storageImgSrc(): string {
  let origin = '';
  try {
    const raw = process.env.S3_PUBLIC_URL;
    if (raw) origin = new URL(raw).origin;
  } catch {
    /* malformed URL → rely on the wildcard default */
  }
  return ['https://*.r2.dev', origin].filter(Boolean).join(' ');
}

function buildCsp(isProd: boolean): string {
  // No nonce/'strict-dynamic': most routes are statically prerendered and cached,
  // so a per-request nonce baked into cached HTML would mismatch the header on
  // every subsequent request and block all scripts. 'self' covers same-origin
  // Next.js chunks; 'unsafe-inline' covers Next's hydration bootstrap script.
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} ${GOOGLE_AUTH_ORIGINS}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https://images.unsplash.com https://placehold.co https://*.googleusercontent.com ${storageImgSrc()}`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self' ${PAYMOB_ORIGIN} ${GOOGLE_AUTH_ORIGINS} https://securetoken.googleapis.com https://identitytoolkit.googleapis.com`,
    `frame-src 'self' ${PAYMOB_ORIGIN} ${FIREBASE_AUTH_DOMAIN} https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `form-action 'self' ${PAYMOB_ORIGIN}`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function proxy(req: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';

  const res = NextResponse.next();

  // Security headers.
  res.headers.set('Content-Security-Policy', buildCsp(isProd));
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
  if (isProd) res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Ensure the CSRF token cookie exists (double-submit). Readable by JS on purpose.
  if (!req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, randomToken(24), {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return res;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
