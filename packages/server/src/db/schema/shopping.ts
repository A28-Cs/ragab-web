/**
 * Cart & wishlist (§8). Cart is server-authoritative: cart_items store ONLY
 * product_id + quantity, never price. Every read reprices from live product data.
 * A cart is owned by a user OR an anonymous token (merged on login).
 */
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { DEFAULT_STORE_ID } from './system';
import { users } from './identity';
import { products } from './catalog';

export const carts = pgTable(
  'carts',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Anonymous cart token (hashed) for guests, promoted to a user on login. */
    anonymousToken: text('anonymous_token'),
    status: text('status').notNull().default('active'), // active | converted | abandoned
    convertedOrderId: text('converted_order_id'),
    ...timestamps,
  },
  (t) => [
    index('carts_user_idx').on(t.userId),
    uniqueIndex('carts_anon_uidx').on(t.anonymousToken),
    /** One ACTIVE cart per signed-in user — concurrent first requests can't fork the cart. */
    uniqueIndex('carts_user_active_uidx').on(t.userId).where(sql`status = 'active' AND user_id IS NOT NULL`),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: primaryId(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** The stocked unit the line is for (migration 0007) — the line identity is (cart, product, variant). */
    variantId: text('variant_id').notNull(),
    quantity: integer('quantity').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('cart_items_uidx').on(t.cartId, t.productId, t.variantId)],
);

export const wishlists = pgTable('wishlists', {
  id: primaryId(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  ...timestamps,
});

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: primaryId(),
    wishlistId: text('wishlist_id')
      .notNull()
      .references(() => wishlists.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('wishlist_items_uidx').on(t.wishlistId, t.productId)],
);
