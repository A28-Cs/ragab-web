import { describe, it, expect, afterAll } from 'vitest';
import { catalogService } from '.';
import { closeDb } from '../../db/client';

const F = (over: any = {}) => ({ limit: 48, ...over });

describe('catalog (integration, seeded DB)', () => {
  afterAll(() => closeDb());

  it('lists visible products with derived fields', async () => {
    const page = await catalogService.getProducts(F());
    expect(page.items.length).toBeGreaterThan(0);
    // §catalog import: the default sort is newest-first, and the catalog import (§catalog
    // import) added thousands of newer rows, so the seeded oil is no longer on page 1 of a
    // plain listing. getProductBySlug is the order-independent way to fetch it directly.
    const oil = await catalogService.getProductBySlug('crystal-sunflower-oil-1-5l');
    expect(oil).toBeTruthy();
    expect(oil.price).toBe(95); // 9500 minor -> 95 EGP
    expect(oil.oldPrice).toBe(110);
    expect(oil.discountPercentage).toBe(14); // round((110-95)/110*100)
    expect(oil.inStock).toBe(true);
    expect(oil.stockQuantity).toBeGreaterThan(0);
    expect(oil.categoryNameAr).toBe('الصيدلية والتموين');
  });

  it('filters by category, rolling up subcategories under the parent', async () => {
    // §catalog import gave cat_dairy real subcategories (المياه/الجبن/اللبن/...), and
    // buildConditions deliberately rolls a parent's filter up over its children — so a
    // product's own categoryId is now the LEAF it was imported into, not necessarily
    // 'cat_dairy' itself. Assert against the parent chain instead of exact equality.
    const cats = await catalogService.listCategories();
    const dairyAndChildren = new Set(
      cats.filter((c) => c.id === 'cat_dairy' || c.parentId === 'cat_dairy').map((c) => c.id),
    );
    const page = await catalogService.getProducts(F({ categoryId: 'cat_dairy' }));
    expect(page.items.every((p) => dairyAndChildren.has(p.categoryId))).toBe(true);
    expect(page.items.length).toBeGreaterThanOrEqual(2);
  });

  it('Arabic full-text search finds a product by name', async () => {
    const page = await catalogService.getProducts(F({ searchQuery: 'حليب' }));
    expect(page.items.some((p) => p.nameAr.includes('حليب'))).toBe(true);
  });

  it('search matches by category name (8-field parity)', async () => {
    const page = await catalogService.getProducts(F({ searchQuery: 'الألبان' }));
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('offersOnly returns only discounted products', async () => {
    const page = await catalogService.getProducts(F({ offersOnly: true }));
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((p) => p.oldPrice && p.oldPrice > p.price)).toBe(true);
  });

  it('price sort ascending', async () => {
    const page = await catalogService.getProducts(F({ sortBy: 'price_low' }));
    const prices = page.items.map((p) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('getProductBySlug returns one product; unknown slug 404s', async () => {
    const p = await catalogService.getProductBySlug('egyptian-rice-5kg');
    expect(p.nameAr).toContain('أرز');
    await expect(catalogService.getProductBySlug('does-not-exist')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('lists categories with item counts', async () => {
    const cats = await catalogService.listCategories();
    // §catalog import replaced the flat 8-category demo set with the owner's 25-parent /
    // ~91-subcategory taxonomy (116 rows) — assert the shape, not a number that was only ever
    // true of the pre-import demo seed.
    expect(cats.length).toBeGreaterThanOrEqual(116);
    expect(cats.filter((c) => !c.parentId).length).toBe(25);
    const groceries = cats.find((c) => c.slug === 'groceries');
    expect(groceries!.itemCount).toBeGreaterThan(0);
  });
});
