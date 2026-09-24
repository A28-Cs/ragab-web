/**
 * One-off hard delete: within the Tissues subcategory ("المناديل الورقية", cat_paper_tissues),
 * removes every product whose brand is NOT Fine ("فاين") or Zina ("زينة") — including products
 * with no brand recorded at all (owner request, 2026-09-15). The category itself, and every
 * Fine/Zina product, are left untouched. "ورق الاستخدام المنزلي" (kitchen roll/toilet paper/
 * foil) is deliberately NOT touched — the owner confirmed it has zero Fine/Zina products today,
 * so the same filter there would empty it entirely, which he didn't want.
 *
 * Verified before writing this script (see chat) that every product whose NAME mentions
 * فاين/زينة already carries that exact `brand_ar` value — no name/brand mismatches in this
 * category — so filtering on `brand_ar` alone is safe and won't misclassify a real Fine/Zina
 * product that's just missing its brand tag.
 *
 * Hard delete (not the app's normal soft-delete deleteProduct): products_slug_uidx /
 * products_sku_uidx have no `WHERE deleted_at IS NULL` clause, so a soft-deleted row would keep
 * occupying its slug/SKU.
 *
 * `stock_movements` is append-only (trigger-enforced) and cascades from `products` — see
 * `remove-out-of-scope-categories.ts` for the trigger-disable technique used below (table-owner
 * privilege, not superuser, transactional DDL).
 *
 * DB delete runs first, inside a transaction; object-storage image cleanup only runs AFTER
 * that transaction commits, so a failed/rolled-back run never destroys image files for
 * products still in the database.
 *
 * Idempotent: safe to re-run.
 *
 * Run (from packages/server):
 *   npx tsx --env-file-if-exists=../../.env src/db/scripts/remove-non-brand-tissue-products.ts
 * Point DATABASE_URL / S3_* env vars at production (.env.production) to apply the same cleanup
 * there.
 */
import { and, eq, inArray, notInArray, or, isNull, sql } from 'drizzle-orm';
import { db, closeDb } from '../client';
import { products, productImages } from '../schema';
import { deleteObjectByUrl } from '../../lib/storage';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'db:remove-non-brand-tissue-products' });

const CATEGORY_ID = 'cat_paper_tissues';
const KEEP_BRANDS = ['فاين', 'زينة'];

function targetWhere() {
  return and(
    eq(products.categoryId, CATEGORY_ID),
    or(isNull(products.brandAr), notInArray(products.brandAr, KEEP_BRANDS)),
  );
}

async function main(): Promise<void> {
  const d = db();

  const targetProducts = await d.select({ id: products.id, image: products.image }).from(products).where(targetWhere());
  const productIds = targetProducts.map((p) => p.id);

  const galleryRows = productIds.length
    ? await d.select({ url: productImages.url }).from(productImages).where(inArray(productImages.productId, productIds))
    : [];
  const urls = new Set<string>();
  for (const p of targetProducts) if (p.image) urls.add(p.image);
  for (const g of galleryRows) if (g.url) urls.add(g.url);

  const [{ count: keptCount }] = await d
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, CATEGORY_ID), inArray(products.brandAr, KEEP_BRANDS)));

  log.info({ toDelete: productIds.length, toKeep: keptCount, images: urls.size }, 'starting DB deletion');

  const result = await d.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only`);

    const deletedProducts = productIds.length
      ? await tx.delete(products).where(inArray(products.id, productIds)).returning({ id: products.id })
      : [];

    await tx.execute(sql`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only`);

    return { deletedProducts: deletedProducts.length };
  });

  log.info(result, 'DB deletion committed (Fine/Zina products and the category kept)');

  let imagesDeleted = 0;
  for (const url of urls) {
    await deleteObjectByUrl(url); // swallows its own errors and logs a warning — see lib/storage.ts
    imagesDeleted += 1;
  }
  log.info({ imagesDeleted }, 'storage cleanup attempted');

  const [{ count: remaining }] = await d.select({ count: sql<number>`count(*)::int` }).from(products).where(targetWhere());
  const [{ count: keptAfter }] = await d
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, CATEGORY_ID), inArray(products.brandAr, KEEP_BRANDS)));

  log.info(
    { remaining, keptAfter },
    remaining === 0 ? 'cleanup verified clean' : 'cleanup left residue — investigate',
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
