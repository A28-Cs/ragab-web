-- 0010_hardening — invariants the code assumed but the schema never enforced:
--   * one ACTIVE cart per user (duplicates → the newest stays, the rest become `abandoned`)
--   * one device_tokens row per (user, device): a rotated FCM token replaces the old row
--     instead of leaving a dead one behind (dedupe keeps the most recently seen)
--   * orders.manual / orders.refunded are real booleans, not 'true'/'false' text
-- Idempotent.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS carts_user_active_uidx;
--   DROP INDEX IF EXISTS device_tokens_user_device_uidx;
--   ALTER TABLE orders ALTER COLUMN manual TYPE text USING (CASE WHEN manual THEN 'true' ELSE 'false' END),
--                      ALTER COLUMN refunded TYPE text USING (CASE WHEN refunded THEN 'true' ELSE 'false' END);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
  FROM carts
  WHERE status = 'active' AND user_id IS NOT NULL
)
UPDATE carts SET status = 'abandoned' WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS carts_user_active_uidx ON carts (user_id) WHERE status = 'active' AND user_id IS NOT NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, device_id ORDER BY last_seen_at DESC, created_at DESC, id DESC) AS rn
  FROM device_tokens
  WHERE device_id IS NOT NULL
)
DELETE FROM device_tokens WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_user_device_uidx ON device_tokens (user_id, device_id) WHERE device_id IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'manual') = 'text' THEN
    ALTER TABLE orders
      ALTER COLUMN manual DROP DEFAULT,
      ALTER COLUMN manual TYPE boolean USING (manual = 'true'),
      ALTER COLUMN manual SET DEFAULT false;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'refunded') = 'text' THEN
    ALTER TABLE orders
      ALTER COLUMN refunded DROP DEFAULT,
      ALTER COLUMN refunded TYPE boolean USING (refunded = 'true'),
      ALTER COLUMN refunded SET DEFAULT false;
  END IF;
END $$;
