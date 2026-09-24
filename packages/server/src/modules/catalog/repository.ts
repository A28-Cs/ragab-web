/**
 * Catalog repository (§25, §26). One joined query — products ⋈ categories ⋈ inventory —
 * so there is no N+1. Only the columns the DTO needs are selected (no SELECT *). The
 * result is bounded by `limit` and paginated by a keyset cursor on (createdAt,id) for
 * the default sort. Search uses the FTS `search_vector` (GIN index) with an ILIKE
 * fallback that also covers category names, matching the prototype's 8-field search.
 */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { db } from '../../db/client';
import { products, categories, inventoryItems, productVariants, productImages } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import type { ProductRow, VariantRow } from './mapper';
import type { ProductFiltersInput } from './schema';
import { decodeCursor, encodeCursor } from '../../lib/pagination';

function baseSelect(exec: DbExecutor) {
  const invAgg = exec
    .select({
      productId: inventoryItems.productId,
      available: sql<number>`COALESCE(SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}), 0)::int`.as('available'),
    })
    .from(inventoryItems)
    .groupBy(inventoryItems.productId)
    .as('inv_agg');

  return exec
    .select({
      id: products.id,
      slug: products.slug,
      nameAr: products.nameAr,
      nameEn: products.nameEn,
      categoryId: products.categoryId,
      categoryNameAr: categories.nameAr,
      categoryNameEn: categories.nameEn,
      brandAr: products.brandAr,
      brandEn: products.brandEn,
      unitAr: products.unitAr,
      unitEn: products.unitEn,
      priceMinor: products.priceMinor,
      oldPriceMinor: products.oldPriceMinor,
      image: products.image,
      descriptionAr: products.descriptionAr,
      descriptionEn: products.descriptionEn,
      originAr: products.originAr,
      isPopular: products.isPopular,
      isEssential: products.isEssential,
      isNew: products.isNew,
      badgeAr: products.badgeAr,
      badgeEn: products.badgeEn,
      tags: products.tags,
      rating: products.rating,
      reviewCount: products.reviewCount,
      unitValue: products.unitValue,
      unitMeasure: products.unitMeasure,
      lowStockThreshold: products.lowStockThreshold,
      createdAt: products.createdAt,
      // Full-precision text, for the keyset cursor — see ProductRow.createdAtRaw.
      createdAtRaw: sql<string>`${products.createdAt}::text`,
      available: sql<number>`COALESCE(${invAgg.available}, 0)::int`,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(invAgg, eq(products.id, invAgg.productId));
}

/**
 * available stock of ONE variant = SUM(on_hand - reserved) across warehouses. The outer
 * column is written literally: in a join-free SELECT Drizzle emits `${productVariants.id}`
 * unqualified, which the correlated subquery would resolve to inventory_items.id.
 */
const variantAvailableExpr = sql<number>`COALESCE((
  SELECT SUM(inventory_items.quantity_on_hand - inventory_items.quantity_reserved)
  FROM inventory_items WHERE inventory_items.variant_id = product_variants.id
), 0)::int`;

/**
 * Attach every product's variants (all of them, with `isActive`) in ONE extra query for
 * the whole page — the storefront shows the active ones, the cart/checkout decide what
 * is sellable, the control center sees retired ones too.
 */
async function attachVariants(rows: ProductRow[], exec: DbExecutor): Promise<ProductRow[]> {
  if (rows.length === 0) return rows;
  const variantRows = (await exec
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      nameAr: productVariants.nameAr,
      nameEn: productVariants.nameEn,
      priceMinor: productVariants.priceMinor,
      oldPriceMinor: productVariants.oldPriceMinor,
      unitAr: productVariants.unitAr,
      unitEn: productVariants.unitEn,
      unitValue: productVariants.unitValue,
      unitMeasure: productVariants.unitMeasure,
      isActive: productVariants.isActive,
      isDefault: productVariants.isDefault,
      sortOrder: productVariants.sortOrder,
      available: variantAvailableExpr,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, rows.map((r) => r.id)))
    .orderBy(productVariants.sortOrder, productVariants.createdAt, productVariants.id)) as VariantRow[];
  const byProduct = new Map<string, VariantRow[]>();
  for (const v of variantRows) {
    const list = byProduct.get(v.productId) ?? [];
    list.push(v);
    byProduct.set(v.productId, list);
  }
  for (const r of rows) r.variants = byProduct.get(r.id) ?? [];
  return rows;
}

/** Attach every product's extra gallery photos (sorted) in ONE extra query for the whole page. */
async function attachImages(rows: ProductRow[], exec: DbExecutor): Promise<ProductRow[]> {
  if (rows.length === 0) return rows;
  const imageRows = await exec
    .select({ productId: productImages.productId, url: productImages.url })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(productImages.sortOrder, productImages.createdAt);
  const byProduct = new Map<string, string[]>();
  for (const img of imageRows) {
    const list = byProduct.get(img.productId) ?? [];
    list.push(img.url);
    byProduct.set(img.productId, list);
  }
  for (const r of rows) r.images = byProduct.get(r.id) ?? [];
  return rows;
}

/** Resolve a category id/slug into all matching category IDs (self + children). */
async function resolveCategoryIds(categoryId: string, exec: DbExecutor = db()): Promise<string[]> {
  const rows = await exec
    .select({ id: categories.id })
    .from(categories)
    .where(and(
      eq(categories.storeId, DEFAULT_STORE_ID),
      sql`${categories.deletedAt} IS NULL`,
      sql`(
        ${categories.id} = ${categoryId}
        OR ${categories.slug} = ${categoryId}
        OR ${categories.parentId} = (
          SELECT id FROM categories
          WHERE store_id = ${DEFAULT_STORE_ID} AND (id = ${categoryId} OR slug = ${categoryId})
          LIMIT 1
        )
      )`,
    ));
  return rows.map(r => r.id);
}

function buildConditions(f: ProductFiltersInput, visibleOnly: boolean): SQL[] {
  // Soft-deleted rows never surface — not in the store, not in the control center.
  const conds: SQL[] = [eq(products.storeId, DEFAULT_STORE_ID), sql`${products.deletedAt} IS NULL`];
  if (visibleOnly) {
    conds.push(eq(products.isActive, true));
    conds.push(eq(products.isVisible, true));
  }
  // Accept the category's id OR its slug: the mobile category page navigates by slug and
  // the web resolves slug→id first — both must land on the same rows the counter counted.
  // A PARENT category (e.g. "المشروبات") additionally rolls up every product filed under
  // one of its subcategories ("مياه", "قهوة", …) — browsing the parent shows everything
  // underneath it, exactly like listCategories/getCategoryRow count it (§ subcategories).
  if (f.categoryId && f.categoryId !== 'all') {
    // Accept id or slug; also roll up products from subcategories of a parent.
    // Pre-resolved in queryProducts/countProducts for index-friendly IN clause.
    if ((f as any)._resolvedCategoryIds) {
      conds.push(inArray(products.categoryId, (f as any)._resolvedCategoryIds));
    } else {
      conds.push(sql`(
        ${products.categoryId} = ${f.categoryId}
        OR ${categories.slug} = ${f.categoryId}
        OR ${categories.parentId} = (
          SELECT id FROM categories
          WHERE store_id = ${DEFAULT_STORE_ID} AND (id = ${f.categoryId} OR slug = ${f.categoryId})
          LIMIT 1
        )
      )`);
    }
  }
  if (f.minPrice !== undefined) conds.push(sql`${products.priceMinor} >= ${Math.round(f.minPrice * 100)}`);
  if (f.maxPrice !== undefined) conds.push(sql`${products.priceMinor} <= ${Math.round(f.maxPrice * 100)}`);
  if (f.offersOnly) conds.push(sql`${products.oldPriceMinor} IS NOT NULL AND ${products.oldPriceMinor} > ${products.priceMinor}`);
  if (f.brand) conds.push(sql`(${products.brandAr} = ${f.brand} OR ${products.brandEn} = ${f.brand})`);
  if (f.searchQuery) {
    const q = f.searchQuery;
    // search_vector is created by the integrity migration (not the Drizzle schema),
    // so it is referenced as a qualified raw column here.
    //
    // arabic_fold() (§0013 migration) wraps BOTH sides of the comparison — column and
    // incoming query — so orthographic spelling variants match each other: "طحينة"
    // (teh marbuta) and "طحينه" (heh) are the same search term to a shopper, and must
    // return the same rows regardless of which one they typed.
    conds.push(
      sql`(
        products.search_vector @@ websearch_to_tsquery('simple', arabic_fold(${q}))
        OR arabic_fold(${products.nameAr}) ILIKE '%' || arabic_fold(${q}) || '%'
        OR arabic_fold(${products.nameEn}) ILIKE '%' || arabic_fold(${q}) || '%'
        OR arabic_fold(${categories.nameAr}) ILIKE '%' || arabic_fold(${q}) || '%'
        OR arabic_fold(${categories.nameEn}) ILIKE '%' || arabic_fold(${q}) || '%'
      )`,
    );
  }
  return conds;
}

/**
 * Keyset cursor for the default "newest" sort, which orders by (createdAt DESC, id
 * DESC). A cursor on `id` alone breaks as soon as a page ends mid-tie: imported
 * products keep their supplier barcode as the id, so id order has no relationship to
 * createdAt order, and `WHERE id < lastId` silently drops every not-yet-seen row whose
 * id happens to be numerically/lexically smaller — which is most of them — making the
 * walk terminate after a page or two instead of covering the whole catalog.
 */
interface ProductCursor {
  id: string;
  createdAt: string;
}

export function encodeProductCursor(row: ProductCursor): string {
  return encodeCursor(JSON.stringify(row));
}

function decodeProductCursor(cursor: string | undefined): ProductCursor | null {
  const raw = decodeCursor(cursor);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProductCursor>;
    return typeof parsed.id === 'string' && typeof parsed.createdAt === 'string'
      ? { id: parsed.id, createdAt: parsed.createdAt }
      : null;
  } catch {
    return null;
  }
}

function orderClause(sortBy: ProductFiltersInput['sortBy']): SQL {
  switch (sortBy) {
    case 'price_low':
      return sql`${products.priceMinor} ASC, ${products.id} DESC`;
    case 'price_high':
      return sql`${products.priceMinor} DESC, ${products.id} DESC`;
    case 'discount':
      return sql`(COALESCE(${products.oldPriceMinor},0) - ${products.priceMinor}) DESC, ${products.id} DESC`;
    case 'rating':
      return sql`COALESCE(${products.rating},0) DESC, ${products.id} DESC`;
    case 'popular':
      return sql`${products.isPopular} DESC, ${products.id} DESC`;
    case 'newest':
    default:
      return sql`${products.createdAt} DESC, ${products.id} DESC`;
  }
}

/** Matching row count for the SAME filters, cursor excluded — pairs with queryProducts for a Page's `total`. */
export async function countProducts(
  f: ProductFiltersInput,
  opts: { visibleOnly?: boolean } = {},
  exec: DbExecutor = db(),
): Promise<number> {
  const resolvedFilters = { ...f };
  if (f.categoryId && f.categoryId !== 'all') {
    (resolvedFilters as any)._resolvedCategoryIds = await resolveCategoryIds(f.categoryId, exec);
  }
  const conds = buildConditions(resolvedFilters, opts.visibleOnly ?? true);
  if (f.inStockOnly) {
    conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0`);
  }
  if (f.lowStockOnly) {
    conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0 AND COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) <= ${products.lowStockThreshold}`);
  }
  const [row] = (await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))) as unknown as { count: number }[];
  return row?.count ?? 0;
}

/**
 * Per-category row counts for the SAME filters (search/price/stock/offers/brand) but
 * with the category filter itself dropped — a facet sidebar needs to know how many
 * matches EVERY category has, not just the one currently selected, so a shopper can
 * switch between them without the counts collapsing to just the active one.
 */
export async function countProductsByCategory(
  f: ProductFiltersInput,
  opts: { visibleOnly?: boolean } = {},
  exec: DbExecutor = db(),
): Promise<Map<string, number>> {
  const conds = buildConditions({ ...f, categoryId: undefined }, opts.visibleOnly ?? true);
  if (f.inStockOnly) conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0`);
  if (f.lowStockOnly) conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0 AND COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) <= ${products.lowStockThreshold}`);
  const rows = (await exec
    .select({ categoryId: products.categoryId, count: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .groupBy(products.categoryId)) as unknown as { categoryId: string; count: number }[];
  return new Map(rows.map((r) => [r.categoryId, r.count]));
}

export async function queryProducts(
  f: ProductFiltersInput,
  opts: { visibleOnly?: boolean } = {},
  exec: DbExecutor = db(),
): Promise<{ rows: ProductRow[]; hasMore: boolean; nextCursor?: string | null }> {
  const visibleOnly = opts.visibleOnly ?? true;

  // Pre-resolve category IDs for index-friendly IN clause
  const resolvedFilters = { ...f };
  if (f.categoryId && f.categoryId !== 'all') {
    (resolvedFilters as any)._resolvedCategoryIds = await resolveCategoryIds(f.categoryId, exec);
  }
  const conds = buildConditions(resolvedFilters, visibleOnly);

  // Keyset cursor only applies to the default (newest) sort; other sorts use bounded limit.
  if ((!f.sortBy || f.sortBy === 'newest') && f.cursor) {
    const decoded = decodeProductCursor(f.cursor);
    if (decoded) {
      conds.push(sql`(${products.createdAt}, ${products.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`);
    }
  }

  // Offset-based pagination for non-default sorts (keyset doesn't apply to price/discount/rating).
  let offset = 0;
  if (f.sortBy && f.sortBy !== 'newest' && f.cursor) {
    // For non-keyset sorts, the cursor encodes the offset.
    const decoded = decodeCursor(f.cursor);
    if (decoded) {
      const parsed = parseInt(decoded, 10);
      if (!isNaN(parsed)) offset = parsed;
    }
  }

  if (f.inStockOnly) {
    conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0`);
  }
  if (f.lowStockOnly) {
    conds.push(sql`COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) > 0 AND COALESCE((SELECT SUM(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved}) FROM ${inventoryItems} WHERE ${inventoryItems.productId} = ${products.id}), 0) <= ${products.lowStockThreshold}`);
  }

  const query = baseSelect(exec)
    .where(and(...conds))
    .orderBy(orderClause(f.sortBy))
    .limit(f.limit + 1);

  const rows = (offset > 0 ? await query.offset(offset) : await query) as unknown as ProductRow[];

  const hasMore = rows.length > f.limit;
  const finalRows = hasMore ? rows.slice(0, f.limit) : rows;
  await attachVariants(finalRows, exec);
  await attachImages(finalRows, exec);
  
  const last = finalRows[finalRows.length - 1];
  const useCursor = !f.sortBy || f.sortBy === 'newest';
  const nextCursor = hasMore
    ? useCursor && last
      ? encodeProductCursor({ id: last.id, createdAt: last.createdAtRaw })
      : encodeCursor(String(offset + f.limit))
    : null;

  return { rows: finalRows, hasMore, nextCursor };
}

export async function findProductBySlugOrId(
  slugOrId: string,
  opts: { visibleOnly?: boolean } = {},
  exec: DbExecutor = db(),
): Promise<ProductRow | null> {
  const visibleOnly = opts.visibleOnly ?? true;
  const conds: SQL[] = [
    eq(products.storeId, DEFAULT_STORE_ID),
    sql`(${products.slug} = ${slugOrId} OR ${products.id} = ${slugOrId})`,
  ];
  if (visibleOnly) {
    conds.push(eq(products.isActive, true));
    conds.push(sql`${products.deletedAt} IS NULL`);
  }
  const [row] = (await baseSelect(exec).where(and(...conds)).limit(1)) as unknown as ProductRow[];
  if (!row) return null;
  await attachVariants([row], exec);
  await attachImages([row], exec);
  return row;
}

export async function flagProducts(
  flag: 'isPopular' | 'isEssential' | 'offers',
  limit: number,
  exec: DbExecutor = db(),
): Promise<ProductRow[]> {
  const conds: SQL[] = [
    eq(products.storeId, DEFAULT_STORE_ID),
    eq(products.isActive, true),
    eq(products.isVisible, true),
    sql`${products.deletedAt} IS NULL`,
  ];
  if (flag === 'isPopular') conds.push(eq(products.isPopular, true));
  else if (flag === 'isEssential') conds.push(eq(products.isEssential, true));
  else conds.push(sql`${products.oldPriceMinor} IS NOT NULL AND ${products.oldPriceMinor} > ${products.priceMinor}`);

  const rows = (await baseSelect(exec)
    .where(and(...conds))
    .orderBy(sql`${products.createdAt} DESC`)
    .limit(limit)) as unknown as ProductRow[];
  await attachVariants(rows, exec);
  return attachImages(rows, exec);
}

/** Batch-load products by id (for the cart), including available stock. No N+1. */
export async function findProductsByIds(
  ids: string[],
  exec: DbExecutor = db(),
  opts: { visibleOnly?: boolean } = {},
): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  const conds = [eq(products.storeId, DEFAULT_STORE_ID), inArray(products.id, ids)];
  if (opts.visibleOnly) {
    conds.push(eq(products.isActive, true));
    conds.push(eq(products.isVisible, true));
    conds.push(sql`${products.deletedAt} IS NULL`);
  }
  const rows = (await baseSelect(exec).where(and(...conds))) as unknown as ProductRow[];
  await attachVariants(rows, exec);
  return attachImages(rows, exec);
}
