/**
 * System tables: the store (tenant root), append-only audit log, idempotency keys,
 * settings, feature flags, integrations.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';

/** Tenant root (§12). One row seeded today; the schema is ready for many. */
export const DEFAULT_STORE_ID = 'store_default';

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  slug: text('slug').notNull().unique(),
  currency: text('currency').notNull().default('EGP'),
  ...timestamps,
});

export const auditResultEnum = pgEnum('audit_result', ['success', 'failure']);

/**
 * Audit log (§35). Append-only: the migration REVOKEs UPDATE/DELETE from the app role
 * and a trigger blocks them. `prevHash`/`entryHash` form a tamper-evident chain.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id'),
    target: text('target'),
    result: auditResultEnum('result').notNull().default('success'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    prevHash: text('prev_hash'),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
    index('audit_logs_resource_idx').on(t.resource, t.resourceId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

/**
 * Idempotency keys (§19). UNIQUE(user, key, scope). `requestHash` distinguishes a
 * genuine retry (same body -> replay stored response) from a key-reuse attack.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: primaryId(),
    userId: text('user_id'),
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull().default('in_progress'), // in_progress | completed
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idempotency_user_key_uidx').on(t.userId, t.key, t.scope),
    index('idempotency_expires_idx').on(t.expiresAt),
  ],
);

export const storeSettings = pgTable('store_settings', {
  id: text('id').primaryKey().default(DEFAULT_STORE_ID),
  storeNameAr: text('store_name_ar').notNull(),
  storeNameEn: text('store_name_en').notNull(),
  phone: text('phone').notNull(),
  whatsapp: text('whatsapp').notNull(),
  addressAr: text('address_ar').notNull(),
  /** Single source of truth for the delivery rule the prototype duplicated 4x. */
  deliveryFeeMinor: bigint('delivery_fee_minor', { mode: 'number' }).notNull().default(1500),
  freeDeliveryThresholdMinor: bigint('free_delivery_threshold_minor', { mode: 'number' })
    .notNull()
    .default(30000),
  workingHours: text('working_hours').notNull().default(''),
  codEnabled: boolean('cod_enabled').notNull().default(true),
  onlinePaymentsEnabled: boolean('online_payments_enabled').notNull().default(true),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  ...timestamps,
});

export const taxSettings = pgTable('tax_settings', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  /** basis points, e.g. 1400 = 14%. Integer, never float. */
  rateBps: integer('rate_bps').notNull().default(0),
  inclusive: boolean('inclusive').notNull().default(true),
  enabled: boolean('enabled').notNull().default(false),
  ...timestamps,
});

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  ...timestamps,
});

export const integrations = pgTable('integrations', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionAr: text('description_ar').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  category: text('category').notNull(), // payment | delivery | analytics | messaging
  enabled: boolean('enabled').notNull().default(false),
  connected: boolean('connected').notNull().default(false),
  ...timestamps,
});

/**
 * Provider credentials (API keys / secrets / tokens) managed from the admin panel.
 * Values are ENCRYPTED at rest (AES-256-GCM, security/crypto). They override the
 * matching env var when present, so the admin can configure integrations without a
 * redeploy. Full values are NEVER returned to the client — only masked status.
 */
export const providerCredentials = pgTable(
  'provider_credentials',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    provider: text('provider').notNull(), // paymob | smtp | s3 | sms
    keyName: text('key_name').notNull(), // e.g. PAYMOB_SECRET_KEY
    valueEncrypted: text('value_encrypted').notNull(),
    updatedBy: text('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('provider_credentials_uidx').on(t.storeId, t.provider, t.keyName)],
);
