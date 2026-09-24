/**
 * Security headers (§32). Applied by the Next.js middleware to every response. The
 * CSP uses a per-request nonce for inline scripts and allowlists the Paymob iframe
 * origin so hosted checkout renders without weakening the policy elsewhere.
 */
import { randomBytes } from 'node:crypto';

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export interface SecurityHeaderOptions {
  nonce: string;
  isProd: boolean;
  /** Extra origins the CSP must allow (payment iframes, image CDNs). */
  paymobOrigin?: string;
}

export function buildSecurityHeaders(opts: SecurityHeaderOptions): Record<string, string> {
  const { nonce, isProd, paymobOrigin } = opts;
  const frameSrc = ["'self'", paymobOrigin].filter(Boolean).join(' ');
  const connectSrc = ["'self'", paymobOrigin].filter(Boolean).join(' ');

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    // Next.js needs 'unsafe-inline' fallback for older browsers alongside the nonce;
    // in prod we rely on the nonce and strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' ${isProd ? "'strict-dynamic'" : "'unsafe-eval' 'unsafe-inline'"}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    // Uploaded images live on the S3_PUBLIC_URL bucket (Cloudflare R2 in prod).
    `img-src 'self' data: blob: https://images.unsplash.com https://*.r2.dev`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    `frame-ancestors 'none'`,
    `form-action 'self' ${paymobOrigin ?? ''}`.trim(),
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(self)',
    'X-DNS-Prefetch-Control': 'off',
  };
  if (isProd) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }
  return headers;
}
