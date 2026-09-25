/**
 * chefaa product loader (§catalog import, load stage — chefaa source).
 *
 * Mirrors db/import/products.ts's 4-table pattern (products -> one default variant ->
 * inventory -> a stock_movements 'purchase' row) exactly, plus one addition: chefaa's extra
 * facet attributes (concentration, size, need_prescription, ...) go into the generic
 * `product_attributes` / `product_attribute_values` EAV tables already in the schema, since
 * there are no dedicated columns for them.
 *
 * Kept as its own file rather than folded into products.ts — that file is HyperOne-specific,
 * has its own integration test pinned to `PlanRow`/hyperoneId, and mixing two source shapes
 * into one loader would make neither easy to read. Both write the same `products` table with
 * the same idempotent-by-construction ids, so a mixed catalog (hyperone + chefaa) just works.
 *
 * Idempotent by construction: ids are deterministic (`prod_chefaa_<id>`, `var_<id>`,
 * `inv_<id>`, `attr_chefaa_<slug>`, `attrval_<productId>_<attributeId>`), so a re-run's ON
 * CONFLICT clauses converge rather than duplicate.
 */
import { readFile } from 'node:fs/promises';
import { sql as rawSql } from 'drizzle-orm';
import { db } from '../client';
import * as s from '../schema';
import { DEFAULT_WAREHOUSE_ID } from '../schema/inventory';
import { asciiSlug } from '../taxonomy';
import { logger } from '../../lib/logger';
import type { ChefaaPlanRow } from '../../ingest/plan-chefaa';

const log = logger().child({ component: 'import:products-chefaa' });

export type UpdateMode = 'none' | 'prices' | 'full';

export interface LoadChefaaProductsOptions {
  planPath: string;
  batchSize?: number;
  update?: UpdateMode;
  openingStock?: number;
  limit?: number;
}

export interface LoadChefaaProductsResult {
  attempted: number;
  productsWritten: number;
  variantsWritten: number;
  inventoryCreated: number;
  galleryPhotosWritten: number;
  attributesWritten: number;
  attributeValuesWritten: number;
  batches: number;
}

async function readPlan(path: string, limit?: number): Promise<ChefaaPlanRow[]> {
  const text = await readFile(path, 'utf8');
  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChefaaPlanRow);
  return limit ? rows.slice(0, limit) : rows;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Deterministic attribute-definition id, stable across runs and shared by every product
 * that carries this attribute name — so "Concentration" is ONE row, not one per product. */
function attributeId(nameEn: string): string {
  const slug = asciiSlug(nameEn) || 'attr';
  return `attr_chefaa_${slug}`;
}

export async function loadChefaaProducts(opts: LoadChefaaProductsOptions): Promise<LoadChefaaProductsResult> {
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
  let attributesWritten = 0;
  let attributeValuesWritten = 0;

  // Attribute DEFINITIONS are shared across the whole catalog, so upsert them once up front
  // rather than once per batch — avoids the same 20-ish rows racing inside every transaction.
  const attrDefs = new Map<string, { id: string; nameAr: string; nameEn: string }>();
  for (const r of rows) {
    for (const a of r.attributes) {
      const id = attributeId(a.nameEn);
      if (!attrDefs.has(id)) attrDefs.set(id, { id, nameAr: a.nameAr, nameEn: a.nameEn });
    }
  }
  if (attrDefs.size > 0) {
    await d
      .insert(s.productAttributes)
      .values([...attrDefs.values()])
      .onConflictDoUpdate({
        target: s.productAttributes.id,
        set: { nameAr: rawSql`excluded.name_ar`, nameEn: rawSql`excluded.name_en` },
      });
    attributesWritten = attrDefs.size;
  }

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
        // Plans written before 0015_product_popularity have no popularity field.
        popularity: r.popularity ?? 0,
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
              popularity: rawSql`excluded.popularity`,
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
              // `image` deliberately absent — same reasoning as products.ts: once the image
              // pipeline migrates a photo to our own storage, a plain re-run must not revert it.
              descriptionAr: rawSql`excluded.description_ar`,
              descriptionEn: rawSql`excluded.description_en`,
              tags: rawSql`excluded.tags`,
              isVisible: rawSql`excluded.is_visible`,
              popularity: rawSql`excluded.popularity`,
              updatedAt: new Date(),
              version: rawSql`${s.products.version} + 1`,
            },
          });
      }
      productsWritten += productValues.length;

      // ── default variants — one per product, mirrors products.ts / seed.ts ───────────
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

      // ── inventory — never overwrite stock a human may have already counted ──────────
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

      if (insertedInventory.length > 0) {
        await tx.insert(s.stockMovements).values(
          insertedInventory.map((inv) => ({
            productId: inv.productId,
            variantId: inv.variantId,
            warehouseId: DEFAULT_WAREHOUSE_ID,
            type: 'purchase' as const,
            quantityDelta: openingStock,
            reason: 'catalog import (chefaa)',
            referenceType: 'catalog_import',
          })),
        );
      }

      // ── gallery photos (chefaa exposes one image per product on the search index; any
      // extra gallery photos live only on the PDP itself and are out of scope for this
      // sweep — r.images is normally empty, but the field is honoured if ever populated) ──
      const galleryValues = batch.flatMap((r) =>
        r.images.slice(0, 8).map((url, idx) => ({
          id: `img_${r.id}_${idx}`,
          productId: r.id,
          url,
          altAr: r.nameAr,
          altEn: r.nameEn,
          sortOrder: idx,
        })),
      );
      if (galleryValues.length > 0) {
        await tx
          .insert(s.productImages)
          .values(galleryValues)
          .onConflictDoUpdate({
            target: s.productImages.id,
            set: { altAr: rawSql`excluded.alt_ar`, altEn: rawSql`excluded.alt_en` },
          });
        galleryPhotosWritten += galleryValues.length;
      }

      // ── product attribute values (concentration, size, need_prescription, ...) ──────
      const attrValueRows = batch.flatMap((r) =>
        r.attributes.map((a) => ({
          id: `attrval_${r.id}_${attributeId(a.nameEn)}`,
          productId: r.id,
          attributeId: attributeId(a.nameEn),
          valueAr: a.valueAr,
          valueEn: a.valueEn,
        })),
      );
      if (attrValueRows.length > 0) {
        await tx
          .insert(s.productAttributeValues)
          .values(attrValueRows)
          .onConflictDoUpdate({
            target: s.productAttributeValues.id,
            set: { valueAr: rawSql`excluded.value_ar`, valueEn: rawSql`excluded.value_en` },
          });
        attributeValuesWritten += attrValueRows.length;
      }
    });

    log.info({ batch: i + 1, of: batches.length, rows: batch.length }, 'chefaa batch committed');
  }

  return {
    attempted: rows.length,
    productsWritten,
    variantsWritten,
    inventoryCreated,
    galleryPhotosWritten,
    attributesWritten,
    attributeValuesWritten,
    batches: batches.length,
  };
}
