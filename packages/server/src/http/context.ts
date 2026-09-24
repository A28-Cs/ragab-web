/**
 * Request context (§13, §34). Built once per request. Carries the correlation id,
 * a child logger, the resolved principal (or null), and helpers for client identity
 * (used as the rate-limit key) and cookies. This is the ONLY place a credential is
 * resolved, so auth resolution is uniform across the two supported transports:
 *
 *   - Browser: an ambient HttpOnly `ragab_session` cookie (CSRF applies — §15).
 *   - Native (mobile §5-§8): an `Authorization: Bearer <token>` header, non-ambient,
 *     so CSRF does not apply. Native clients also send `X-Ragab-Client: mobile`,
 *     which a cross-origin browser cannot forge (a custom header forces a CORS
 *     preflight and this server sends no Access-Control-Allow-* headers, so it fails).
 */
import type { Logger } from 'pino';
import { newId } from '../lib/ids';
import { childLogger } from '../lib/logger';
import { SESSION_COOKIE, resolveSession, touchSession, type AuthenticatedPrincipal } from '../security/session';

export interface CookieOptions {
  maxAge?: number; // seconds
  expires?: Date;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface RequestContext {
  requestId: string;
  log: Logger;
  principal: AuthenticatedPrincipal | null;
  ip: string;
  userAgent: string;
  origin: string | null;
  referer: string | null;
  method: string;
  path: string;
  /** Which credential the request presented, if any. 'bearer' is non-ambient (no CSRF). */
  authTransport: 'cookie' | 'bearer' | null;
  /** True when the caller identifies as the native app (`X-Ragab-Client: mobile`). */
  isNativeClient: boolean;
  /** Sanitized, stable per-install id from `X-Device-Id` (native only), else null. */
  deviceId: string | null;
  /**
   * A session token minted during this request (login/register/2FA). Populated by
   * `establishSession` so a native response can return it in the body; browsers get
   * it as an HttpOnly cookie and this stays unread. Null for non-auth requests.
   */
  issuedToken: { token: string; expiresAt: Date } | null;
  /** Reads a cookie value from the request. */
  cookie: (name: string) => string | undefined;
  header: (name: string) => string | null;
  /** Stable identity for rate limiting: userId when known, else device (native) or IP. */
  rateIdentity: () => string;
  /** Queue a Set-Cookie on the response. */
  setCookie: (name: string, value: string, options?: CookieOptions) => void;
  clearCookie: (name: string, options?: CookieOptions) => void;
  /** Internal: accumulated Set-Cookie header values, drained by the handler. */
  readonly outgoingCookies: string[];
  /** Device fingerprint derived from the User-Agent, for session records. */
  deviceInfo: () => { device: string; deviceType: string; browser: string };
}

/** Minimal shape we need from a Web Request (Next.js route handlers pass this). */
export interface RequestLike {
  method: string;
  url: string;
  headers: Headers;
}

function parseCookies(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) jar.set(k, decodeURIComponent(v));
  }
  return jar;
}

function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? '0.0.0.0';
}

/** Extract a Bearer token from an Authorization header, case-insensitively. */
function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Bound and validate a client-supplied device id before it becomes part of a Redis
 * rate-limit key. Rejects anything outside a small safe charset / length so a caller
 * cannot inflate keyspace or inject key separators.
 */
function safeDeviceId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^[A-Za-z0-9._:-]{8,64}$/.test(trimmed) ? trimmed : null;
}

export async function buildContext(req: RequestLike): Promise<RequestContext> {
  console.log("--> buildContext HIT!");
  const requestId = req.headers.get('x-request-id') ?? newId();
  const url = new URL(req.url);
  const cookies = parseCookies(req.headers.get('cookie'));
  const ip = clientIp(req.headers);
  const userAgent = req.headers.get('user-agent') ?? '';

  // Credential resolution: a Bearer token (native, non-ambient) takes precedence over
  // the ambient session cookie (browser). authTransport records which was PRESENTED.
  const bearer = parseBearer(req.headers.get('authorization'));
  const cookieToken = cookies.get(SESSION_COOKIE);
  const sessionToken = bearer ?? cookieToken;
  const authTransport: 'cookie' | 'bearer' | null = bearer
    ? 'bearer'
    : cookieToken
      ? 'cookie'
      : null;
  const isNativeClient = req.headers.get('x-ragab-client')?.trim().toLowerCase() === 'mobile';
  const deviceId = safeDeviceId(req.headers.get('x-device-id'));

  let principal: AuthenticatedPrincipal | null = null;
  if (sessionToken) {
    try {
      principal = await resolveSession(sessionToken);
    } catch {
      principal = null; // never let auth resolution 500 a request
    }
    // Slide the session window on activity (throttled inside touchSession to one write
    // per minute). Fire-and-forget: a failed touch must never fail or delay the request.
    if (principal) {
      void touchSession(principal.sessionId).catch(() => undefined);
    }
  }

  const log = childLogger({
    requestId,
    method: req.method,
    path: url.pathname,
    userId: principal?.userId,
  });

  const outgoingCookies: string[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  return {
    requestId,
    log,
    principal,
    ip,
    userAgent,
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    method: req.method,
    path: url.pathname,
    authTransport,
    isNativeClient,
    deviceId,
    issuedToken: null,
    cookie: (name) => cookies.get(name),
    header: (name) => req.headers.get(name),
    // A known user keys on userId. Anonymous native traffic keys on the per-install
    // device id so users behind carrier-grade NAT (very common on Egyptian mobile)
    // don't share one IP's login/register budget; it still folds in the IP so a
    // single host rotating device ids can't win an unbounded number of buckets.
    rateIdentity: () =>
      principal?.userId ?? (deviceId ? `dev:${deviceId}:${ip}` : `ip:${ip}`),
    outgoingCookies,
    setCookie: (name, value, options = {}) => {
      outgoingCookies.push(serializeCookie(name, value, { httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', ...options }));
    },
    clearCookie: (name, options = {}) => {
      outgoingCookies.push(serializeCookie(name, '', { httpOnly: true, secure: isProd, sameSite: 'Lax', path: '/', ...options, maxAge: 0 }));
    },
    deviceInfo: () => deriveDevice(userAgent),
  };
}

function serializeCookie(name: string, value: string, opts: import('./context').CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

function deriveDevice(ua: string): { device: string; deviceType: string; browser: string } {
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'mobile' : /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop';
  const browser = /edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Unknown';
  const device = /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : 'Unknown';
  return { device, deviceType, browser };
}
