/**
 * One-off hard delete: removes every product under the Cleaning department (owner request,
 * 2026-09-15) — many HyperOne-imported cleaning products aren't actually stocked, and the
 * owner will add the real ones back himself.
 *
 * Unlike `remove-out-of-scope-categories.ts` (2026-09-14), the CATEGORIES themselves are kept
 * — only the products under them are deleted, so the owner can add products back into the same
 * "المنظفات" subcategories. `rules.ts` was already edited to route Cleaning's HyperOne source
 * paths to OUT_OF_SCOPE, so a future `catalog:import` run won't repopulate them — this script
 * only cleans up rows/files that already exist in a given database.
 *
 * Hard delete (not the app's normal soft-delete deleteProduct) matters here specifically:
 * products_slug_uidx / products_sku_uidx have no `WHERE deleted_at IS NULL` clause, so a
 * soft-deleted row would keep occupying its slug/SKU and block the owner from re-adding the
 * same barcode later.
 *
 * `stock_movements` is append-only (trigger-enforced) and cascades from `products` — see
 * `remove-out-of-scope-categories.ts` for the full explanation of the trigger-disable technique
 * used below (table-owner privilege, not superuser, transactional DDL).
 *
 * DB delete runs first, inside a transaction; object-storage image cleanup only runs AFTER
 * that transaction commits, so a failed/rolled-back run never destroys image files for
 * products still in the database.
 *
 * Idempotent: safe to re-run.
 *
 * Run (from packages/server):
 *   npx tsx --env-file-if-exists=../../.env src/db/scripts/remove-cleaning-products.ts
 * Point DATABASE_URL / S3_* env vars at production (.env.production) to apply the same cleanup
 * there.
 */
import { inArray, sql } from 'drizzle-orm';
import { db, closeDb } from '../client';
import { products, productImages } from '../schema';
import { deleteObjectByUrl } from '../../lib/storage';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'db:remove-cleaning-products' });

// cat_cleaning itself is included defensively — db/seed.ts's demo data files one product
// (prod_detergent) directly on the parent — but products otherwise only ever live on the
// 5 children, never the parent, per the same convention documented in the sibling script.
const TARGET_CATEGORY_IDS = [
  'cat_cleaning',
  'cat_clean_laundry',
  'cat_clean_dish',
  'cat_clean_surfaces',
  'cat_clean_disinfect',
  'cat_clean_tools',
];

async function main(): Promise<void> {
  const d = db();

  const targetProducts = await d
    .select({ id: products.id, image: products.image })
    .from(products)
    .where(inArray(products.categoryId, TARGET_CATEGORY_IDS));
  const productIds = targetProducts.map((p) => p.id);

  const galleryRows = productIds.length
    ? await d.select({ url: productImages.url }).from(productImages).where(inArray(productImages.productId, productIds))
    : [];
  const urls = new Set<string>();
  for (const p of targetProducts) if (p.image) urls.add(p.image);
  for (const g of galleryRows) if (g.url) urls.add(g.url);

  log.info({ products: productIds.length, categoryIds: TARGET_CATEGORY_IDS.length, images: urls.size }, 'starting DB deletion');

  const result = await d.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only`);

    const deletedProducts = productIds.length
      ? await tx.delete(products).where(inArray(products.id, productIds)).returning({ id: products.id })
      : [];

    await tx.execute(sql`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only`);

    return { deletedProducts: deletedProducts.length };
  });

  log.info(result, 'DB deletion committed (categories kept)');

  let imagesDeleted = 0;
  for (const url of urls) {
    await deleteObjectByUrl(url); // swallows its own errors and logs a warning — see lib/storage.ts
    imagesDeleted += 1;
  }
  log.info({ imagesDeleted }, 'storage cleanup attempted');

  const [{ count: remainingProducts }] = await d
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(inArray(products.categoryId, TARGET_CATEGORY_IDS));

  log.info(
    { remainingProducts },
    remainingProducts === 0 ? 'cleanup verified clean' : 'cleanup left residue — investigate',
  );
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (e) => {
    log.error({ err: e }, 'removal script failed');
    await closeDb();
    process.exit(1);
  });
