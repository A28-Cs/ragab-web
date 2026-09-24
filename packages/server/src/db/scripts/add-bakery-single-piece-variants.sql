-- Adds a "قطعة واحدة" (single-piece) purchasing option to the 8 multi-piece
-- bakery/cake packs identified on 2026-09-14, alongside their existing box
-- variant — so a shopper can buy loose pieces instead of a whole box.
--
-- Price rule (owner-approved): single-piece price = ceil((boxPrice / pieceCount)
-- * 1.2 * 2) / 2 — a 20% premium over the box's per-piece cost, rounded up to
-- the nearest 0.50 EGP. Computed LIVE from each product's CURRENT default
-- variant price below (not a price hardcoded from the dev snapshot), so it
-- reflects whatever the box costs in THIS database right now.
--
-- Idempotent: safe to run more than once. A product that already has a
-- single-piece (unit_value = 1) variant is skipped entirely (see the
-- `already_has_piece` filter and the ON CONFLICT guard on the unique sku
-- index).
--
-- Opening stock (owner-specified rule, 2026-09-14): a loose piece "comes
-- from" the boxes already in stock, so the piece variant's starting quantity
-- = the box variant's CURRENT quantity_on_hand × pack size (e.g. 25 boxes of
-- 6 → 150 loose pieces). This is a ONE-TIME seed, not a live link — the two
-- variants have independent inventory rows in this schema (selling a piece
-- does not decrement the box's count or vice versa), so re-adjust either one
-- by hand afterward as real sales/restocks happen. The trailing UPDATE below
-- re-applies this same formula to a piece variant this script already
-- inserted (e.g. an earlier run, before this stock rule existed) — guarded
-- to only touch a row still at its untouched 0/0 state, so it never
-- overwrites a quantity a human has since corrected.
--
-- HOW TO RUN (production):
--   1. Take a backup / confirm you can restore first — this writes to
--      product_variants and inventory_items.
--   2. Confirm migrations are up to date (packages/server/src/db/migrations),
--      specifically that product_variants has unit_value/unit_measure columns
--      (0012_catalog_import or later) — see [[mahsoob-catalog-import]] memory.
--   3. psql "$PRODUCTION_DATABASE_URL" -f add-bakery-single-piece-variants.sql
--   4. Review the final SELECT's output — it lists exactly what was inserted
--      (or "0 rows" for anything already present / skipped).
--
-- Does NOT touch: the box variant, product image/description/brand, price of
-- the box itself, or any product outside this explicit list of 8 ids.

BEGIN;

WITH targets(product_id) AS (
  VALUES
    ('prod_6223013846692'), -- بار كيك شوكولاتة جامبو توداي - 6 قطعة
    ('prod_6223018631279'), -- بار كيك كراميل جامبو توداي - 6 قطعة
    ('prod_6223000494844'), -- كيك براونيز شوكولاتة تودو - 8 قطع
    ('prod_6223000494875'), -- كيك شوكلاتة وكريمة الفانيليا تودو بومب - 8 قطع
    ('prod_6223012619709'), -- كيك شوكولاتة اكس لارج ميلت لارش - 6 قطع
    ('prod_6223000554951'), -- كيك شوكولاتة وكريمة فانيليا هوهوز - 24 قطعة
    ('prod_6223013849716'), -- كيك كرز سوفليه توداي - 6 قطع
    ('prod_2061300125337')  -- مافن هايبروان - 4 قطع
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
    -- ceil(perPiece * 1.2 * 2) / 2, in minor units (piastres), computed live.
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

-- Top up: for a piece variant this script already inserted in an earlier run
-- (before this stock rule existed, or on a database where it's already been
-- applied), (re)compute its stock from the box's CURRENT count — but only
-- while it's still sitting at the untouched 0/0 state, so a quantity someone
-- has since corrected by hand is never overwritten.
WITH box AS (
  SELECT
    v.product_id,
    v.unit_value                      AS pack_size,
    COALESCE(bi.quantity_on_hand, 0)  AS box_qty_on_hand
  FROM product_variants v
  JOIN inventory_items bi ON bi.variant_id = v.id
  WHERE v.is_default
    AND v.product_id IN (
      'prod_6223013846692','prod_6223018631279','prod_6223000494844','prod_6223000494875',
      'prod_6223012619709','prod_6223000554951','prod_6223013849716','prod_2061300125337'
    )
)
UPDATE inventory_items ii
SET quantity_on_hand = box.box_qty_on_hand * box.pack_size
FROM product_variants pv
JOIN box ON box.product_id = pv.product_id
WHERE ii.variant_id = pv.id
  AND pv.sku LIKE '%-PC1'
  AND ii.quantity_on_hand = 0
  AND ii.quantity_reserved = 0;

-- Verify: one row per product that actually got the new variant (join back
-- through the sku to survive the CTEs going out of scope).
SELECT
  p.name_ar,
  v.sku,
  v.price_minor::numeric / 100 AS piece_price_egp,
  i.quantity_on_hand
FROM product_variants v
JOIN products p ON p.id = v.product_id
LEFT JOIN inventory_items i ON i.variant_id = v.id
WHERE v.sku LIKE '%-PC1'
  AND v.product_id IN (
    'prod_6223013846692','prod_6223018631279','prod_6223000494844','prod_6223000494875',
    'prod_6223012619709','prod_6223000554951','prod_6223013849716','prod_2061300125337'
  )
ORDER BY p.name_ar;

COMMIT;
