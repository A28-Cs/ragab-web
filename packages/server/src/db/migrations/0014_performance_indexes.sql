-- Add missing performance indexes

-- 1. Product attribute values (for filtering)
CREATE INDEX IF NOT EXISTS "product_attr_values_search_idx" ON "product_attribute_values" USING btree ("attribute_id","value_ar","value_en");

-- 2. Products price (for sorting)
CREATE INDEX IF NOT EXISTS "products_price_idx" ON "products" USING btree ("price_minor");

-- 3. Products brand (for brand filter)
CREATE INDEX IF NOT EXISTS "products_brand_idx" ON "products" USING btree ("brand_ar","brand_en");

-- 4. Products storefront visibility composite (for count queries)
CREATE INDEX IF NOT EXISTS "products_visibility_idx" ON "products" USING btree ("store_id","is_active","is_visible") WHERE "deleted_at" IS NULL;

-- 5. Stock movements reference (for tracking reservations/orders)
CREATE INDEX IF NOT EXISTS "stock_movements_ref_idx" ON "stock_movements" USING btree ("reference_type","reference_id");
