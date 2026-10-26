/**
 * Browser API client. The single bridge between the client components/services and the
 * backend at /api/v1. Responsibilities:
 *  - send the session cookie (credentials: 'include')
 *  - attach the double-submit CSRF header (read from the readable ragab_csrf cookie)
 *    on mutating requests
 *  - unwrap the { success, data } envelope and throw a typed ApiError on failures so
 *    callers can surface the stable code + bilingual message
 * No prices, permissions, or trust live here — the server is authoritative.
 */
'use client';

export interface ApiErrorShape {
  code: string;
  message: { ar: string; en: string };
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly bilingual: { ar: string; en: string };
  readonly details?: unknown;
  constructor(status: number, err: ApiErrorShape) {
    super(err.message?.ar || err.message?.en || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = err.code ?? 'UNKNOWN';
    this.bilingual = err.message ?? { ar: 'حدث خطأ', en: 'An error occurred' };
    this.details = err.details;
  }
}

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : undefined;
}

export function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  let csrf = readCookie('ragab_csrf');
  if (!csrf && typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    csrf = btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    document.cookie = `ragab_csrf=${encodeURIComponent(csrf)}; path=/; SameSite=Lax`;
  }
  return csrf;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Idempotency-Key for money-mutating requests. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'include',
    ...(method !== 'GET' ? { cache: 'no-store' as RequestCache } : {}),
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const err = (json as { error?: ApiErrorShape } | null)?.error;
    throw new ApiError(res.status, err ?? { code: 'HTTP_' + res.status, message: { ar: 'حدث خطأ', en: 'Request failed' } });
  }
  return (json as { data: T }).data;
}

/** Convenience helpers. */
export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => apiRequest<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => apiRequest<T>(path, { method: 'POST', body, ...opts }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'DELETE', body }),
};

/** A page cursor result shape used by list endpoints. */
export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Total matching rows (listings that count them). */
  total?: number;
}

/** Upload a raw file (images/prescriptions) to any endpoint. Sends bytes; attaches CSRF header. */
export async function uploadRawFile(path: string, file: File): Promise<{ url: string; contentType: string; size: number }> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { 'content-type': file.type || 'application/octet-stream' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(buildUrl(path), { method: 'POST', headers, credentials: 'include', body: file });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: ApiErrorShape } | null)?.error;
    throw new ApiError(res.status, err ?? { code: 'UPLOAD_FAILED', message: { ar: 'فشل الرفع', en: 'Upload failed' } });
  }
  return (json as { data: { url: string; contentType: string; size: number } }).data;
}

/** Upload a raw image file (product images). Sends bytes; the server validates the type. */
export async function uploadImageFile(file: File): Promise<{ url: string; contentType: string; size: number }> {
  return uploadRawFile('/admin/uploads', file);
}
