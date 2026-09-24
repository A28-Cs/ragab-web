/**
 * Shipping (§21). Addresses are reusable customer records; orders embed an immutable
 * snapshot (in orders.ts). Delivery zones seeded from the store's supported villages.
 */
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { DEFAULT_STORE_ID } from './system';
import { users } from './identity';

export const addresses = pgTable(
  'addresses',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    label: text('label'), // home | work | other
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    village: text('village').notNull(),
    streetAddress: text('street_address').notNull(),
    landmark: text('landmark'),
    notes: text('notes'),
    isDefault: boolean('is_default').notNull().default(false),
    /** The delivery zone this address resolves to — the fee source (AC-14). Null for legacy free-text villages. */
    zoneId: text('zone_id').references(() => deliveryZones.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('addresses_user_idx').on(t.userId), index('addresses_zone_idx').on(t.zoneId)],
);

export const deliveryZones = pgTable('delivery_zones', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull(),
  minOrderMinor: bigint('min_order_minor', { mode: 'number' }).notNull().default(0),
  estimatedTimeAr: text('estimated_time_ar').notNull().default(''),
  estimatedTimeEn: text('estimated_time_en').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  /** Admin ordering in pickers. */
  sortOrder: integer('sort_order').notNull().default(0),
  /** Soft delete — zones referenced by addresses/orders are hidden, never destroyed. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const shippingMethods = pgTable('shipping_methods', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  baseFeeMinor: bigint('base_fee_minor', { mode: 'number' }).notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending',
  'assigned',
  'out_for_delivery',
  'delivered',
  'failed',
]);

export const shipments = pgTable(
  'shipments',
  {
    id: primaryId(),
    orderId: text('order_id').notNull(),
    zoneId: text('zone_id'),
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    status: shipmentStatusEnum('status').notNull().default('pending'),
    estimatedDelivery: text('estimated_delivery'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('shipments_order_idx').on(t.orderId)],
);

export const shipmentEvents = pgTable(
  'shipment_events',
  {
    id: primaryId(),
    shipmentId: text('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    status: shipmentStatusEnum('status').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shipment_events_shipment_idx').on(t.shipmentId)],
);
