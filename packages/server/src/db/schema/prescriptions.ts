import { jsonb, pgEnum, pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { users } from './identity';

export const prescriptionStatusEnum = pgEnum('prescription_status', [
  'pending',
  'reviewed',
  'completed',
  'rejected',
]);

export const prescriptions = pgTable(
  'prescriptions',
  {
    id: primaryId(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    imageUrl: text('image_url').notNull(),
    notes: text('notes'),
    status: prescriptionStatusEnum('status').notNull().default('pending'),
    items: jsonb('items').notNull().default([]),
    pharmacistNotes: text('pharmacist_notes'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    cartUpdated: boolean('cart_updated').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('prescriptions_user_idx').on(t.userId),
    index('prescriptions_status_idx').on(t.status),
    index('prescriptions_created_idx').on(t.createdAt),
  ]
);
