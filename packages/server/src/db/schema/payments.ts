/**
 * Payments (§17-§20). No card data ever stored (§18). The provider owns sensitive
 * details; we keep references and status only. Webhook events are deduped by a
 * UNIQUE(provider, provider_event_id) constraint — the DB, not app logic, prevents
 * double-processing (§20). Refunds cannot exceed the payment (trigger in migration).
 */
import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { paymentMethodEnum, paymentStatusEnum, primaryId, timestamps, versionColumn } from './_shared';
import { orders } from './orders';

export const paymentProviderEnum = pgEnum('payment_provider', ['cod', 'paymob', 'manual_transfer']);

export const intentStatusEnum = pgEnum('payment_intent_status', [
  'created',
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
]);

/** A payment intent — created after the order commits, before provider redirect (§21). */
export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: paymentProviderEnum('provider').notNull(),
    method: paymentMethodEnum('method').notNull(),
    status: intentStatusEnum('status').notNull().default('created'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('EGP'),
    /** Provider-side reference (Paymob intention id / client secret ref). No secrets. */
    providerIntentId: text('provider_intent_id'),
    providerClientSecret: text('provider_client_secret'),
    /** Idempotency: one active intent per order+provider. */
    idempotencyKey: text('idempotency_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...versionColumn,
    ...timestamps,
  },
  (t) => [
    index('payment_intents_order_idx').on(t.orderId),
    index('payment_intents_provider_ref_idx').on(t.providerIntentId),
    uniqueIndex('payment_intents_idem_uidx').on(t.idempotencyKey),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    intentId: text('intent_id').references(() => paymentIntents.id, { onDelete: 'set null' }),
    provider: paymentProviderEnum('provider').notNull(),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    /** Sum of successful refunds; maintained transactionally, capped by trigger. */
    refundedMinor: bigint('refunded_minor', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('EGP'),
    providerPaymentId: text('provider_payment_id'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    ...versionColumn,
    ...timestamps,
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    index('payments_provider_ref_idx').on(t.providerPaymentId),
    /** Exactly one payment per order — a retried initPayment can never create a second. */
    uniqueIndex('payments_order_uidx').on(t.orderId),
    /** A provider transaction id maps to at most one payment (replayed captures dedupe). */
    uniqueIndex('payments_provider_payment_uidx').on(t.providerPaymentId).where(sql`provider_payment_id IS NOT NULL`),
  ],
);

/** Granular provider transactions (auth, capture, refund) for reconciliation. */
export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: primaryId(),
    paymentId: text('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
    orderId: text('order_id'),
    kind: text('kind').notNull(), // authorization | capture | refund | void
    status: text('status').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    providerTxnId: text('provider_txn_id'),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_txns_payment_idx').on(t.paymentId),
    /** A replayed provider callback cannot append a second ledger row for the same txn. */
    uniqueIndex('payment_txns_provider_txn_uidx').on(t.providerTxnId, t.kind).where(sql`provider_txn_id IS NOT NULL`),
  ],
);

/** Raw webhook events (§20). UNIQUE(provider, providerEventId) = dedupe by the DB. */
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: primaryId(),
    provider: paymentProviderEnum('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type'),
    signatureVerified: text('signature_verified').notNull().default('false'),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('webhook_events_provider_event_uidx').on(t.provider, t.providerEventId)],
);

export const refunds = pgTable(
  'refunds',
  {
    id: primaryId(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    orderId: text('order_id').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('pending'), // pending | succeeded | failed
    providerRefundId: text('provider_refund_id'),
    actorId: text('actor_id'),
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_order_idx').on(t.orderId),
    uniqueIndex('refunds_idem_uidx').on(t.idempotencyKey),
  ],
);
