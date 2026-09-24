/**
 * Identity (§9, §10). Customers and staff are the same `users` entity (the frontend
 * User type carries optional staff fields). Passwords are Argon2id hashes only —
 * never plaintext, never reversible (§9). Sessions are opaque; only the SHA-256 hash
 * of the token is stored, so a DB leak cannot resurrect a live session.
 */
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { accountStatusEnum, primaryId, timestamps } from './_shared';
import { DEFAULT_STORE_ID } from './system';

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    passwordHash: text('password_hash'),
    defaultVillage: text('default_village').notNull().default(''),
    avatar: text('avatar'),
    /** Optional photo of the customer's house, so couriers can find it (§ profile). */
    houseImage: text('house_image'),
    dateOfBirth: text('date_of_birth'),
    preferredLanguage: text('preferred_language').notNull().default('ar'),
    status: accountStatusEnum('status').notNull().default('pending_verification'),
    emailVerified: boolean('email_verified').notNull().default(false),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    /** Staff-only: FK to roles. Null for pure customers. */
    roleId: text('role_id'),
    isStaff: boolean('is_staff').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_phone_uidx').on(t.storeId, t.phone),
    uniqueIndex('users_email_uidx').on(t.email),
    index('users_role_idx').on(t.roleId),
  ],
);

/** Customer profile data kept separate from identity (§30) so anonymization is surgical. */
export const profiles = pgTable('profiles', {
  id: primaryId(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  totalSpentMinor: text('total_spent_minor').notNull().default('0'),
  ordersCount: text('orders_count').notNull().default('0'),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  ...timestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque token. The raw token is never stored. */
    tokenHash: text('token_hash').notNull(),
    device: text('device').notNull().default('Unknown'),
    deviceType: text('device_type').notNull().default('desktop'),
    browser: text('browser').notNull().default(''),
    approxLocation: text('approx_location'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uidx').on(t.tokenHash),
    index('sessions_user_active_idx').on(t.userId),
  ],
);

export const tokenPurposeEnum = pgEnum('token_purpose', [
  'email_verification',
  'phone_verification',
  'password_reset',
]);

/** Single-use, short-TTL, HASHED verification/reset tokens (§9). */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    /** For OTP flows we also store an attempt counter to throttle brute force. */
    attempts: text('attempts').notNull().default('0'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('verification_tokens_hash_uidx').on(t.tokenHash),
    index('verification_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

/** TOTP secrets for 2FA, stored encrypted-at-rest via app-layer envelope (§9 optional 2FA). */
export const mfaSecrets = pgTable('mfa_secrets', {
  id: primaryId(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  secretEncrypted: text('secret_encrypted').notNull(),
  recoveryCodesHashed: text('recovery_codes_hashed').array(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  ...timestamps,
});

export const loginActivityResultEnum = pgEnum('login_activity_result', ['success', 'failed']);

/** Login attempt history (§10 device tracking, §34). Feeds the account security page. */
export const loginActivity = pgTable(
  'login_activity',
  {
    id: primaryId(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** For failed attempts we also record the attempted identifier hash for throttling analytics. */
    identifier: text('identifier'),
    device: text('device').notNull().default(''),
    browser: text('browser').notNull().default(''),
    approxLocation: text('approx_location'),
    ipAddress: text('ip_address'),
    result: loginActivityResultEnum('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_activity_user_idx').on(t.userId, t.createdAt)],
);
