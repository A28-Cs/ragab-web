-- 0006_delivery_zones — delivery zones become the pricing source of truth (AC-14).
--   * addresses.zone_id  → FK to delivery_zones (SET NULL on hard delete); backfilled by
--                          matching the free-text village to a zone name (with/without the
--                          "قرية/مدينة/مركز/كفر" prefix), so existing customers keep working.
--   * delivery_zones     → admin ordering (sort_order) and soft delete (deleted_at) so a
--                          zone that has been used by orders is never hard-deleted.
-- Additive & idempotent.
--
-- Rollback (manual):
--   ALTER TABLE addresses DROP COLUMN IF EXISTS zone_id;
--   ALTER TABLE delivery_zones DROP COLUMN IF EXISTS sort_order, DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
--> statement-breakpoint
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS zone_id text REFERENCES delivery_zones(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS addresses_zone_idx ON addresses (zone_id);
--> statement-breakpoint
UPDATE addresses a
SET zone_id = z.id
FROM delivery_zones z
WHERE a.zone_id IS NULL
  AND z.deleted_at IS NULL
  AND (
    btrim(a.village) = z.name_ar
    OR lower(btrim(a.village)) = lower(z.name_en)
    OR regexp_replace(btrim(a.village), '^(قرية|مدينة|مركز|كفر)\s+', '') = regexp_replace(z.name_ar, '^(قرية|مدينة|مركز|كفر)\s+', '')
  );
