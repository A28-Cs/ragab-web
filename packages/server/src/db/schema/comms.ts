/**
 * Customer communication (§23). Notifications are bilingual; dispatch is async and
 * respects per-user preferences. email_events records provider callbacks for audit.
 */
import { boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { users } from './identity';

export const notificationCategoryEnum = pgEnum('notification_category', [
  'order',
  'promo',
  'account',
  'security',
  'general',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: notificationCategoryEnum('category').notNull(),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    bodyAr: text('body_ar').notNull(),
    bodyEn: text('body_en').notNull(),
    href: text('href'),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable('notification_preferences', {
  id: primaryId(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  orderEmail: boolean('order_email').notNull().default(true),
  orderSms: boolean('order_sms').notNull().default(true),
  promoEmail: boolean('promo_email').notNull().default(false),
  securityEmail: boolean('security_email').notNull().default(true),
  // Push channel (§24/§26) — added for the mobile app; browsers simply never register a device.
  orderPush: boolean('order_push').notNull().default(true),
  promoPush: boolean('promo_push').notNull().default(false),
  securityPush: boolean('security_push').notNull().default(true),
  ...timestamps,
});

export const emailEvents = pgTable(
  'email_events',
  {
    id: primaryId(),
    userId: text('user_id'),
    toAddress: text('to_address').notNull(),
    template: text('template').notNull(),
    status: text('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_events_user_idx').on(t.userId)],
);
