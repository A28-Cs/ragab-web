/**
 * Test helper: invoke a defineRoute handler like Next.js would, threading cookies
 * so multi-step flows (register -> login -> me) work end-to-end. Returns the parsed
 * JSON envelope, HTTP status, and any Set-Cookie values.
 */
type RouteHandler = (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallResult {
  status: number;
  body: any;
  cookies: Record<string, string>;
  raw: Response;
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  /** Query string parameters (validated by the route's querySchema). */
  query?: Record<string, string>;
  /** Pass `null` to simulate a native client that sends no Origin header. */
  origin?: string | null;
  csrfToken?: string;
}

const APP_ORIGIN = 'http://localhost:3000';

export async function callRoute(handler: RouteHandler, opts: CallOptions = {}): Promise<CallResult> {
  const method = opts.method ?? 'GET';
  const headers = new Headers(opts.headers ?? {});
  headers.set('content-type', 'application/json');
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP_ORIGIN);
  if (opts.cookies && Object.keys(opts.cookies).length) {
    headers.set('cookie', Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
  }
  if (opts.csrfToken) headers.set('x-csrf-token', opts.csrfToken);

  const url = new URL(`${APP_ORIGIN}/api/test`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const req = new Request(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  const cookies = parseSetCookies(res.headers);
  return { status: res.status, body: text ? JSON.parse(text) : null, cookies, raw: res };
}

function parseSetCookies(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  // Node's Headers.getSetCookie() returns all Set-Cookie values.
  const list = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of list) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}
