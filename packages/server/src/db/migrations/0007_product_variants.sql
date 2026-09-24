-- 0007_product_variants — a VARIANT (piece / box / weight) becomes the sellable, stocked
-- unit; a product groups its variants. Every existing product gets ONE default variant
-- (id 'var_' || product id) that mirrors its price/unit, so nothing the storefront shows
-- changes for a single-variant product. Inventory, reservations, ledger rows, cart lines
-- and order lines are re-keyed on the variant. Idempotent; runs on a live catalog.
--
-- Rollback (manual): DROP INDEX inventory_items_variant_wh_uidx; recreate
-- inventory_items_product_wh_uidx (product_id, warehouse_id) — valid only while each
-- product still has a single variant; drop the variant_id columns; `cart_items.variant_id`
-- back to NULLable.

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS unit_value real;
--> statement-breakpoint
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS unit_measure text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);
--> statement-breakpoint
INSERT INTO product_variants (id, product_id, sku, name_ar, name_en, price_minor, old_price_minor, unit_ar, unit_en, unit_value, unit_measure, is_active, is_default, sort_order)
SELECT 'var_' || p.id, p.id, p.sku, p.unit_ar, p.unit_en, p.price_minor, p.old_price_minor, p.unit_ar, p.unit_en, p.unit_value, p.unit_measure, true, true, 0
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE product_variants v SET is_default = true
WHERE NOT EXISTS (SELECT 1 FROM product_variants d WHERE d.product_id = v.product_id AND d.is_default)
  AND v.id = (SELECT x.id FROM product_variants x WHERE x.product_id = v.product_id ORDER BY x.sort_order, x.created_at, x.id LIMIT 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_default_uidx ON product_variants (product_id) WHERE is_default;
--> statement-breakpoint
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS variant_id text REFERENCES product_variants(id) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE inventory_items i SET variant_id = d.id FROM product_variants d WHERE i.variant_id IS NULL AND d.product_id = i.product_id AND d.is_default;
--> statement-breakpoint
DELETE FROM inventory_items WHERE variant_id IS NULL;
--> statement-breakpoint
ALTER TABLE inventory_items ALTER COLUMN variant_id SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS inventory_items_product_wh_uidx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_variant_wh_uidx ON inventory_items (variant_id, warehouse_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_items_product_idx ON inventory_items (product_id);
--> statement-breakpoint
ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS variant_id text;
--> statement-breakpoint
UPDATE stock_reservations r SET variant_id = d.id FROM product_variants d WHERE r.variant_id IS NULL AND d.product_id = r.product_id AND d.is_default;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stock_reservations_variant_idx ON stock_reservations (variant_id);
--> statement-breakpoint
-- Ledger tables are append-only (trigger): historical rows keep variant_id NULL, which
-- readers treat as "the product's default variant". New rows always carry it.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS variant_id text;
--> statement-breakpoint
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS variant_id text;
--> statement-breakpoint
UPDATE cart_items c SET variant_id = d.id FROM product_variants d WHERE c.variant_id IS NULL AND d.product_id = c.product_id AND d.is_default;
--> statement-breakpoint
DELETE FROM cart_items WHERE variant_id IS NULL;
--> statement-breakpoint
ALTER TABLE cart_items ALTER COLUMN variant_id SET NOT NULL;
--> statement-breakpoint
UPDATE order_items o SET variant_id = d.id FROM product_variants d WHERE o.variant_id IS NULL AND o.product_id IS NOT NULL AND d.product_id = o.product_id AND d.is_default;
