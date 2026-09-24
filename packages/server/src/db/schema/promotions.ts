/**
 * Promotions (§28 pricing). Coupons validated SERVER-SIDE only. Redemptions are
 * uniquely constrained so a coupon can't be double-spent (§19-adjacent).
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { DEFAULT_STORE_ID } from './system';

export const couponTypeEnum = pgEnum('coupon_type', ['percentage', 'fixed', 'free_delivery', 'free_gift']);

/**
 * THE promotion entity (migration 0008 — one rules engine for offers + coupons). A row is
 * a rule: automatic or unlocked by `code`; discounts a product / category / the cart;
 * %, fixed, free delivery, or a free gift above `min_order_minor`; optionally carries the
 * banner copy shown on the home/offers pages. Redemptions are uniquely constrained per
 * (promotion, order) so nothing is ever applied twice to the same order.
 */
export const coupons = pgTable(
  'coupons',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    /** Null for automatic promotions; unique per store when present. */
    code: text('code'),
    kind: text('kind').notNull().default('code'), // automatic | code
    type: couponTypeEnum('type').notNull(),
    /** percentage: basis points (1000 = 10%). fixed: minor units. free_delivery / free_gift: ignored. */
    value: integer('value').notNull().default(0),
    scope: text('scope').notNull().default('cart'), // cart | category | product
    giftProductId: text('gift_product_id'),
    minOrderMinor: bigint('min_order_minor', { mode: 'number' }).notNull().default(0),
    maxDiscountMinor: bigint('max_discount_minor', { mode: 'number' }),
    usageLimit: integer('usage_limit'),
    /** 0 = unlimited (automatic promotions); codes default to once per customer. */
    perUserLimit: integer('per_user_limit').notNull().default(1),
    usageCount: integer('usage_count').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    /** Banner / display copy (the former `offers` fields live here now). */
    titleAr: text('title_ar').notNull().default(''),
    titleEn: text('title_en').notNull().default(''),
    subtitleAr: text('subtitle_ar').notNull().default(''),
    subtitleEn: text('subtitle_en').notNull().default(''),
    badgeAr: text('badge_ar').notNull().default(''),
    badgeEn: text('badge_en').notNull().default(''),
    imageUrl: text('image_url'),
    theme: text('theme').notNull().default('gold'), // amber | gold | sunset
    showBanner: boolean('show_banner').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    slug: text('slug'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('coupons_code_uidx').on(t.storeId, t.code).where(sql`code IS NOT NULL`),
    uniqueIndex('coupons_slug_uidx').on(t.storeId, t.slug).where(sql`slug IS NOT NULL`),
    index('coupons_active_kind_idx').on(t.storeId, t.isActive, t.kind),
  ],
);

/** Readable alias: the table IS the promotions table. */
export const promotions = coupons;

export const promotionRules = pgTable('promotion_rules', {
  id: primaryId(),
  couponId: text('coupon_id')
    .notNull()
    .references(() => coupons.id, { onDelete: 'cascade' }),
  ruleType: text('rule_type').notNull(),
  config: text('config'),
  ...timestamps,
});

export const promotionProducts = pgTable(
  'promotion_products',
  {
    couponId: text('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
  },
  (t) => [uniqueIndex('promotion_products_uidx').on(t.couponId, t.productId)],
);

export const promotionCategories = pgTable(
  'promotion_categories',
  {
    couponId: text('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').notNull(),
  },
  (t) => [uniqueIndex('promotion_categories_uidx').on(t.couponId, t.categoryId)],
);

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: primaryId(),
    couponId: text('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    orderId: text('order_id').notNull(),
    discountMinor: bigint('discount_minor', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_redemptions_order_uidx').on(t.couponId, t.orderId),
    index('coupon_redemptions_user_idx').on(t.couponId, t.userId),
  ],
);

/** Marketing offer banners (homepage/offers page). Distinct from coupons — these are
 * promotional content, not discount codes. */
export const offers = pgTable(
  'offers',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    slug: text('slug').notNull(),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull().default(''),
    subtitleAr: text('subtitle_ar').notNull().default(''),
    subtitleEn: text('subtitle_en').notNull().default(''),
    discountBadgeAr: text('discount_badge_ar').notNull().default(''),
    discountBadgeEn: text('discount_badge_en').notNull().default(''),
    theme: text('theme').notNull().default('gold'), // amber | gold | sunset
    expiryDate: text('expiry_date'), // 'YYYY-MM-DD'
    productId: text('product_id'),
    categoryId: text('category_id'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('offers_slug_uidx').on(t.storeId, t.slug)],
);
