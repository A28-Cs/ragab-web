/**
 * Environment configuration — validated once, at import time, and never again.
 *
 * Rationale (§33 Secrets, §54 Fail Securely): a missing or malformed secret must
 * crash the process at boot, not surface as an undefined at request time. We split
 * the schema into `server` (never bundled to the client) and `public` so a secret
 * can never leak into the browser bundle. Nothing in this file is logged.
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Secrets and server-only configuration. Importing this from client code is a build error path. */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url().describe('postgres://user:pass@host:5432/db'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  /** 32+ byte high-entropy secrets. Used for session token pepper and CSRF signing. */
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7), // 7d sliding
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30), // 30d cap (browser)
  /** Native (mobile) sessions get a longer absolute cap — re-login on a phone is costly. */
  SESSION_MOBILE_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 90), // 90d cap

  /** Paymob (§17/§18/§20). All optional so the app boots COD-only without them. */
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_SECRET_KEY: z.string().optional(),
  PAYMOB_PUBLIC_KEY: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),
  PAYMOB_BASE_URL: z.string().url().default('https://accept.paymob.com'),
  PAYMOB_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

  /** Object storage (§31). */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('ragab-uploads'),
  S3_PUBLIC_URL: z.string().url().optional(),

  /** Email (§23). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Ragab <no-reply@ragab.sa>'),

  /** Push (§26): FCM HTTP v1 service-account JSON (raw or base64). Absent → push is logged only. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  /** Engezny Integration: Firebase Service Account for direct Firestore sync and Webhook Secret. */
  ENGEZNY_FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  ENGEZNY_WEBHOOK_SECRET: z.string().optional(),

  /** SMS gateway (§23). Absent → SMS is logged only (and phone OTP cannot be delivered). */
  SMS_GATEWAY_KIND: z.enum(['smsmisr', 'generic_json']).optional(),
  SMS_GATEWAY_URL: z.string().url().optional(),
  SMS_GATEWAY_USERNAME: z.string().optional(),
  SMS_GATEWAY_PASSWORD: z.string().optional(),
  SMS_GATEWAY_TOKEN: z.string().optional(),
  SMS_SENDER_ID: z.string().default('Ragab'),

  RATE_LIMIT_ENABLED: bool.default('true'),

  /** Mobile app version gate (§47) served by GET /api/v1/app/config. */
  MOBILE_MIN_SUPPORTED_VERSION: z.string().default('1.0.0'),
  MOBILE_LATEST_VERSION: z.string().default('1.0.0'),
  MOBILE_FORCE_UPDATE: bool.default('false'),

  /** Deep-link association (§25). Empty until the app is registered with the stores. */
  MOBILE_ANDROID_PACKAGE: z.string().default('sa.nextdigital.ragab'),
  MOBILE_ANDROID_SHA256: z.string().default(''), // comma-separated signing-cert SHA-256 fingerprints
  MOBILE_IOS_APP_ID: z.string().default(''), // e.g. TEAMID.sa.nextdigital.ragab
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_BASE_URL: z.string().default('/api/v1'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cached: ServerEnv | null = null;

/**
 * Server env accessor. Lazy so that importing a module for its types (e.g. in the
 * client bundle via a shared package) does not trip the validation. Any code path
 * that actually reads a secret calls this and gets a hard failure if misconfigured.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Intentionally throws with variable NAMES only — never values.
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function publicEnv(): PublicEnv {
  return publicSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
}

export const isProd = () => serverEnv().NODE_ENV === 'production';
export const isTest = () => process.env.NODE_ENV === 'test';
