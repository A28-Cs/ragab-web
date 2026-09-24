import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, closeDb } from '../../db/client';
import { categories, products, inventoryItems, stockMovements, productVariants } from '../../db/schema';
import type { RequestContext } from '../../http/context';
import { withTriggersDisabled } from '../../test/db';
import { catalogService } from '.';

/** Admin services only read the actor + request id off the context. */
const CTX = { principal: null, requestId: 'test-category-admin' } as unknown as RequestContext;
const F = (over: Record<string, unknown> = {}) => ({ limit: 48, ...over }) as any;

const CAT_ID = 'cat_admin_test';
const CAT_SLUG = 'admin-test-category';
const VISIBLE = 'prod_admin_visible';
const HIDDEN = 'prod_admin_hidden';

async function reset() {
  await withTriggersDisabled(async (tx) => {
    await tx.delete(stockMovements).where(inArray(stockMovements.productId, [VISIBLE, HIDDEN]));
    await tx.delete(inventoryItems).where(inArray(inventoryItems.productId, [VISIBLE, HIDDEN]));
    // Triggers are disabled here, so the FK cascade does not run — delete variants explicitly.
    await tx.delete(productVariants).where(inArray(productVariants.productId, [VISIBLE, HIDDEN]));
    await tx.delete(products).where(inArray(products.id, [VISIBLE, HIDDEN]));
    await tx.delete(categories).where(inArray(categories.id, [CAT_ID, 'cat_admin_test_2']));
    await tx.delete(categories).where(eq(categories.slug, CAT_SLUG));
  });
}

describe('category admin + counter parity (integration)', () => {
  beforeAll(async () => {
    await reset();
    await db().insert(categories).values({ id: CAT_ID, slug: CAT_SLUG, nameAr: 'قسم اختبار', nameEn: 'Test category', featured: true, image: 'https://cdn.example/cat.png' });
    await db().insert(products).values([
      { id: VISIBLE, sku: 'ADM-VIS', slug: VISIBLE, nameAr: 'ظاهر', categoryId: CAT_ID, unitAr: '1', unitEn: '1', priceMinor: 1000, isActive: true, isVisible: true },
      { id: HIDDEN, sku: 'ADM-HID', slug: HIDDEN, nameAr: 'مخفي', categoryId: CAT_ID, unitAr: '1', unitEn: '1', priceMinor: 1000, isActive: true, isVisible: false },
    ]);
    // Stock lives on the default variant (0007).
    await db().insert(productVariants).values([
      { id: `var_${VISIBLE}`, productId: VISIBLE, sku: 'ADM-VIS', nameAr: '1', priceMinor: 1000, isActive: true, isDefault: true },
      { id: `var_${HIDDEN}`, productId: HIDDEN, sku: 'ADM-HID', nameAr: '1', priceMinor: 1000, isActive: true, isDefault: true },
    ]);
    await db().insert(inventoryItems).values([
      { id: `inv_${VISIBLE}`, productId: VISIBLE, variantId: `var_${VISIBLE}`, quantityOnHand: 5, quantityReserved: 0 },
      { id: `inv_${HIDDEN}`, productId: HIDDEN, variantId: `var_${HIDDEN}`, quantityOnHand: 5, quantityReserved: 0 },
    ]);
  });
  afterAll(async () => {
    await reset();
    await closeDb();
  });

  it('the category counter equals the rows the category page shows (hidden products count in neither)', async () => {
    const cats = await catalogService.listCategories();
    const cat = cats.find((c) => c.id === CAT_ID)!;
    const byId = await catalogService.getProducts(F({ categoryId: CAT_ID }));
    expect(cat.itemCount).toBe(1);
    expect(byId.items.map((p) => p.id)).toEqual([VISIBLE]);
    expect(byId.items.length).toBe(cat.itemCount);
  });

  it('filtering by the category SLUG returns exactly the same rows as filtering by id', async () => {
    const byId = await catalogService.getProducts(F({ categoryId: CAT_ID }));
    const bySlug = await catalogService.getProducts(F({ categoryId: CAT_SLUG }));
    expect(bySlug.items.map((p) => p.id)).toEqual(byId.items.map((p) => p.id));
  });

  it('the control-center listing still shows the hidden product', async () => {
    const admin = await catalogService.listProductsAdmin(F({ categoryId: CAT_ID }));
    expect(admin.items.map((p) => p.id).sort()).toEqual([HIDDEN, VISIBLE].sort());
  });

  it('editing a category name keeps featured + image, and a taken slug is a clear 409', async () => {
    const edited = await catalogService.saveCategory({ id: CAT_ID, nameAr: 'قسم معدّل', nameEn: 'Edited' }, CTX);
    expect(edited.nameAr).toBe('قسم معدّل');
    expect(edited.featured).toBe(true);
    expect(edited.image).toBe('https://cdn.example/cat.png');
    expect(edited.itemCount).toBe(1);

    // Another category cannot take this slug.
    await expect(catalogService.saveCategory({ nameAr: 'آخر', nameEn: 'Other', slug: CAT_SLUG }, CTX)).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN', httpStatus: 409 });
    // Clearing the image with null persists.
    const cleared = await catalogService.saveCategory({ id: CAT_ID, nameAr: 'قسم معدّل', nameEn: 'Edited', image: null }, CTX);
    expect(cleared.image).toBeUndefined();
  });

  it('delete is refused while products remain, then succeeds and frees the slug', async () => {
    await expect(catalogService.deleteCategory(CAT_ID, CTX)).rejects.toMatchObject({ code: 'CATEGORY_HAS_PRODUCTS', httpStatus: 422 });

    // Soft-delete both products, then the category can go.
    await db().update(products).set({ deletedAt: new Date(), isActive: false, isVisible: false }).where(inArray(products.id, [VISIBLE, HIDDEN]));
    await catalogService.deleteCategory(CAT_ID, CTX);
    const cats = await catalogService.listCategories();
    expect(cats.some((c) => c.id === CAT_ID)).toBe(false);

    // The slug is reusable by a brand-new category.
    const again = await catalogService.saveCategory({ nameAr: 'قسم جديد', nameEn: 'New', slug: CAT_SLUG }, CTX);
    expect(again.slug).toBe(CAT_SLUG);
    await withTriggersDisabled(async (tx) => {
      await tx.delete(categories).where(and(eq(categories.slug, CAT_SLUG), eq(categories.id, again.id)));
    });
    // Deleting a missing category is a 404.
    await expect(catalogService.deleteCategory(CAT_ID, CTX)).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });
});
