/**
 * §catalog import — image-ownership regression (products.ts loader).
 *
 * Verified live: running `catalog:import -- products --update full` a second time (to pick up
 * the newly-added gallery loading) reverted every one of 6,201 already-migrated product images
 * back to their original HyperOne URL, because the products upsert unconditionally wrote
 * `image: excluded.image` from the plan on every conflict. The same bug existed in the gallery
 * upsert's `url` column.
 *
 * Ownership of `image`/`url` must transfer to the image pipeline (images.ts) the moment it
 * migrates a photo — a routine catalog re-run (new prices, a taxonomy tweak, a re-classified
 * product) must never silently undo that. This test proves it with a real round trip against
 * the integration DB: insert via the loader, simulate a migration by updating the URL directly
 * (exactly what images.ts does), run the loader again in 'full' mode, and assert the URL is
 * unchanged.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../client';
import * as s from '../schema';
import { loadProducts } from './products';
import { withTriggersDisabled } from '../../test/db';
import type { PlanRow } from '../../ingest/plan';

const TEST_EAN = '9999999999991';
const PRODUCT_ID = `prod_${TEST_EAN}`;
const MIGRATED_URL = 'http://localhost:9000/ragab-uploads/products/test-migrated.webp';

function testRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: PRODUCT_ID,
    sku: TEST_EAN,
    slug: `test-product-${TEST_EAN}`,
    nameAr: 'منتج اختبار',
    nameEn: 'Test Product',
    categoryId: 'cat_groceries',
    brandAr: null,
    brandEn: null,
    unitAr: 'قطعة',
    unitEn: 'piece',
    unitValue: null,
    unitMeasure: null,
    priceMinor: 1000,
    oldPriceMinor: null,
    currency: 'EGP',
    image: 'https://mcprod.hyperone.com.eg/original-photo.jpg',
    images: [],
    descriptionAr: 'وصف تجريبي.',
    descriptionEn: 'A test description.',
    tags: ['اختبار'],
    isActive: true,
    isVisible: true,
    inStock: false,
    meta: {
      tier: 'B',
      confidence: 1,
      ambiguous: false,
      sourcePaths: [],
      packCount: null,
      warnings: [],
      hyperoneId: 0,
    },
    ...overrides,
  };
}

async function writePlan(rows: PlanRow[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ragab-import-test-'));
  const path = join(dir, 'import-plan.jsonl');
  await writeFile(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return path;
}

async function cleanup(): Promise<void> {
  // stock_movements is append-only (blocked by a DB trigger) — this test's own scratch
  // product's ledger rows need a real bypass, not just a query change. See withTriggersDisabled.
  await withTriggersDisabled(async (tx) => {
    await tx.delete(s.stockMovements).where(eq(s.stockMovements.productId, PRODUCT_ID));
    await tx.delete(s.inventoryItems).where(eq(s.inventoryItems.productId, PRODUCT_ID));
    await tx.delete(s.productVariants).where(eq(s.productVariants.productId, PRODUCT_ID));
    await tx.delete(s.productImages).where(eq(s.productImages.productId, PRODUCT_ID));
    await tx.delete(s.products).where(eq(s.products.id, PRODUCT_ID));
  });
}

describe('products loader never reverts a migrated image (integration)', () => {
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('preserves products.image once it points at our own storage, across a --update full re-run', async () => {
    await cleanup();
    const planPath = await writePlan([testRow()]);

    // First load: the product does not exist yet, so image comes from the plan verbatim.
    await loadProducts({ planPath, update: 'full' });
    const [afterInsert] = await db().select({ image: s.products.image }).from(s.products).where(eq(s.products.id, PRODUCT_ID));
    expect(afterInsert!.image).toBe('https://mcprod.hyperone.com.eg/original-photo.jpg');

    // Simulate the image pipeline having migrated it — exactly what images.ts does.
    await db().update(s.products).set({ image: MIGRATED_URL }).where(eq(s.products.id, PRODUCT_ID));

    // Re-run the SAME plan (unchanged HyperOne URL) in 'full' mode — the mode that touches
    // the most columns, and the one that shipped this exact bug.
    await loadProducts({ planPath, update: 'full' });

    const [afterReload] = await db().select({ image: s.products.image }).from(s.products).where(eq(s.products.id, PRODUCT_ID));
    expect(afterReload!.image).toBe(MIGRATED_URL);

    await unlink(planPath);
  });

  it('preserves product_images.url once migrated, across a --update full re-run', async () => {
    await cleanup();
    const galleryUrl = 'https://mcprod.hyperone.com.eg/gallery-1.jpg';
    const planPath = await writePlan([testRow({ images: [galleryUrl] })]);

    await loadProducts({ planPath, update: 'full' });
    const galleryId = `img_${PRODUCT_ID}_0`;
    const [afterInsert] = await db().select({ url: s.productImages.url }).from(s.productImages).where(eq(s.productImages.id, galleryId));
    expect(afterInsert!.url).toBe(galleryUrl);

    const migratedGalleryUrl = 'http://localhost:9000/ragab-uploads/products/gallery/test-migrated.webp';
    await db().update(s.productImages).set({ url: migratedGalleryUrl }).where(eq(s.productImages.id, galleryId));

    await loadProducts({ planPath, update: 'full' });
    const [afterReload] = await db().select({ url: s.productImages.url }).from(s.productImages).where(eq(s.productImages.id, galleryId));
    expect(afterReload!.url).toBe(migratedGalleryUrl);

    await unlink(planPath);
  });
});
