/**
 * Product loader (§catalog import, load stage).
 *
 * Consumes `import-plan.jsonl` (produced by `ingest/plan.ts`) and writes the same 4-table
 * pattern db/seed.ts uses per product: products -> one default product_variants row ->
 * inventory_items -> a stock_movements 'purchase' row. Batched (default 250 rows/transaction)
 * via direct Drizzle, NOT `catalogService.saveProduct` — that schema is `.strict()` with no
 * `tags` field, re-slugs and stamps merchandising flags on every call, and would write one
 * audit_logs row per product into an append-only table. See the plan for the full rationale.
 *
 * Idempotent by construction: ids are deterministic (`prod_<ean>`, `var_<id>`, `inv_<id>`),
 * so a re-run's ON CONFLICT clauses converge rather than duplicate. `inventory_items` and
 * `stock_movements` use ON CONFLICT DO NOTHING — a re-run never overwrites stock a human has
 * since counted, and the movements ledger only grows for genuinely NEW inventory rows.
 */
import { readFile } from 'node:fs/promises';
import { sql as rawSql } from 'drizzle-orm';
import { db } from '../client';
import * as s from '../schema';
import { DEFAULT_WAREHOUSE_ID } from '../schema/inventory';
import { logger } from '../../lib/logger';
import type { PlanRow } from '../../ingest/plan';

const log = logger().child({ component: 'import:products' });

export type UpdateMode = 'none' | 'prices' | 'full';

export interface LoadProductsOptions {
  planPath: string;
  batchSize?: number;
  update?: UpdateMode;
  /** Stock quantity for every newly-inserted variant. Owner default: 0 (honestly out of stock). */
  openingStock?: number;
  /** Cap for smoke runs. */
  limit?: number;
}

export interface LoadProductsResult {
  attempted: number;
  productsWritten: number;
  variantsWritten: number;
  inventoryCreated: number;
  galleryPhotosWritten: number;
  batches: number;
}

async function readPlan(path: string, limit?: number): Promise<PlanRow[]> {
  const text = await readFile(path, 'utf8');
  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PlanRow);
  return limit ? rows.slice(0, limit) : rows;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadProducts(opts: LoadProductsOptions): Promise<LoadProductsResult> {
  const batchSize = opts.batchSize ?? 250;
  const update = opts.update ?? 'full';
  const openingStock = opts.openingStock ?? 0;

  const rows = await readPlan(opts.planPath, opts.limit);
  const batches = chunk(rows, batchSize);
  const d = db();

  let productsWritten = 0;
  let variantsWritten = 0;
  let inventoryCreated = 0;
  let galleryPhotosWritten = 0;

  for (const [i, batch] of batches.entries()) {
    await d.transaction(async (tx) => {
      // ── products ────────────────────────────────────────────────────────────────
      const productValues = batch.map((r) => ({
        id: r.id,
        sku: r.sku,
        slug: r.slug,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        categoryId: r.categoryId,
        brandAr: r.brandAr,
        brandEn: r.brandEn,
        unitAr: r.unitAr,
        unitEn: r.unitEn,
        unitValue: r.unitValue,
        unitMeasure: r.unitMeasure,
        priceMinor: r.priceMinor,
        oldPriceMinor: r.oldPriceMinor,
        currency: r.currency,
        image: r.image,
        descriptionAr: r.descriptionAr,
        descriptionEn: r.descriptionEn,
        tags: r.tags,
        isActive: r.isActive,
        isVisible: r.isVisible,
      }));

      if (update === 'none') {
        await tx.insert(s.products).values(productValues).onConflictDoNothing();
      } else if (update === 'prices') {
        await tx
          .insert(s.products)
          .values(productValues)
          .onConflictDoUpdate({
            target: s.products.id,
            set: {
              priceMinor: rawSql`excluded.price_minor`,
              oldPriceMinor: rawSql`excluded.old_price_minor`,
              updatedAt: new Date(),
              version: rawSql`${s.products.version} + 1`,
            },
          });
      } else {
        await tx
          .insert(s.products)
          .values(productValues)
          .onConflictDoUpdate({
            target: s.products.id,
            set: {
              slug: rawSql`excluded.slug`,
              nameAr: rawSql`excluded.name_ar`,
              nameEn: rawSql`excluded.name_en`,
              categoryId: rawSql`excluded.category_id`,
              brandAr: rawSql`excluded.brand_ar`,
              brandEn: rawSql`excluded.brand_en`,
              unitAr: rawSql`excluded.unit_ar`,
              unitEn: rawSql`excluded.unit_en`,
              unitValue: rawSql`excluded.unit_value`,
              unitMeasure: rawSql`excluded.unit_measure`,
              priceMinor: rawSql`excluded.price_minor`,
              oldPriceMinor: rawSql`excluded.old_price_minor`,
              // `image` is DELIBERATELY absent from this SET. Ownership of this column
              // transfers to the image pipeline (images.ts) the moment it migrates a product's
              // photo to our own storage — a routine `--update full` re-run (e.g. to refresh
              // prices or pick up new gallery support) must never silently revert a migrated
              // URL back to the plan's original HyperOne link. Verified live: it did, for all
              // 6,201 already-migrated products, before this fix. `image` is still set
              // correctly on first INSERT via `productValues` above.
              descriptionAr: rawSql`excluded.description_ar`,
              descriptionEn: rawSql`excluded.description_en`,
              tags: rawSql`excluded.tags`,
              isVisible: rawSql`excluded.is_visible`,
              updatedAt: new Date(),
              version: rawSql`${s.products.version} + 1`,
            },
          });
      }
      productsWritten += productValues.length;

      // ── default variants — one per product, mirrors seed.ts's `var_<id>` convention ──
      const variantValues = batch.map((r) => ({
        id: `var_${r.id}`,
        productId: r.id,
        sku: r.sku,
        nameAr: r.unitAr,
        nameEn: r.unitEn,
        priceMinor: r.priceMinor,
        oldPriceMinor: r.oldPriceMinor,
        unitAr: r.unitAr,
        unitEn: r.unitEn,
        unitValue: r.unitValue,
        unitMeasure: r.unitMeasure,
        isActive: true,
        isDefault: true,
        sortOrder: 0,
      }));

      if (update === 'none') {
        await tx.insert(s.productVariants).values(variantValues).onConflictDoNothing();
      } else {
        // Keep the variant's price in lockstep with the product's — the invariant
        // catalogService.syncVariants maintains for a single-variant product.
        await tx
          .insert(s.productVariants)
          .values(variantValues)
          .onConflictDoUpdate({
            target: s.productVariants.id,
            set: {
              priceMinor: rawSql`excluded.price_minor`,
              oldPriceMinor: rawSql`excluded.old_price_minor`,
              ...(update === 'full'
                ? {
                    unitAr: rawSql`excluded.unit_ar`,
                    unitEn: rawSql`excluded.unit_en`,
                    unitValue: rawSql`excluded.unit_value`,
                    unitMeasure: rawSql`excluded.unit_measure`,
                  }
                : {}),
              updatedAt: new Date(),
              version: rawSql`${s.productVariants.version} + 1`,
            },
          });
      }
      variantsWritten += variantValues.length;

      // ── inventory — NEVER overwrite stock a human may have already counted ──────────
      const inventoryValues = batch.map((r) => ({
        id: `inv_${r.id}`,
        productId: r.id,
        variantId: `var_${r.id}`,
        warehouseId: DEFAULT_WAREHOUSE_ID,
        quantityOnHand: openingStock,
        quantityReserved: 0,
      }));
      const insertedInventory = await tx
        .insert(s.inventoryItems)
        .values(inventoryValues)
        .onConflictDoNothing()
        .returning({ id: s.inventoryItems.id, productId: s.inventoryItems.productId, variantId: s.inventoryItems.variantId });
      inventoryCreated += insertedInventory.length;

      // ── ledger — only for inventory rows that are genuinely NEW this run ────────────
      if (insertedInventory.length > 0) {
        await tx.insert(s.stockMovements).values(
          insertedInventory.map((inv) => ({
            productId: inv.productId,
            variantId: inv.variantId,
            warehouseId: DEFAULT_WAREHOUSE_ID,
            type: 'purchase' as const,
            quantityDelta: openingStock,
            reason: 'catalog import (hyperone)',
            referenceType: 'catalog_import',
          })),
        );
      }

      /*
       * ── gallery photos ────────────────────────────────────────────────────────────
       * The plan already carries up to 8 extra HyperOne image URLs per product (r.images,
       * distinct from the single main r.image), but nothing wrote them until now — a real
       * gap, not a deliberate deferral. Deterministic per-slot ids (`img_<productId>_<n>`)
       * make this idempotent the same way the rest of this loader is: a re-run updates the
       * same rows rather than duplicating them. altAr/altEn are populated from the product
       * name — no code path anywhere else in the app fills them, so this is also the first
       * time those columns carry real data instead of staying null forever.
       */
      const galleryValues = batch.flatMap((r) =>
        r.images.slice(0, 8).map((url, i) => ({
          id: `img_${r.id}_${i}`,
          productId: r.id,
          url,
          altAr: r.nameAr,
          altEn: r.nameEn,
          sortOrder: i,
        })),
      );
      if (galleryValues.length > 0) {
        await tx
          .insert(s.productImages)
          .values(galleryValues)
          .onConflictDoUpdate({
            target: s.productImages.id,
            // `url` is DELIBERATELY absent — same reasoning as products.image just above:
            // once the gallery migration pass re-hosts this photo, a re-run of this loader
            // must not revert it back to the plan's HyperOne URL. altAr/altEn are plain
            // descriptive text, safe to keep refreshing on every run.
            set: { altAr: rawSql`excluded.alt_ar`, altEn: rawSql`excluded.alt_en` },
          });
        galleryPhotosWritten += galleryValues.length;
      }
    });

    log.info({ batch: i + 1, of: batches.length, rows: batch.length }, 'batch committed');
  }

  return {
    attempted: rows.length,
    productsWritten,
    variantsWritten,
    inventoryCreated,
    galleryPhotosWritten,
    batches: batches.length,
  };
}
