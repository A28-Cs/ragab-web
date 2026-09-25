-- 0015_product_popularity — a real sales-rank score for the "popular" sort.
--
-- Until now sortBy=popular ordered by (is_popular DESC, id DESC). No product is curated as
-- popular, so every listing (home department rails, category pages, search) fell through to
-- id order — effectively arbitrary. products.popularity holds the source catalog's
-- purchase_count (written by the Chefaa importer); higher = sold more. The curated
-- is_popular flag still wins over it.
--
-- Additive and backward compatible: code that doesn't know the column ignores it.
-- Idempotent: IF NOT EXISTS throughout, safe to re-run.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS products_popularity_idx;
--   ALTER TABLE products DROP COLUMN IF EXISTS popularity;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "popularity" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_popularity_idx" ON "products" USING btree ("is_popular","popularity","id");
