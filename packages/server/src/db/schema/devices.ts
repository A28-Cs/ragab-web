/**
 * Push notification device tokens (§26). One row per (user, install). A registration
 * token is globally unique (a device that re-installs or is handed to another user
 * re-registers, moving the row via the unique index on `token`). Logout deletes the
 * row so a signed-out device stops receiving that user's pushes (§26 cleanup).
 */
import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { users } from './identity';

export const devicePlatformEnum = pgEnum('device_platform', ['android', 'ios', 'web']);

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** FCM registration token (APNs is bridged through FCM on iOS). */
    token: text('token').notNull(),
    platform: devicePlatformEnum('platform').notNull(),
    /** Stable per-install id (the client's X-Device-Id), for dedupe/diagnostics. */
    deviceId: text('device_id'),
    appVersion: text('app_version'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('device_tokens_token_uidx').on(t.token),
    index('device_tokens_user_idx').on(t.userId),
    /** One row per install: a rotated token replaces the old row instead of piling up (§26). */
    uniqueIndex('device_tokens_user_device_uidx').on(t.userId, t.deviceId).where(sql`device_id IS NOT NULL`),
  ],
);
