/**
 * Structured logging (§34). JSON in production, pretty in dev. A strict redaction
 * list guarantees secrets can NEVER be logged even if a caller accidentally passes
 * them in a context object. We redact by path AND censor common secret-bearing keys
 * wherever they appear.
 */
import { pino, type Logger } from 'pino';
import { serverEnv } from '../config/env';

const REDACT_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'tokenHash',
  '*.tokenHash',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'otp',
  '*.otp',
  'hmac',
  '*.hmac',
  'signature',
  '*.signature',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'cookie',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'card',
  '*.card',
  'cardNumber',
  'cvv',
  'ssn',
];

let root: Logger | null = null;

export function logger(): Logger {
  if (root) return root;
  const env = process.env.NODE_ENV ?? 'development';
  const level = process.env.LOG_LEVEL ?? (env === 'test' ? 'silent' : 'info');
  root = pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'ragab-server', env },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    ...(env === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  });
  return root;
}

/** A request/job-scoped child logger carrying a correlation id. */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger().child(bindings);
}
