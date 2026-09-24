/**
 * Subcategories (category → subcategory, e.g. "المشروبات" → "مياه"/"قهوة"/"شاي"): exactly
 * two levels, product listings/counts roll a subcategory's products up into its parent,
 * and the nesting rules refuse anything that would create a third level.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDb } from '../../db/client';
import { categories, products, inventoryItems, productVariants } from '../../db/schema';
import type { RequestContext } from '../../http/context';
import { withTriggersDisabled } from '../../test/db';
import { catalogService } from '.';

const CTX = { principal: null, requestId: 'test-subcategories' } as unknown as RequestContext;
const F = (over: Record<string, unknown> = {}) => ({ limit: 48, ...over }) as any;

const PARENT_ID = 'cat_sub_parent';
const PARENT_SLUG = 'sub-parent-beverages';
const CHILD_A_ID = 'cat_sub_child_water';
const CHILD_B_ID = 'cat_sub_child_tea';
const OTHER_TOP_ID = 'cat_sub_other_top';
const DIRECT_PRODUCT = 'prod_sub_parent_direct';
const CHILD_PRODUCT = 'prod_sub_child_water';

const BASE_CAT_IDS = [PARENT_ID, CHILD_A_ID, CHILD_B_ID, OTHER_TOP_ID];
const ALL_PRODUCT_IDS = [DIRECT_PRODUCT, CHILD_PRODUCT];
// Extra rows a test creates dynamically (via saveCategory, which always server-generates
// the id on create) get tracked here so afterAll sweeps them up too.
const extraCatIds: string[] = [];

async function reset() {
  await withTriggersDisabled(async (tx) => {
    await tx.delete(inventoryItems).where(inArray(inventoryItems.productId, ALL_PRODUCT_IDS));
    await tx.delete(productVariants).where(inArray(productVariants.productId, ALL_PRODUCT_IDS));
    await tx.delete(products).where(inArray(products.id, ALL_PRODUCT_IDS));
    await tx.delete(categories).where(inArray(categories.id, [...BASE_CAT_IDS, ...extraCatIds]));
  });
}

describe('subcategories (integration)', () => {
  beforeAll(async () => {
    await reset();
    await db().insert(categories).values([
      { id: PARENT_ID, slug: PARENT_SLUG, nameAr: 'المشروبات', nameEn: 'Beverages' },
      { id: CHILD_A_ID, slug: 'sub-child-water', nameAr: 'مياه', nameEn: 'Water', parentId: PARENT_ID },
      { id: CHILD_B_ID, slug: 'sub-child-tea', nameAr: 'شاي', nameEn: 'Tea', parentId: PARENT_ID },
      { id: OTHER_TOP_ID, slug: 'sub-other-top', nameAr: 'قسم آخر', nameEn: 'Other top' },
    ]);
  });
  afterAll(async () => {
    await reset();
    await closeDb();
  });

  it('nesting rules: two levels only, and a parent with children cannot become one', async () => {
    // Creating a new subcategory persists parentId.
    const created = await catalogService.saveCategory({ nameAr: 'مشروبات غازية', nameEn: 'Soda', parentId: PARENT_ID }, CTX);
    expect(created.parentId).toBe(PARENT_ID);
    extraCatIds.push(created.id);

    // A category cannot be its own parent.
    await expect(catalogService.saveCategory({ id: PARENT_ID, nameAr: 'المشروبات', nameEn: 'Beverages', parentId: PARENT_ID }, CTX)).rejects.toMatchObject({ code: 'CATEGORY_SELF_PARENT' });

    // The referenced parent must exist.
    await expect(catalogService.saveCategory({ nameAr: 'قسم', nameEn: 'Cat', parentId: 'cat_sub_does_not_exist' }, CTX)).rejects.toMatchObject({ code: 'CATEGORY_PARENT_NOT_FOUND' });

    // Nesting under a subcategory (a third level) is refused.
    await expect(catalogService.saveCategory({ nameAr: 'قسم', nameEn: 'Cat', parentId: CHILD_A_ID }, CTX)).rejects.toMatchObject({ code: 'CATEGORY_PARENT_TOO_DEEP' });

    // A category that already has children cannot itself become a child.
    await expect(catalogService.saveCategory({ id: PARENT_ID, nameAr: 'المشروبات', nameEn: 'Beverages', parentId: OTHER_TOP_ID }, CTX)).rejects.toMatchObject({ code: 'CATEGORY_CANNOT_NEST' });
  });

  it('product listings and item counts roll a subcategory up into its parent', async () => {
    await db().insert(products).values([
      { id: DIRECT_PRODUCT, sku: 'SUB-DIRECT', slug: DIRECT_PRODUCT, nameAr: 'منتج مباشر', categoryId: PARENT_ID, unitAr: '1', unitEn: '1', priceMinor: 1000, isActive: true, isVisible: true },
      { id: CHILD_PRODUCT, sku: 'SUB-CHILD', slug: CHILD_PRODUCT, nameAr: 'مياه معدنية', categoryId: CHILD_A_ID, unitAr: '1', unitEn: '1', priceMinor: 500, isActive: true, isVisible: true },
    ]);
    await db().insert(productVariants).values([
      { id: `var_${DIRECT_PRODUCT}`, productId: DIRECT_PRODUCT, sku: 'SUB-DIRECT', nameAr: '1', priceMinor: 1000, isActive: true, isDefault: true },
      { id: `var_${CHILD_PRODUCT}`, productId: CHILD_PRODUCT, sku: 'SUB-CHILD', nameAr: '1', priceMinor: 500, isActive: true, isDefault: true },
    ]);
    await db().insert(inventoryItems).values([
      { id: `inv_${DIRECT_PRODUCT}`, productId: DIRECT_PRODUCT, variantId: `var_${DIRECT_PRODUCT}`, quantityOnHand: 5, quantityReserved: 0 },
      { id: `inv_${CHILD_PRODUCT}`, productId: CHILD_PRODUCT, variantId: `var_${CHILD_PRODUCT}`, quantityOnHand: 5, quantityReserved: 0 },
    ]);

    // Browsing the PARENT (by id or slug) returns its own product AND the child's.
    const byParentId = await catalogService.getProducts(F({ categoryId: PARENT_ID }));
    expect(byParentId.items.map((p) => p.id).sort()).toEqual([CHILD_PRODUCT, DIRECT_PRODUCT].sort());
    const byParentSlug = await catalogService.getProducts(F({ categoryId: PARENT_SLUG }));
    expect(byParentSlug.items.map((p) => p.id).sort()).toEqual([CHILD_PRODUCT, DIRECT_PRODUCT].sort());

    // Browsing a CHILD directly returns only its own product.
    const byChild = await catalogService.getProducts(F({ categoryId: CHILD_A_ID }));
    expect(byChild.items.map((p) => p.id)).toEqual([CHILD_PRODUCT]);
    // A sibling with no products of its own shows none of the parent's or the other child's.
    const bySibling = await catalogService.getProducts(F({ categoryId: CHILD_B_ID }));
    expect(bySibling.items).toEqual([]);

    // listCategories() rolls the child's count into the parent's.
    const cats = await catalogService.listCategories();
    expect(cats.find((c) => c.id === PARENT_ID)?.itemCount).toBe(2);
    expect(cats.find((c) => c.id === CHILD_A_ID)?.itemCount).toBe(1);
    expect(cats.find((c) => c.id === CHILD_B_ID)?.itemCount).toBe(0);

    // saveCategory's returned row (getCategoryRow) rolls up the same way.
    const savedParent = await catalogService.saveCategory({ id: PARENT_ID, nameAr: 'المشروبات', nameEn: 'Beverages' }, CTX);
    expect(savedParent.itemCount).toBe(2);
  });

  it('a subcategory can be cleared back to top-level', async () => {
    const cleared = await catalogService.saveCategory({ id: CHILD_B_ID, nameAr: 'شاي', nameEn: 'Tea', parentId: null }, CTX);
    expect(cleared.parentId).toBeUndefined();
    const [row] = await db().select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, CHILD_B_ID)).limit(1);
    expect(row?.parentId).toBeNull();
  });

  it('deleting a parent is refused while subcategories remain', async () => {
    await expect(catalogService.deleteCategory(PARENT_ID, CTX)).rejects.toMatchObject({ code: 'CATEGORY_HAS_CHILDREN' });

    // Remove every leftover subcategory (the dynamically-created one, and CHILD_A — CHILD_B
    // was already cleared to top-level above) and every product, then the parent can go.
    await withTriggersDisabled(async (tx) => {
      await tx.delete(categories).where(inArray(categories.id, extraCatIds));
    });
    await db().update(products).set({ deletedAt: new Date(), isActive: false, isVisible: false }).where(inArray(products.id, ALL_PRODUCT_IDS));
    await catalogService.deleteCategory(CHILD_A_ID, CTX);
    await catalogService.deleteCategory(PARENT_ID, CTX);

    const cats = await catalogService.listCategories();
    expect(cats.some((c) => c.id === PARENT_ID)).toBe(false);
    expect(cats.some((c) => c.id === CHILD_A_ID)).toBe(false);
  });
});
