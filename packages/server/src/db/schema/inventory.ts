/**
 * Inventory (§7). The overselling defense lives HERE, in the DB (§4):
 *   CHECK (quantity_on_hand >= 0)
 *   CHECK (quantity_reserved >= 0)
 *   CHECK (quantity_on_hand >= quantity_reserved)
 * (declared in the migration). Available = on_hand - reserved. Every quantity change
 * appends an immutable stock_movements row, so on-hand is always reconstructible.
 */
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, stockMovementTypeEnum, timestamps, versionColumn } from './_shared';
import { DEFAULT_STORE_ID } from './system';
import { products } from './catalog';

export const warehouses = pgTable('warehouses', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  isDefault: text('is_default').notNull().default('false'),
  ...timestamps,
});

export const DEFAULT_WAREHOUSE_ID = 'wh_default';

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: text('warehouse_id').notNull().default(DEFAULT_WAREHOUSE_ID),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    quantityReserved: integer('quantity_reserved').notNull().default(0),
    /** The stocked unit (migration 0007). FK to product_variants lives in SQL (ON DELETE CASCADE). */
    variantId: text('variant_id').notNull(),
    ...versionColumn,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('inventory_items_variant_wh_uidx').on(t.variantId, t.warehouseId),
    index('inventory_items_product_idx').on(t.productId),
  ],
);

/** Append-only ledger of every stock change. Never updated or deleted. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: text('warehouse_id').notNull().default(DEFAULT_WAREHOUSE_ID),
    variantId: text('variant_id'),
    type: stockMovementTypeEnum('type').notNull(),
    /** Signed delta applied to on-hand (negative = out). */
    quantityDelta: integer('quantity_delta').notNull(),
    reason: text('reason'),
    /** Correlation: order id, adjustment id, reservation id, etc. */
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    actorId: text('actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
    index('stock_movements_ref_idx').on(t.referenceType, t.referenceId),
  ],
);

export const reservationStatusEnum = pgEnum(
  'reservation_status',
  ['held', 'committed', 'released', 'expired'],
);

export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: text('warehouse_id').notNull().default(DEFAULT_WAREHOUSE_ID),
    variantId: text('variant_id'),
    orderId: text('order_id'),
    cartId: text('cart_id'),
    quantity: integer('quantity').notNull(),
    status: reservationStatusEnum('status').notNull().default('held'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('stock_reservations_order_idx').on(t.orderId),
    index('stock_reservations_expiry_idx').on(t.expiresAt),
  ],
);

export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    warehouseId: text('warehouse_id').notNull().default(DEFAULT_WAREHOUSE_ID),
    variantId: text('variant_id'),
    previousQuantity: integer('previous_quantity').notNull(),
    newQuantity: integer('new_quantity').notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id'),
    ...timestamps,
  },
  (t) => [index('inventory_adjustments_product_idx').on(t.productId)],
);
