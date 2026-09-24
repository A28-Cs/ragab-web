-- 0005_payment_integrity — one payment per order, deduped provider references, and a
-- `cancelled` payment state for orders cancelled before any capture. Additive & idempotent.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS payments_order_uidx;
--   DROP INDEX IF EXISTS payments_provider_payment_uidx;
--   DROP INDEX IF EXISTS payment_txns_provider_txn_uidx;
--   -- Postgres cannot drop an enum value; leave 'cancelled' in place (unused rows only).
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'cancelled';
--> statement-breakpoint
-- Collapse any historical duplicate payment rows for the same order before enforcing
-- uniqueness. Keep the row that carries money state (paid/refunded) — else the newest.
DELETE FROM "payments" p
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY (status IN ('paid', 'refunded', 'partially_refunded')) DESC, created_at DESC, id DESC
         ) AS rn
  FROM "payments"
) ranked
WHERE p.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_order_uidx" ON "payments" ("order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_payment_uidx" ON "payments" ("provider_payment_id") WHERE provider_payment_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_txns_provider_txn_uidx" ON "payment_transactions" ("provider_txn_id", "kind") WHERE provider_txn_id IS NOT NULL;
