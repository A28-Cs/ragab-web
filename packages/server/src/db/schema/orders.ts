/**
 * Orders (§6, §28). Key changes vs the prototype:
 *  - orders.userId FK replaces phone-string scoping.
 *  - Money in minor units, with a CHECK that total = subtotal + delivery + tax - discount.
 *  - deliveryAddress stored as an immutable snapshot (columns), re-embedded in the response.
 *  - order_items keep denormalized name/unit/price snapshots (historical immutability).
 *  - THREE status fields: public `status` (5 values the UI knows) + payment_status +
 *    fulfillment_status for the richer lifecycle, exposed as additive optional fields.
 *  - order_status_history is append-only (trigger blocks UPDATE/DELETE).
 */
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  fulfillmentStatusEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  primaryId,
  timestamps,
  versionColumn,
} from './_shared';
import { DEFAULT_STORE_ID } from './system';
import { users } from './identity';

export const orders = pgTable(
  'orders',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    orderNumber: text('order_number').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: orderStatusEnum('status').notNull().default('pending'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    fulfillmentStatus: fulfillmentStatusEnum('fulfillment_status').notNull().default('unfulfilled'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    currency: text('currency').notNull().default('EGP'),
    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
    deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(0),
    taxMinor: bigint('tax_minor', { mode: 'number' }).notNull().default(0),
    discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull(),
    couponCode: text('coupon_code'),
    /** Immutable delivery snapshot (§28). Address may later change; the order does not. */
    deliveryAddress: jsonb('delivery_address').notNull(),
    estimatedDelivery: text('estimated_delivery').notNull().default(''),
    notes: text('notes'),
    manual: boolean('manual').notNull().default(false),
    refunded: boolean('refunded').notNull().default(false),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    ...versionColumn,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orders_number_uidx').on(t.orderNumber),
    index('orders_user_created_idx').on(t.userId, t.createdAt),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_payment_status_idx').on(t.paymentStatus),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id'),
    variantId: text('variant_id'),
    /** Denormalized snapshots — never re-read from the catalog. */
    productNameAr: text('product_name_ar').notNull(),
    productNameEn: text('product_name_en'),
    unit: text('unit').notNull(),
    image: text('image').notNull().default(''),
    quantity: integer('quantity').notNull(),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull(),
    ...timestamps,
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

/** Append-only status history (§6). Trigger blocks UPDATE/DELETE. */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    kind: text('kind').notNull().default('order'), // order | payment | fulfillment
    actorId: text('actor_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId, t.createdAt)],
);

export const orderNotes = pgTable(
  'order_notes',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    authorId: text('author_id'),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    isInternal: text('is_internal').notNull().default('true'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_notes_order_idx').on(t.orderId)],
);

export const returnStatusEnum = pgEnum('return_status', [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
]);

export const returns = pgTable(
  'returns',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: returnStatusEnum('status').notNull().default('requested'),
    reason: text('reason'),
    actorId: text('actor_id'),
    ...timestamps,
  },
  (t) => [index('returns_order_idx').on(t.orderId)],
);

export const returnItems = pgTable('return_items', {
  id: primaryId(),
  returnId: text('return_id')
    .notNull()
    .references(() => returns.id, { onDelete: 'cascade' }),
  orderItemId: text('order_item_id').notNull(),
  quantity: integer('quantity').notNull(),
  ...timestamps,
});
