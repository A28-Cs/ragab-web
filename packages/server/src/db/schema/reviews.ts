/** Product reviews. One review per user per product; media optional. */
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { users } from './identity';
import { products } from './catalog';

export const reviews = pgTable(
  'reviews',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body'),
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    isApproved: boolean('is_approved').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('reviews_user_product_uidx').on(t.userId, t.productId),
    index('reviews_product_idx').on(t.productId),
  ],
);

export const reviewMedia = pgTable('review_media', {
  id: primaryId(),
  reviewId: text('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
