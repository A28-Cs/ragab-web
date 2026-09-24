-- Generalizes the "قطعة واحدة" (single-piece) purchasing option from the
-- bakery-cakes-only script (add-bakery-single-piece-variants.sql) to every
-- multi-piece pack in the categories the owner approved on 2026-09-14 as
-- making retail sense to sell loose:
--
--   المشروبات الساخنة (hot drinks/tea), البسكويت (biscuits), الجبن (cheese),
--   الخبز (bread), الحلوى (candy), المخبوزات الجاهزة (ready-made bakery),
--   البيض (eggs), الشوكولاتة (chocolate), المكسرات والتسالي (nuts/snacks),
--   الفاكهة (fruit), الزبادي (yoghurt), الخضروات (vegetables)
--
-- Deliberately excluded (same survey, same session): الحفاضات, المناديل
-- الورقية, الدواجن/اللحوم المجمدة (sealed/frozen — can't be sold loose),
-- العناية النسائية/بالطفل/الاستحمام/الحلاقة/الأسنان (personal care), أدوات
-- المطبخ/الكتابة/المكتبية/التقديم/التنظيف/السفرة, الأكياس, ورق الاستخدام
-- المنزلي, المنتجات الورقية الأخرى, حفظ وتخزين الطعام, الكهرباء, أغذية
-- الحيوانات — non-food or sealed/hygiene items where "buy 1 loose piece"
-- either doesn't apply or isn't a real retail practice.
--
-- Same rules as the bakery-cakes script (see it for the full rationale):
--   * price      = ceil((boxPrice / pieceCount) * 1.2 * 2) / 2 — 20% premium
--                  over the box's per-piece cost, rounded up to the nearest
--                  0.50 EGP, computed LIVE from each product's current price.
--   * stock      = box's current quantity_on_hand × pack size (one-time seed,
--                  NOT a live link — the two variants have independent
--                  inventory rows in this schema).
--   * idempotent = a product that already has a unit_value = 1 variant is
--                  skipped; re-running only tops up stock still at 0/0 for
--                  variants this script already inserted.
--
-- Unlike the bakery script, the target list here is DATA-DRIVEN (any product
-- in these 12 categories matching the pattern), not a fixed id list — so a
-- new product added later to one of these categories is picked up by a
-- future re-run automatically.
--
-- HOW TO RUN (production): same as the bakery script — take a backup first,
-- then `psql "$PRODUCTION_DATABASE_URL" -f add-piece-variants-food-categories.sql`
-- (or paste into the Neon SQL Editor). Review the final SELECT.

BEGIN;

WITH target_categories(category_id) AS (
  VALUES
    ('cat_bev_hot'),         -- المشروبات الساخنة
    ('cat_conf_biscuits'),   -- البسكويت
    ('cat_dairy_cheese'),    -- الجبن
    ('cat_bakery_bread'),    -- الخبز
    ('cat_conf_candy'),      -- الحلوى
    ('cat_bakery_pastries'), -- المخبوزات الجاهزة
    ('cat_dairy_eggs'),      -- البيض
    ('cat_conf_chocolate'),  -- الشوكولاتة
    ('cat_snacks_nuts'),     -- المكسرات والتسالي
    ('cat_fresh_fruit'),     -- الفاكهة
    ('cat_dairy_yoghurt'),   -- الزبادي
    ('cat_fresh_veg')        -- الخضروات
),
targets AS (
  SELECT p.id AS product_id
  FROM products p
  WHERE p.category_id IN (SELECT category_id FROM target_categories)
    AND p.is_active AND p.is_visible AND p.deleted_at IS NULL
    AND p.unit_measure = 'pc'
    AND p.unit_value > 1
),
default_variant AS (
  -- The product's current box/pack variant — price, pack size, and current
  -- box stock are all read from here LIVE, not from a hardcoded snapshot value.
  SELECT DISTINCT ON (v.product_id)
    v.product_id,
    v.id            AS box_variant_id,
    v.sku           AS box_sku,
    v.price_minor   AS box_price_minor,
    v.unit_value    AS pack_size,
    COALESCE(bi.quantity_on_hand, 0) AS box_qty_on_hand
  FROM product_variants v
  JOIN targets t ON t.product_id = v.product_id
  LEFT JOIN inventory_items bi ON bi.variant_id = v.id
  WHERE v.is_active
  ORDER BY v.product_id, v.is_default DESC, v.sort_order ASC
),
already_has_piece AS (
  SELECT DISTINCT product_id
  FROM product_variants
  WHERE product_id IN (SELECT product_id FROM targets)
    AND unit_value = 1
    AND is_active
),
new_variants AS (
  SELECT
    dv.product_id,
    'var_' || dv.product_id || '_pc1'                                      AS variant_id,
    dv.box_sku || '-PC1'                                                    AS sku,
    ROUND(
      CEIL(
        (dv.box_price_minor::numeric / dv.pack_size / 100) * 1.2 * 2
      ) / 2 * 100
    )::bigint                                                               AS piece_price_minor,
    dv.box_qty_on_hand * dv.pack_size                                       AS piece_opening_stock
  FROM default_variant dv
  WHERE dv.pack_size IS NOT NULL
    AND dv.pack_size > 1
    AND dv.product_id NOT IN (SELECT product_id FROM already_has_piece)
),
inserted_variants AS (
  INSERT INTO product_variants
    (id, product_id, sku, name_ar, name_en, price_minor, old_price_minor,
     unit_ar, unit_en, unit_value, unit_measure, is_active, is_default, sort_order)
  SELECT
    nv.variant_id, nv.product_id, nv.sku, 'قطعة واحدة', '1 pc',
    nv.piece_price_minor, NULL,
    'قطعة', 'pc', 1, 'pc', true, false, 1
  FROM new_variants nv
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, product_id, sku, price_minor
)
INSERT INTO inventory_items
  (id, product_id, variant_id, warehouse_id, quantity_on_hand, quantity_reserved)
SELECT
  'inv_' || iv.id, iv.product_id, iv.id, 'wh_default', nv.piece_opening_stock, 0
FROM inserted_variants iv
JOIN new_variants nv ON nv.product_id = iv.product_id
ON CONFLICT (variant_id, warehouse_id) DO NOTHING;

-- Top up: for a piece variant this script already inserted in an earlier run,
-- (re)compute its stock from the box's CURRENT count — only while still at
-- the untouched 0/0 state, so a quantity someone has since corrected by hand
-- is never overwritten.
WITH target_categories(category_id) AS (
  VALUES
    ('cat_bev_hot'), ('cat_conf_biscuits'), ('cat_dairy_cheese'), ('cat_bakery_bread'),
    ('cat_conf_candy'), ('cat_bakery_pastries'), ('cat_dairy_eggs'), ('cat_conf_chocolate'),
    ('cat_snacks_nuts'), ('cat_fresh_fruit'), ('cat_dairy_yoghurt'), ('cat_fresh_veg')
),
box AS (
  SELECT
    v.product_id,
    v.unit_value                      AS pack_size,
    COALESCE(bi.quantity_on_hand, 0)  AS box_qty_on_hand
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  JOIN inventory_items bi ON bi.variant_id = v.id
  WHERE v.is_default
    AND p.category_id IN (SELECT category_id FROM target_categories)
)
UPDATE inventory_items ii
SET quantity_on_hand = box.box_qty_on_hand * box.pack_size
FROM product_variants pv
JOIN box ON box.product_id = pv.product_id
WHERE ii.variant_id = pv.id
  AND pv.sku LIKE '%-PC1'
  AND ii.quantity_on_hand = 0
  AND ii.quantity_reserved = 0;

-- Verify: one row per product that now has (or already had) the new variant.
SELECT
  c.name_ar                      AS category,
  p.name_ar                      AS product,
  v.sku,
  v.price_minor::numeric / 100   AS piece_price_egp,
  i.quantity_on_hand
FROM product_variants v
JOIN products p ON p.id = v.product_id
JOIN categories c ON c.id = p.category_id
LEFT JOIN inventory_items i ON i.variant_id = v.id
WHERE v.sku LIKE '%-PC1'
  AND p.category_id IN (
    'cat_bev_hot','cat_conf_biscuits','cat_dairy_cheese','cat_bakery_bread',
    'cat_conf_candy','cat_bakery_pastries','cat_dairy_eggs','cat_conf_chocolate',
    'cat_snacks_nuts','cat_fresh_fruit','cat_dairy_yoghurt','cat_fresh_veg'
  )
ORDER BY c.name_ar, p.name_ar;

COMMIT;
