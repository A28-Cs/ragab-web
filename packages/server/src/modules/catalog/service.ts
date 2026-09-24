/**
 * Catalog service. Read paths are storefront-facing (visible/active only). Admin
 * mutations require a permission (enforced at the route) and additionally re-check,
 * write an inventory row + stock movement on stock changes, and emit an audit entry.
 * Price arrives in MAJOR units and is converted to integer minor units here — the
 * client never sends minor units and never controls the derived fields.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db, type Transaction } from '../../db/client';
import { products, productVariants, productImages, categories, inventoryItems, stockMovements } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { DEFAULT_WAREHOUSE_ID } from '../../db/schema/inventory';
import { BusinessRuleError, NotFoundError, ConflictError } from '../../lib/errors';
import { Money } from '../../lib/money';
import { prefixedId } from '../../lib/ids';
import { deleteObjectByUrl } from '../../lib/storage';
import type { Page } from '../../lib/pagination';
import { logAudit } from '../audit';
import { queryProducts, countProducts, countProductsByCategory, findProductBySlugOrId, findProductsByIds, flagProducts, encodeProductCursor } from './repository';
import { toProductDto, toCategoryDto, type CategoryRow } from './mapper';
import type { ProductFiltersInput, ProductUpsertInput, CategoryUpsertInput, SuggestInput } from './schema';
import type { Product, Category } from '../../types';

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '') || `product-${Date.now()}`;
}

export async function getProducts(filters: ProductFiltersInput): Promise<Page<Product>> {
  const { rows, hasMore } = await queryProducts(filters, { visibleOnly: true });
  const items = rows.map(toProductDto);
  const useCursor = !filters.sortBy || filters.sortBy === 'newest';
  const last = rows[rows.length - 1];
  return {
    items,
    hasMore: useCursor ? hasMore : false,
    nextCursor: useCursor && hasMore && last ? encodeProductCursor({ id: last.id, createdAt: last.createdAtRaw }) : null,
  };
}

/**
 * Control-center listing: same query as getProducts, but includes inactive/hidden products
 * (visibleOnly: false) and returns a total count for the admin pagination UI.
 */
export async function listProductsAdmin(filters: ProductFiltersInput): Promise<Page<Product>> {
  const [{ rows, hasMore }, total] = await Promise.all([
    queryProducts(filters, { visibleOnly: false }),
    countProducts(filters, { visibleOnly: false }),
  ]);
  const items = rows.map(toProductDto);
  const useCursor = !filters.sortBy || filters.sortBy === 'newest';
  const last = rows[rows.length - 1];
  return {
    items,
    hasMore: useCursor ? hasMore : false,
    nextCursor: useCursor && hasMore && last ? encodeProductCursor({ id: last.id, createdAt: last.createdAtRaw }) : null,
    total,
  };
}

/** A lightweight search suggestion (§15) — just enough to render an autocomplete row. */
export interface ProductSuggestion {
  id: string;
  slug: string;
  nameAr: string;
  nameEn?: string;
  image: string;
  price: number;
}

/** Search autocomplete over the same FTS/ILIKE path as the full listing, capped small. */
export async function suggestProducts(input: SuggestInput): Promise<ProductSuggestion[]> {
  const { rows } = await queryProducts(
    { searchQuery: input.q, limit: input.limit, sortBy: 'popular' } as ProductFiltersInput,
    { visibleOnly: true },
  );
  return rows.map((r) => {
    const p = toProductDto(r);
    return { id: p.id, slug: p.slug, nameAr: p.nameAr, nameEn: p.nameEn, image: p.image, price: p.price };
  });
}

export async function getProductBySlug(slug: string): Promise<Product> {
  const row = await findProductBySlugOrId(slug, { visibleOnly: true });
  if (!row) {
    throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });
  }
  return toProductDto(row);
}

/** Storefront-visible products flagged `isPopular`. */
export async function getPopularProducts(limit = 8): Promise<Product[]> {
  const { rows } = await queryProducts({ limit: Math.max(limit * 4, 48) } as ProductFiltersInput, { visibleOnly: true });
  return rows.filter((r) => r.isPopular).slice(0, limit).map(toProductDto);
}
/** Storefront-visible products flagged `isEssential` (household-staples rail). */
export async function getEssentialProducts(limit = 8): Promise<Product[]> {
  const { rows } = await queryProducts({ limit: Math.max(limit * 4, 48) } as ProductFiltersInput, { visibleOnly: true });
  return rows.filter((r) => r.isEssential).slice(0, limit).map(toProductDto);
}
/** Storefront-visible products currently carrying a real discount. */
export async function getOfferProducts(limit = 8): Promise<Product[]> {
  const { rows } = await queryProducts(
    { limit: Math.max(limit * 4, 48), sortBy: 'discount' } as ProductFiltersInput,
    { visibleOnly: true },
  );
  return rows
    .filter((r) => r.oldPriceMinor != null && r.oldPriceMinor > r.priceMinor)
    .slice(0, limit)
    .map(toProductDto);
}

/** Batch-fetch products by IDs (for recently-viewed, cart, etc). Storefront-visible only. */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const rows = await findProductsByIds(ids, db(), { visibleOnly: true });
  return rows.map(toProductDto);
}

/**
 * Facet counts for a filter sidebar: how many storefront-visible products EACH category
 * holds under the current search/price/stock/offers/brand filters — the category filter
 * itself is ignored so every category's count reflects switching to it, not the one
 * already selected. Rolls a subcategory's matches up into its parent, same as
 * listCategories/getCategoryRow, so a parent that only groups via children never looks
 * empty. Categories with zero matches are simply absent from the map — callers hide them.
 */
export async function getCategoryFacetCounts(filters: ProductFiltersInput): Promise<Record<string, number>> {
  const [direct, catRows] = await Promise.all([
    countProductsByCategory(filters, { visibleOnly: true }),
    db()
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(and(eq(categories.storeId, DEFAULT_STORE_ID), eq(categories.isActive, true), sql`${categories.deletedAt} IS NULL`)),
  ]);
  const rollup = new Map<string, number>();
  for (const r of catRows) {
    const own = direct.get(r.id) ?? 0;
    if (own) rollup.set(r.id, (rollup.get(r.id) ?? 0) + own);
  }
  for (const r of catRows) {
    if (r.parentId && direct.get(r.id)) {
      rollup.set(r.parentId, (rollup.get(r.parentId) ?? 0) + (direct.get(r.id) ?? 0));
    }
  }
  return Object.fromEntries(rollup);
}

// ---- Categories cache (30s TTL) ----
let _categoriesCache: { data: Category[]; ts: number } | null = null;
const CATEGORIES_CACHE_TTL = 30_000;

/** Invalidate the server-side categories cache (call after create/update/delete). */
export function invalidateCategoriesCache(): void {
  _categoriesCache = null;
}

/** All active categories (parents + children) with a rolled-up product count each. */
export async function listCategories(): Promise<Category[]> {
  if (_categoriesCache && Date.now() - _categoriesCache.ts < CATEGORIES_CACHE_TTL) {
    return _categoriesCache.data;
  }

  const rows = await db()
    .select({
      id: categories.id,
      slug: categories.slug,
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      iconName: categories.iconName,
      image: categories.image,
      colorTheme: categories.colorTheme,
      featured: categories.featured,
      descriptionAr: categories.descriptionAr,
      descriptionEn: categories.descriptionEn,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.storeId, DEFAULT_STORE_ID), eq(categories.isActive, true), sql`${categories.deletedAt} IS NULL`))
    .orderBy(categories.sortOrder);

  const directCounts = await db()
    .select({ categoryId: products.categoryId, count: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        eq(products.storeId, DEFAULT_STORE_ID),
        eq(products.isActive, true),
        eq(products.isVisible, true),
        sql`${products.deletedAt} IS NULL`,
      ),
    )
    .groupBy(products.categoryId);
  const directMap = new Map(directCounts.map((r) => [r.categoryId, r.count]));

  // Rolls a leaf's count up into its parent exactly one hop — same convention as
  // getCategoryFacetCounts, and the reason a department page is never empty even though
  // products only ever attach to a LEAF category, never a parent.
  const rollup = new Map<string, number>();
  for (const r of rows) rollup.set(r.id, directMap.get(r.id) ?? 0);
  for (const r of rows) {
    if (r.parentId) rollup.set(r.parentId, (rollup.get(r.parentId) ?? 0) + (directMap.get(r.id) ?? 0));
  }

  const data = rows.map((r) => toCategoryDto({ ...r, itemCount: rollup.get(r.id) ?? 0 }));
  _categoriesCache = { data, ts: Date.now() };
  return data;
}

  // ---- Admin mutations ----
  
  export async function saveProduct(input: ProductUpsertInput, ctx: RequestContext): Promise<Product> {
  const isNew = !input.id;
  const priceMinor = Money.ofMajor(input.price).minor;
  const oldPriceMinor = input.oldPrice != null ? Money.ofMajor(input.oldPrice).minor : null;
  if (oldPriceMinor != null && oldPriceMinor < priceMinor) {
    throw new ConflictError({
      code: 'INVALID_OLD_PRICE',
      message: { ar: 'السعر القديم يجب أن يكون أكبر من السعر الحالي.', en: 'Old price must be greater than the current price.' },
    });
  }

  const id = input.id ?? prefixedId('prod');
  const slug = input.slug || slugify(input.nameEn || input.nameAr);

  // Captured before the write so a replaced main photo / dropped gallery photo can be
  // deleted from storage afterward — otherwise it sits in the bucket forever unreferenced.
  const before = isNew
    ? { image: null as string | null, galleryUrls: [] as string[] }
    : await (async () => {
        const [p] = await db().select({ image: products.image }).from(products).where(eq(products.id, id)).limit(1);
        const gallery = await db().select({ url: productImages.url }).from(productImages).where(eq(productImages.productId, id));
        return { image: p?.image ?? null, galleryUrls: gallery.map((g) => g.url) };
      })();

  const row = await db().transaction(async (tx) => {
    const values = {
      id,
      sku: input.sku,
      slug,
      nameAr: input.nameAr,
      nameEn: input.nameEn ?? null,
      categoryId: input.categoryId,
      brandAr: input.brandAr ?? null,
      unitAr: input.unitAr,
      unitEn: input.unitEn,
      priceMinor,
      oldPriceMinor,
      image: input.image ?? '',
      descriptionAr: input.descriptionAr ?? '',
      descriptionEn: input.descriptionEn ?? null,
      isPopular: input.isPopular ?? false,
      isEssential: input.isEssential ?? false,
      isActive: input.isActive ?? true,
      isVisible: input.isVisible ?? true,
    };
    const [saved] = isNew
      ? await tx.insert(products).values(values).returning({ id: products.id })
      : await tx
          .update(products)
          .set({ ...values, version: sql`${products.version} + 1` })
          .where(eq(products.id, id))
          .returning({ id: products.id });
    if (!saved) throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });

    // Variants are the stocked units (0007): sync them — and the product's own price/unit
    // from the default one — so the two can never disagree.
    await syncVariants(tx, id, input, ctx);
    await syncImages(tx, id, input);
    return saved;
  });

  // Best-effort storage cleanup, only after the write has committed. Never blocks or
  // fails the save — an orphaned object is a much smaller problem than losing an update.
  const newImage = input.image ?? '';
  if (before.image && before.image !== newImage) void deleteObjectByUrl(before.image);
  if (input.images !== undefined) {
    const kept = new Set(input.images);
    for (const url of before.galleryUrls) if (!kept.has(url)) void deleteObjectByUrl(url);
  }

  await logAudit({
    actorId: ctx.principal?.userId,
    actorName: ctx.principal?.user.name ?? 'system',
    actorRole: 'staff',
    action: 'product_updated',
    resource: 'products',
    resourceId: row.id,
    target: input.nameAr,
    requestId: ctx.requestId,
  });

  return getProductByIdInternal(row.id);
}

/**
 * Keep a product's variants in step with the admin payload:
 *   - no `variants` sent  → single-unit product: ONE default variant mirrors the product's
 *                           sku/unit/price, and `stockQuantity` is that variant's stock;
 *   - `variants` sent     → upsert each (by id when it belongs to this product), exactly one
 *                           default (first flagged, else the first), retire the ones no
 *                           longer listed (isActive=false — order history points at them),
 *                           and copy the default's price/unit/sku onto the product row.
 * Stock per variant follows the same rule as adjustStock: never below what is reserved.
 */
async function syncVariants(tx: Transaction, productId: string, input: ProductUpsertInput, ctx: RequestContext): Promise<void> {
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return;
  const existing = await tx.select().from(productVariants).where(eq(productVariants.productId, productId));

  if (!input.variants || input.variants.length === 0) {
    let def = existing.find((v) => v.isDefault) ?? existing[0];
    if (!def) {
      const id = prefixedId('var');
      await tx.insert(productVariants).values({
        id, productId, sku: product.sku, nameAr: product.unitAr, nameEn: product.unitEn,
        priceMinor: product.priceMinor, oldPriceMinor: product.oldPriceMinor, unitAr: product.unitAr, unitEn: product.unitEn,
        unitValue: product.unitValue, unitMeasure: product.unitMeasure, isActive: true, isDefault: true, sortOrder: 0,
      });
      [def] = await tx.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
    } else {
      // A single-unit product's variant IS the product: mirror price/unit onto it.
      await tx.update(productVariants).set({
        sku: product.sku, nameAr: product.unitAr, nameEn: product.unitEn,
        priceMinor: product.priceMinor, oldPriceMinor: product.oldPriceMinor, unitAr: product.unitAr, unitEn: product.unitEn,
        unitValue: product.unitValue, unitMeasure: product.unitMeasure, isActive: true, isDefault: true,
        version: sql`${productVariants.version} + 1`,
      }).where(eq(productVariants.id, def!.id));
    }
    if (input.stockQuantity !== undefined) await setVariantStock(tx, productId, def!.id, input.stockQuantity, ctx);
    return;
  }

  // Explicit variants. Exactly one default: the first flagged, else the first listed.
  const defaultIndex = Math.max(0, input.variants.findIndex((v) => v.isDefault));
  const keep = new Set<string>();
  // Clear defaults first so the partial unique index never sees two at once.
  await tx.update(productVariants).set({ isDefault: false }).where(eq(productVariants.productId, productId));
  let defaultId = '';
  for (const [i, v] of input.variants.entries()) {
    const oldPriceMinor = v.oldPrice != null ? Money.ofMajor(v.oldPrice).minor : null;
    const values = {
      sku: v.sku, nameAr: v.nameAr, nameEn: v.nameEn ?? null,
      priceMinor: Money.ofMajor(v.price).minor, oldPriceMinor,
      unitAr: v.unitAr ?? v.nameAr, unitEn: v.unitEn ?? v.nameEn ?? v.nameAr,
      unitValue: v.unitValue ?? null, unitMeasure: v.unitMeasure ?? null,
      isActive: v.isActive ?? true, isDefault: i === defaultIndex, sortOrder: v.sortOrder ?? i,
    };
    const own = v.id ? existing.find((e) => e.id === v.id) : undefined;
    let id = own?.id ?? '';
    if (own) {
      await tx.update(productVariants).set({ ...values, version: sql`${productVariants.version} + 1` }).where(eq(productVariants.id, own.id));
    } else {
      id = prefixedId('var');
      await tx.insert(productVariants).values({ id, productId, ...values });
    }
    keep.add(id);
    if (i === defaultIndex) defaultId = id;
    if (v.stockQuantity !== undefined) await setVariantStock(tx, productId, id, v.stockQuantity, ctx);
  }
  // Retire what the admin dropped — never delete: order lines reference variants.
  const dropped = existing.filter((e) => !keep.has(e.id));
  if (dropped.length) {
    await tx.update(productVariants).set({ isActive: false, isDefault: false, version: sql`${productVariants.version} + 1` }).where(inArray(productVariants.id, dropped.map((d) => d.id)));
  }
  // The product row shows the default variant's price/unit/sku (cards, filters, sorting).
  const def = input.variants[defaultIndex]!;
  await tx.update(products).set({
    priceMinor: Money.ofMajor(def.price).minor,
    oldPriceMinor: def.oldPrice != null ? Money.ofMajor(def.oldPrice).minor : null,
    unitAr: def.unitAr ?? def.nameAr, unitEn: def.unitEn ?? def.nameEn ?? def.nameAr,
    unitValue: def.unitValue ?? null, unitMeasure: def.unitMeasure ?? null,
  }).where(eq(products.id, productId));
  void defaultId;
}

/**
 * Extra gallery photos (product detail page). No order history ever points at a gallery
 * photo, so — unlike variants — a plain replace is safe: omitted `images` leaves the
 * existing gallery untouched, an explicit list (including `[]`) fully replaces it.
 */
async function syncImages(tx: Transaction, productId: string, input: ProductUpsertInput): Promise<void> {
  if (input.images === undefined) return;
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  if (input.images.length === 0) return;
  await tx.insert(productImages).values(
    input.images.map((url, i) => ({ id: prefixedId('img'), productId, url, sortOrder: i })),
  );
}

/** Absolute stock for one variant, with the same reserved-quantity floor as adjustStock. */
async function setVariantStock(tx: Transaction, productId: string, variantId: string, quantity: number, ctx: RequestContext): Promise<void> {
  const [inv] = await tx.select().from(inventoryItems).where(eq(inventoryItems.variantId, variantId)).limit(1).for('update');
  if (!inv) {
    await tx.insert(inventoryItems).values({
      id: prefixedId('inv'), productId, variantId, warehouseId: DEFAULT_WAREHOUSE_ID, quantityOnHand: quantity, quantityReserved: 0,
    });
    await tx.insert(stockMovements).values({
      productId, variantId, warehouseId: DEFAULT_WAREHOUSE_ID, type: 'purchase',
      quantityDelta: quantity, reason: 'variant created', actorId: ctx.principal?.userId,
    });
    return;
  }
  // Same rule as inventoryService.adjustStock: never drop on-hand below what is
  // already reserved for open orders (otherwise the DB CHECK fires as a raw 500).
  if (quantity < inv.quantityReserved) {
    throw new BusinessRuleError({
      code: 'STOCK_BELOW_RESERVED',
      message: { ar: 'لا يمكن خفض المخزون دون الكمية المحجوزة.', en: 'Cannot set stock below the reserved quantity.' },
      meta: { reserved: inv.quantityReserved, variantId },
    });
  }
  const delta = quantity - inv.quantityOnHand;
  await tx.update(inventoryItems).set({ quantityOnHand: quantity, version: sql`${inventoryItems.version} + 1` }).where(eq(inventoryItems.id, inv.id));
  if (delta !== 0) {
    await tx.insert(stockMovements).values({
      productId, variantId, warehouseId: inv.warehouseId, type: 'adjustment',
      quantityDelta: delta, reason: 'admin edit', actorId: ctx.principal?.userId,
    });
  }
}

async function getProductByIdInternal(id: string): Promise<Product> {
  const row = await findProductBySlugOrId(id, { visibleOnly: false });
  if (!row) throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });
  return toProductDto(row);
}

/** Soft delete (§4). Keeps historical order references intact. */
export async function deleteProduct(id: string, ctx: RequestContext): Promise<void> {
  const [existing] = await db().select({ id: products.id, nameAr: products.nameAr }).from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw new NotFoundError({ code: 'PRODUCT_NOT_FOUND', message: { ar: 'المنتج غير موجود.', en: 'Product not found.' } });
  await db().update(products).set({ deletedAt: new Date(), isActive: false, isVisible: false }).where(eq(products.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'product_updated', resource: 'products', resourceId: id, target: existing.nameAr, metadata: { op: 'delete' }, requestId: ctx.requestId,
  });
}

/** One category (any state) with its storefront-visible product count, rolled up to
 *  include its subcategories' products (§ subcategories) — same rule as listCategories. */
async function getCategoryRow(id: string): Promise<Category> {
  const [row] = await db().select().from(categories).where(and(eq(categories.id, id), eq(categories.storeId, DEFAULT_STORE_ID))).limit(1);
  if (!row) throw new NotFoundError({ code: 'CATEGORY_NOT_FOUND', message: { ar: 'القسم غير موجود.', en: 'Category not found.' } });
  const children = await db().select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id), sql`${categories.deletedAt} IS NULL`));
  const ids = [id, ...children.map((c) => c.id)];
  const [{ count }] = await db()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(and(inArray(products.categoryId, ids), eq(products.isActive, true), eq(products.isVisible, true), sql`${products.deletedAt} IS NULL`));
  return toCategoryDto({ ...row, itemCount: count } as CategoryRow);
}

/**
 * Enforce exactly two levels (category → subcategory, e.g. "المشروبات" → "مياه"):
 *   - a category cannot be its own parent
 *   - the parent must exist and must itself be top-level (its own parentId is null) —
 *     otherwise this would be a third level
 *   - a category that already has children cannot become a child itself — that would
 *     push its own children to a third level
 * `parentId` here is always non-null (the caller only invokes this when the admin sent
 * a value to set, not clear).
 */
async function validateParentId(id: string, parentId: string, isNew: boolean): Promise<void> {
  if (parentId === id) {
    throw new BusinessRuleError({ code: 'CATEGORY_SELF_PARENT', message: { ar: 'لا يمكن أن يكون القسم أباً لنفسه.', en: 'A category cannot be its own parent.' } });
  }
  const [parent] = await db().select({ id: categories.id, parentId: categories.parentId }).from(categories).where(and(eq(categories.id, parentId), eq(categories.storeId, DEFAULT_STORE_ID), sql`${categories.deletedAt} IS NULL`)).limit(1);
  if (!parent) {
    throw new BusinessRuleError({ code: 'CATEGORY_PARENT_NOT_FOUND', message: { ar: 'القسم الرئيسي المحدد غير موجود.', en: 'The selected parent category does not exist.' } });
  }
  if (parent.parentId) {
    throw new BusinessRuleError({ code: 'CATEGORY_PARENT_TOO_DEEP', message: { ar: 'لا يمكن اختيار قسم فرعي كقسم رئيسي — الأقسام تدعم مستويين فقط.', en: 'A subcategory cannot itself be a parent — only two levels are supported.' } });
  }
  if (!isNew) {
    const [child] = await db().select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id), sql`${categories.deletedAt} IS NULL`)).limit(1);
    if (child) {
      throw new BusinessRuleError({ code: 'CATEGORY_CANNOT_NEST', message: { ar: 'هذا القسم يحتوي على أقسام فرعية بالفعل، لا يمكن جعله تابعاً لقسم آخر.', en: 'This category already has subcategories — it cannot become a subcategory itself.' } });
    }
  }
}

/**
 * Create or update a category. On update only the fields that were sent change — an
 * edit of the name must never silently reset `featured`, the image, or the icon.
 */
export async function saveCategory(input: CategoryUpsertInput, ctx: RequestContext): Promise<Category> {
  const isNew = !input.id;
  const id = input.id ?? prefixedId('cat');
  // A new category derives its slug from the name; an existing one KEEPS its slug unless
  // the admin sends a new one — renaming a category must never break its storefront URL.
  let slug = input.slug || '';
  if (!slug) {
    if (isNew) {
      slug = slugify(input.nameEn || input.nameAr);
    } else {
      const [existing] = await db().select({ slug: categories.slug }).from(categories).where(and(eq(categories.id, id), eq(categories.storeId, DEFAULT_STORE_ID))).limit(1);
      if (!existing) throw new NotFoundError({ code: 'CATEGORY_NOT_FOUND', message: { ar: 'القسم غير موجود.', en: 'Category not found.' } });
      slug = existing.slug;
    }
  }

  // The unique (store, slug) index is the last line of defense; check first so the admin
  // gets a clear 409 instead of a raw constraint error.
  const [clash] = await db()
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.storeId, DEFAULT_STORE_ID), eq(categories.slug, slug), sql`${categories.id} <> ${id}`))
    .limit(1);
  if (clash) {
    throw new ConflictError({ code: 'CATEGORY_SLUG_TAKEN', message: { ar: 'يوجد قسم آخر بنفس المعرّف (slug).', en: 'Another category already uses this slug.' }, meta: { slug } });
  }

  if (input.parentId) await validateParentId(id, input.parentId, isNew);

  if (isNew) {
    await db().insert(categories).values({
      id, slug, nameAr: input.nameAr, nameEn: input.nameEn,
      iconName: input.iconName ?? 'package', colorTheme: input.colorTheme ?? null,
      featured: input.featured ?? false, isActive: input.isActive ?? true,
      image: input.image ?? null, descriptionAr: input.descriptionAr ?? null, descriptionEn: input.descriptionEn ?? null,
      sortOrder: input.sortOrder ?? 0, parentId: input.parentId ?? null,
    });
  } else {
    // Captured before the write so a replaced category photo can be deleted from storage
    // afterward — otherwise it sits in the bucket forever unreferenced.
    const [before] = await db().select({ image: categories.image }).from(categories).where(eq(categories.id, id)).limit(1);
    const patch = {
      slug, nameAr: input.nameAr, nameEn: input.nameEn,
      ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
      ...(input.colorTheme !== undefined ? { colorTheme: input.colorTheme } : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    };
    const updated = await db().update(categories).set(patch).where(and(eq(categories.id, id), eq(categories.storeId, DEFAULT_STORE_ID))).returning({ id: categories.id });
    if (updated.length === 0) throw new NotFoundError({ code: 'CATEGORY_NOT_FOUND', message: { ar: 'القسم غير موجود.', en: 'Category not found.' } });
    // Best-effort; never blocks or fails the save over storage cleanup.
    if (input.image !== undefined && before?.image && before.image !== input.image) void deleteObjectByUrl(before.image);
  }
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'category_updated', resource: 'categories', resourceId: id, target: input.nameAr, metadata: { op: isNew ? 'create' : 'update' }, requestId: ctx.requestId,
  });
  invalidateCategoriesCache();
  return getCategoryRow(id);
}

/**
 * Soft-delete a category. Refused while products still point at it (the FK is RESTRICT,
 * and silently orphaning products would hide them from the store). The slug is released
 * so a category with the same name can be created again later.
 */
export async function deleteCategory(id: string, ctx: RequestContext): Promise<void> {
  const [row] = await db().select().from(categories).where(and(eq(categories.id, id), eq(categories.storeId, DEFAULT_STORE_ID), sql`${categories.deletedAt} IS NULL`)).limit(1);
  if (!row) throw new NotFoundError({ code: 'CATEGORY_NOT_FOUND', message: { ar: 'القسم غير موجود.', en: 'Category not found.' } });
  const [{ count: childCount }] = await db()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(categories)
    .where(and(eq(categories.parentId, id), sql`${categories.deletedAt} IS NULL`));
  if (childCount > 0) {
    throw new BusinessRuleError({
      code: 'CATEGORY_HAS_CHILDREN',
      message: { ar: `لا يمكن حذف القسم لأنه يحتوي على ${childCount} قسم فرعي. احذفها أو انقلها أولًا.`, en: `This category still has ${childCount} subcategory(ies). Delete or move them first.` },
      meta: { childCount },
    });
  }
  const [{ count }] = await db()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(and(eq(products.categoryId, id), sql`${products.deletedAt} IS NULL`));
  if (count > 0) {
    throw new BusinessRuleError({
      code: 'CATEGORY_HAS_PRODUCTS',
      message: { ar: `لا يمكن حذف القسم لأنه يحتوي على ${count} منتج. انقل المنتجات إلى قسم آخر أولًا.`, en: `This category still has ${count} product(s). Move them to another category first.` },
      meta: { count },
    });
  }
  await db()
    .update(categories)
    .set({ isActive: false, deletedAt: new Date(), slug: `${row.slug}__deleted_${id}` })
    .where(eq(categories.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'category_updated', resource: 'categories', resourceId: id, target: row.nameAr, metadata: { op: 'delete' }, requestId: ctx.requestId,
  });
  invalidateCategoriesCache();
}
