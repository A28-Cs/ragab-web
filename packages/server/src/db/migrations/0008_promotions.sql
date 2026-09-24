-- 0008_promotions — ONE rules-based promotion engine (owner decision): the `coupons` table
-- becomes the promotion entity. A promotion is either automatic (applies by itself) or
-- unlocked by a code; it discounts a product, a category or the whole cart (%, fixed,
-- free delivery, free gift above a threshold), can carry banner copy for the home/offers
-- pages, and is limited by dates / usage / per-user counts. The long-built
-- promotion_products / promotion_categories link tables are finally read.
-- Existing `offers` banners are migrated as automatic zero-discount promotions with
-- `show_banner`, so the storefront keeps its banners and the admin sets a real rule when
-- ready. The `offers` table is left untouched for rollback. Idempotent.
--
-- Rollback (manual): storefront/admin read `offers` again; DROP the added columns;
-- restore coupons_code_uidx as a plain unique index and code NOT NULL.

ALTER TYPE coupon_type ADD VALUE IF NOT EXISTS 'free_gift';
--> statement-breakpoint
ALTER TABLE coupons ALTER COLUMN code DROP NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS coupons_code_uidx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uidx ON coupons (store_id, code) WHERE code IS NOT NULL;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'code';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'cart';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS gift_product_id text;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title_ar text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title_en text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS subtitle_ar text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS subtitle_en text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS badge_ar text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS badge_en text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS image_url text;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'gold';
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS show_banner boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS slug text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS coupons_slug_uidx ON coupons (store_id, slug) WHERE slug IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS coupons_active_kind_idx ON coupons (store_id, is_active, kind);
--> statement-breakpoint
INSERT INTO coupons (id, store_id, code, type, value, min_order_minor, per_user_limit, is_active, kind, scope,
                     title_ar, title_en, subtitle_ar, subtitle_en, badge_ar, badge_en, theme, show_banner, sort_order, slug, expires_at)
SELECT 'promo_' || o.id, o.store_id, NULL, 'percentage', 0, 0, 0, o.is_active, 'automatic',
       CASE WHEN o.product_id IS NOT NULL THEN 'product' WHEN o.category_id IS NOT NULL THEN 'category' ELSE 'cart' END,
       o.title_ar, o.title_en, o.subtitle_ar, o.subtitle_en, o.discount_badge_ar, o.discount_badge_en, o.theme, true, o.sort_order, o.slug,
       CASE WHEN o.expiry_date IS NOT NULL AND o.expiry_date <> '' THEN (o.expiry_date::date + interval '1 day') ELSE NULL END
FROM offers o
WHERE NOT EXISTS (SELECT 1 FROM coupons c WHERE c.id = 'promo_' || o.id)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO promotion_products (coupon_id, product_id)
SELECT 'promo_' || o.id, o.product_id FROM offers o WHERE o.product_id IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO promotion_categories (coupon_id, category_id)
SELECT 'promo_' || o.id, o.category_id FROM offers o WHERE o.category_id IS NOT NULL
ON CONFLICT DO NOTHING;
