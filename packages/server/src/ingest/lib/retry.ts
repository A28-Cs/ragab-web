/**
 * Full-jitter exponential backoff (§catalog import).
 *
 * The distinction that matters: a TRANSPORT failure (429, 5xx, socket reset, timeout) is
 * retried; a GraphQL `200 OK` carrying an `errors` array is NOT. The latter means the query
 * itself is wrong, and retrying it just burns the rate budget while hiding a code bug.
 */
import { sleep } from './limiter';

export class NonRetryableError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class RetryableError extends Error {
  constructor(
    message: string,
    /** From a Retry-After header, in ms. Honoured in preference to the computed backoff. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  onRetry?: (info: { attempt: number; waitMs: number; error: unknown }) => void;
}

/** Retry `fn` on RetryableError only. Returns its value, or rethrows the last error. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 30_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof NonRetryableError) throw err;
      if (attempt === attempts) break;
      const retryAfter = err instanceof RetryableError ? err.retryAfterMs : undefined;
      // Full jitter: random in [0.5, 1) × the exponential ceiling, so a fleet of workers
      // does not synchronise its retries into a thundering herd.
      const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const waitMs = retryAfter ?? Math.round(ceiling * (0.5 + Math.random() * 0.5));
      opts.onRetry?.({ attempt, waitMs, error: err });
      await sleep(waitMs);
    }
  }
  throw lastError;
}

/** Classify an HTTP status into retryable / not. 408 and 429 are retryable, 4xx otherwise not. */
export function statusIsRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Parse a Retry-After header (seconds, or an HTTP date) into ms. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}
