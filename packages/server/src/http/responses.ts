/**
 * Response envelopes (§13). One consistent shape for success and error. Error bodies
 * expose ONLY a stable code, a safe bilingual message, the requestId, and optional
 * safe details — never a stack trace or internal message (§36).
 */
import { AppError, GENERIC_INTERNAL_MESSAGE, isAppError } from '../lib/errors';
import { logger } from '../lib/logger';

export interface SuccessBody<T> {
  success: true;
  data: T;
  requestId: string;
  meta?: Record<string, unknown>;
}

export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: { ar: string; en: string };
    requestId: string;
    details?: unknown;
  };
}

export function successBody<T>(data: T, requestId: string, meta?: Record<string, unknown>): SuccessBody<T> {
  return { success: true, data, requestId, ...(meta ? { meta } : {}) };
}

export interface MappedError {
  status: number;
  body: ErrorBody;
  headers?: Record<string, string>;
}

/**
 * Map any thrown value to a safe HTTP error. Operational AppErrors surface their code
 * and message; anything else becomes a generic 500 with the details confined to logs.
 */
export function mapError(err: unknown, requestId: string): MappedError {
  if (isAppError(err) && err.isOperational) {
    const headers: Record<string, string> = {};
    // RateLimitError carries a retry hint.
    const retry = (err as AppError & { retryAfterSeconds?: number }).retryAfterSeconds;
    if (typeof retry === 'number') headers['Retry-After'] = String(retry);
    return {
      status: err.httpStatus,
      headers,
      body: {
        success: false,
        error: {
          code: err.code,
          message: err.bilingual,
          requestId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }

  // Unexpected — log full detail, return opaque body.
  logger().error({ err, requestId }, 'unhandled error in request');
  return {
    status: 500,
    body: {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: GENERIC_INTERNAL_MESSAGE, requestId },
    },
  };
}
