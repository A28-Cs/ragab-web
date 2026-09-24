-- 0012_catalog_import — supports the HyperOne catalog import (§catalog import). Three
-- independent, additive changes:
--
--   1. products.tags joins the search vector at weight B, and gets its own GIN index. Tags
--      are the classifier's home for the owner's ~590 product-type bullets that did not
--      become their own category rows; without this they were written but unsearchable.
--   2. categories.parent_id gets a real FK. It had none before (only an index) — the two-level
--      rule was enforced solely in application code (modules/catalog/service.ts
--      validateParentId). This does not change that: it makes an ORPHAN parent_id impossible
--      at the database level too, on top of the existing service check.
--   3. promotion_categories.category_id gets a real FK. It had none before, so deleting or
--      renaming a category could silently orphan a promotion's scope. Verified zero orphan
--      rows exist before adding it (all 71 current rows point at cat_dairy / cat_beverages /
--      cat_groceries, all retained by the import).
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS throughout, safe to re-run.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS products_tags_gin_idx;
--   ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_parent_fk;
--   ALTER TABLE promotion_categories DROP CONSTRAINT IF EXISTS promotion_categories_category_fk;
--   Revert products_search_vector_update to the 0001_integrity.sql definition (drop the tags
--   line), then re-fire it: UPDATE products SET updated_at = updated_at;

CREATE OR REPLACE FUNCTION "products_search_vector_update"() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
      setweight(to_tsvector('simple', coalesce(NEW."name_ar", '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW."name_en", '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW."brand_ar", '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW."brand_en", '')), 'B')
    || setweight(to_tsvector('simple', array_to_string(NEW."tags", ' ')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW."description_ar", '')), 'C')
    || setweight(to_tsvector('simple', coalesce(NEW."description_en", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_tags_gin_idx" ON "products" USING gin ("tags");
--> statement-breakpoint

-- Backfill: re-fire the BEFORE UPDATE trigger for every existing row so search_vector picks
-- up tags immediately, without waiting for the next unrelated write.
UPDATE "products" SET "updated_at" = "updated_at";
--> statement-breakpoint

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parent_fk"
  FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "promotion_categories"
  ADD CONSTRAINT "promotion_categories_category_fk"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;
--> statement-breakpoint

ANALYZE "products";
--> statement-breakpoint
ANALYZE "categories";
