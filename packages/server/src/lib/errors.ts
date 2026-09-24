/**
 * Error taxonomy (§36). Every failure the client can see is an AppError with a
 * STABLE machine code and a bilingual, human-safe message. Internal diagnostics
 * (cause, stack) are attached but only ever reach logs — never the response body.
 */

export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'business_rule'
  | 'rate_limit'
  | 'external_service'
  | 'internal';

const STATUS_BY_CATEGORY: Record<ErrorCategory, number> = {
  validation: 400,
  authentication: 401,
  authorization: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  rate_limit: 429,
  external_service: 502,
  internal: 500,
};

export interface BilingualMessage {
  ar: string;
  en: string;
}

export interface AppErrorOptions {
  /** Machine-stable code, SCREAMING_SNAKE_CASE, e.g. ORDER_NOT_FOUND. */
  code: string;
  message: BilingualMessage;
  /** Safe, structured details for the client (e.g. Zod field errors). Never secrets. */
  details?: unknown;
  /** Internal only — logged, never serialized to the client. */
  cause?: unknown;
  /** Extra context for logs (ids, counts). Redacted by the logger allowlist. */
  meta?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly httpStatus: number;
  readonly bilingual: BilingualMessage;
  readonly details?: unknown;
  readonly meta?: Record<string, unknown>;
  /** True for AppError — distinguishes an expected, safe-to-surface failure from a bug. */
  readonly isOperational: boolean = true;

  constructor(category: ErrorCategory, opts: AppErrorOptions) {
    super(opts.message.en, { cause: opts.cause });
    this.name = new.target.name;
    this.category = category;
    this.code = opts.code;
    this.httpStatus = STATUS_BY_CATEGORY[category];
    this.bilingual = opts.message;
    this.details = opts.details;
    this.meta = opts.meta;
  }
}

export class ValidationError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('validation', { code: opts.code ?? 'VALIDATION_ERROR', ...opts });
  }
}

export class AuthenticationError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('authentication', { code: opts.code ?? 'UNAUTHENTICATED', ...opts });
  }
}

export class AuthorizationError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('authorization', { code: opts.code ?? 'FORBIDDEN', ...opts });
  }
}

export class NotFoundError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('not_found', { code: opts.code ?? 'NOT_FOUND', ...opts });
  }
}

export class ConflictError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('conflict', { code: opts.code ?? 'CONFLICT', ...opts });
  }
}

export class BusinessRuleError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('business_rule', { code: opts.code ?? 'BUSINESS_RULE_VIOLATION', ...opts });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds?: number;
  constructor(opts: (Omit<AppErrorOptions, 'code'> & { code?: string }) & { retryAfterSeconds?: number }) {
    super('rate_limit', { code: opts.code ?? 'RATE_LIMITED', ...opts });
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

export class ExternalServiceError extends AppError {
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('external_service', { code: opts.code ?? 'EXTERNAL_SERVICE_ERROR', ...opts });
  }
}

export class InternalError extends AppError {
  readonly isOperational = false as const;
  constructor(opts: Omit<AppErrorOptions, 'code'> & { code?: string }) {
    super('internal', { code: opts.code ?? 'INTERNAL_ERROR', ...opts });
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** A generic internal error message used when an unexpected exception is mapped for the client. */
export const GENERIC_INTERNAL_MESSAGE: BilingualMessage = {
  ar: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  en: 'An unexpected error occurred. Please try again.',
};
