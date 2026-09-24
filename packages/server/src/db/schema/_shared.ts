/**
 * Shared column helpers and enums. Every table gets a text ULID PK, created_at,
 * updated_at, and (§12 multi-tenancy) a store_id that defaults to the single seeded
 * store so it never needs backfilling if the platform grows to multiple stores.
 */
import { pgEnum, text, timestamp, bigint } from 'drizzle-orm/pg-core';
import { newId } from '../../lib/ids';

export const primaryId = () => text('id').primaryKey().$defaultFn(newId);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Optimistic-locking version column (§4 versioning). Bumped on each write by services. */
export const versionColumn = { version: bigint('version', { mode: 'number' }).notNull().default(0) };

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

// ---- Enums (shared across domains) ----
export const currencyDefault = 'EGP';

export const accountStatusEnum = pgEnum('account_status', [
  'active',
  'suspended',
  'disabled',
  'pending_verification',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'preparing',
  'on_the_way',
  'delivered',
  'cancelled',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'authorized',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
  /** The order was cancelled before any capture — nothing was ever collected. */
  'cancelled',
]);

export const fulfillmentStatusEnum = pgEnum('fulfillment_status', [
  'unfulfilled',
  'processing',
  'ready',
  'out_for_delivery',
  'fulfilled',
  'returned',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['cod', 'vodafone_cash', 'instapay', 'card']);

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'purchase',
  'sale',
  'reservation',
  'reservation_release',
  'adjustment',
  'return',
  'refund_restock',
]);
