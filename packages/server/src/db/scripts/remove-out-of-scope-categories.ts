/**
 * One-off hard delete: removes 5 whole categories + their subcategories, plus 3 standalone
 * subcategories, along with every product filed under them (owner request, 2026-09-14).
 *
 * Unlike the app's normal deleteProduct/deleteCategory (soft delete only, see
 * modules/catalog/service.ts), this does a REAL `DELETE FROM` — the owner explicitly wants
 * disk space back and product image files removed from object storage, not just hidden.
 * `taxonomy.ts`/`rules.ts`/`overrides.ts` were already edited to drop these categories/route
 * their source paths to OUT_OF_SCOPE, so a future `catalog:import` run won't recreate them —
 * this script only cleans up rows/files that already exist in a given database.
 *
 * `stock_movements` is append-only (trigger-enforced, see db/migrations/0001_integrity.sql) and
 * cascades from `products` — deleting a product's inventory history the normal way is rejected.
 * This is the exact scenario `test/db.ts`'s `withTriggersDisabled` exists for; that helper is
 * test-only (imports from `../test/db`), so the same `SET LOCAL session_replication_role =
 * replica` is reproduced inline here inside a transaction (requires the DB role to be
 * superuser — true for the local dev role; confirm this holds for whatever role runs it in
 * production before relying on it there).
 *
 * DB deletes run first, inside one transaction (all-or-nothing); object-storage image cleanup
 * only runs AFTER that transaction commits, so a failed/rolled-back run never destroys image
 * files for products that are still in the database.
 *
 * Idempotent: safe to re-run. A second run finds 0 matching products/categories and no-ops
 * (and any image already deleted from storage is silently skipped by deleteObjectByUrl).
 *
 * Run (from packages/server):
 *   npx tsx --env-file-if-exists=../../.env src/db/scripts/remove-out-of-scope-categories.ts
 * Point DATABASE_URL / S3_* env vars at production to apply the same cleanup there — a plain
 * SQL script (the usual db/scripts/ convention, run via the Neon SQL Editor) can't do the
 * object-storage half of this job, hence a tsx script instead.
 */
import { inArray, sql } from 'drizzle-orm';
import { db, closeDb } from '../client';
import { categories, products, productImages } from '../schema';
import { deleteObjectByUrl } from '../../lib/storage';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'db:remove-out-of-scope-categories' });

// 5 whole departments (parent + children) — every product lives on a child, never the parent,
// but the parent ids are included defensively in case a product was ever filed on one directly.
const KITCHEN = ['cat_kitchen', 'cat_kitchen_utensils', 'cat_kitchen_storage', 'cat_kitchen_serveware', 'cat_kitchen_plastic'];
const DISPOSABLES = ['cat_disposables', 'cat_disp_bags', 'cat_disp_tableware', 'cat_disp_party'];
const PET = ['cat_pet', 'cat_pet_food', 'cat_pet_accessories'];
const HARDWARE = ['cat_hardware', 'cat_hw_electrical', 'cat_hw_household'];
const STATIONERY = ['cat_stationery', 'cat_stat_writing', 'cat_stat_office'];

// 3 standalone subcategories — their parent departments (cat_snacks/cat_confectionery/cat_frozen)
// are NOT touched.
const STANDALONE_LEAVES = ['cat_snacks_crackers', 'cat_conf_oriental', 'cat_frozen_ready'];

const PARENT_IDS = ['cat_kitchen', 'cat_disposables', 'cat_pet', 'cat_hardware', 'cat_stationery'];
const CHILD_IDS = [...KITCHEN, ...DISPOSABLES, ...PET, ...HARDWARE, ...STATIONERY].filter((id) => !PARENT_IDS.includes(id));
const ALL_CATEGORY_IDS = [...PARENT_IDS, ...CHILD_IDS, ...STANDALONE_LEAVES];

async function main(): Promise<void> {
  const d = db();

  const targetProducts = await d
    .select({ id: products.id, image: products.image })
    .from(products)
    .where(inArray(products.categoryId, ALL_CATEGORY_IDS));
  const productIds = targetProducts.map((p) => p.id);

  const galleryRows = productIds.length
    ? await d.select({ url: productImages.url }).from(productImages).where(inArray(productImages.productId, productIds))
    : [];
  const urls = new Set<string>();
  for (const p of targetProducts) if (p.image) urls.add(p.image);
  for (const g of galleryRows) if (g.url) urls.add(g.url);

  log.info({ products: productIds.length, categoryIds: ALL_CATEGORY_IDS.length, images: urls.size }, 'starting DB deletion');

  const result = await d.transaction(async (tx) => {
    // stock_movements is append-only by trigger and cascades from products. SET LOCAL
    // session_replication_role = replica (test/db.ts's withTriggersDisabled technique) needs
    // superuser, which the app's DB role doesn't have in production (Neon) — disabling just
    // this one trigger by name only needs table-owner privilege, which the role does have.
    // DDL is transactional in Postgres, so this is undone automatically if the transaction
    // rolls back; it is re-enabled explicitly below before commit either way.
    await tx.execute(sql`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only`);

    const deletedProducts = productIds.length
      ? await tx.delete(products).where(inArray(products.id, productIds)).returning({ id: products.id })
      : [];

    // Leaves before parents — categories.parent_id is ON DELETE RESTRICT.
    const deletedLeaves = await tx.delete(categories).where(inArray(categories.id, [...CHILD_IDS, ...STANDALONE_LEAVES])).returning({ id: categories.id });
    const deletedParents = await tx.delete(categories).where(inArray(categories.id, PARENT_IDS)).returning({ id: categories.id });

    await tx.execute(sql`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only`);

    return { deletedProducts: deletedProducts.length, deletedLeaves: deletedLeaves.length, deletedParents: deletedParents.length };
  });

  log.info(result, 'DB deletion committed');

  let imagesDeleted = 0;
  for (const url of urls) {
    await deleteObjectByUrl(url); // swallows its own errors and logs a warning — see lib/storage.ts
    imagesDeleted += 1;
  }
  log.info({ imagesDeleted }, 'storage cleanup attempted');

  const [{ count: remainingProducts }] = await d
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(inArray(products.categoryId, ALL_CATEGORY_IDS));
  const [{ count: remainingCategories }] = await d
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(inArray(categories.id, ALL_CATEGORY_IDS));

  log.info(
    { remainingProducts, remainingCategories },
    remainingProducts === 0 && remainingCategories === 0 ? 'cleanup verified clean' : 'cleanup left residue — investigate',
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
