/**
 * CSRF defense (§15) — double-submit token + strict same-origin check.
 *
 *  1. The middleware sets a random `ragab_csrf` token in a readable (non-HttpOnly),
 *     SameSite=Lax cookie on first contact. A cross-site attacker cannot READ it.
 *  2. The browser client echoes that value in an `X-CSRF-Token` header on every
 *     mutating request. The server checks header === cookie (constant time).
 *  3. Every mutating request additionally must pass a same-origin Origin/Referer check.
 *
 * SameSite=Lax on the session cookie is a third, independent layer. No secret is
 * needed in the token itself — the security comes from the attacker being unable to
 * read our cookie to reproduce the header.
 */
import { safeEqual, generateToken } from './tokens';

export const CSRF_COOKIE = 'ragab_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function newCsrfToken(): string {
  return generateToken(24);
}

/** Verify the double-submit: the readable cookie value must equal the header value. */
export function verifyDoubleSubmit(cookieValue: string | undefined, headerValue: string | null | undefined): boolean {
  if (!cookieValue || !headerValue) return false;
  return safeEqual(cookieValue, headerValue);
}

/**
 * Origin allowlist check. Returns true when the request originates from our own app.
 * `allowedOrigins` derives from NEXT_PUBLIC_APP_URL; provider webhooks are exempt and
 * routed to endpoints that do their own signature verification instead.
 */
export function isSameOrigin(
  origin: string | null,
  referer: string | null,
  allowedOrigins: string[],
): boolean {
  const candidate = origin ?? (referer ? safeOrigin(referer) : null);
  if (!candidate) return false;
  return allowedOrigins.includes(candidate);
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
