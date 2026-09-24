/**
 * Catalog input schemas. `productFiltersSchema` mirrors the prototype's ProductFilters
 * contract exactly so productService.getProducts keeps its shape. All coercions are
 * strict and bounded (§14, §25).
 */
import { z } from 'zod';
import { MAX_PAGE_SIZE } from '../../lib/pagination';

export const productSortEnum = z.enum(['popular', 'price_low', 'price_high', 'newest', 'discount', 'rating']);

/**
 * `z.coerce.boolean()` runs JS's `Boolean(x)` on the raw value — which makes the STRING
 * "false" (exactly what a query param `?offersOnly=false` arrives as) coerce to `true`,
 * silently inverting the filter. Every boolean query filter must go through this instead.
 */
const queryBoolean = z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v), z.boolean());

export const productFiltersSchema = z
  .object({
    categoryId: z.string().max(64).optional(),
    searchQuery: z.string().trim().max(120).optional(),
    minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
    maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
    inStockOnly: queryBoolean.optional(),
    offersOnly: queryBoolean.optional(),
    lowStockOnly: queryBoolean.optional(),
    brand: z.string().max(120).optional(),
    sortBy: productSortEnum.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(48),
    cursor: z.string().max(512).optional(),
  })
  .strict();

export type ProductFiltersInput = z.infer<typeof productFiltersSchema>;

/** Search autocomplete (§15). Small, bounded result of lightweight suggestions. */
export const suggestSchema = z
  .object({
    q: z.string().trim().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(10).default(6),
  })
  .strict();

export type SuggestInput = z.infer<typeof suggestSchema>;

const money = z.number().min(0).max(1_000_000);

/** Admin product upsert. Prices are MAJOR units on the wire, converted to minor server-side. */
export const productUpsertSchema = z
  .object({
    id: z.string().max(64).optional(),
    sku: z.string().trim().min(1).max(64),
    slug: z.string().trim().max(160).optional(),
    nameAr: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().max(200).optional(),
    categoryId: z.string().min(1).max(64),
    brandAr: z.string().max(120).optional(),
    unitAr: z.string().min(1).max(80),
    unitEn: z.string().min(1).max(80),
    price: money,
    oldPrice: money.optional(),
    image: z.string().url().max(1000).optional(),
    /** Extra gallery photos for the product detail page (§ product gallery). Omitted ⇒ leave as-is. */
    images: z.array(z.string().url().max(1000)).max(8).optional(),
    descriptionAr: z.string().max(5000).optional(),
    descriptionEn: z.string().max(5000).optional(),
    isPopular: z.boolean().optional(),
    isEssential: z.boolean().optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    stockQuantity: z.number().int().min(0).max(1_000_000).optional(),
    /**
     * Sellable units (piece / box / weight). Omitted ⇒ the product stays single-unit and
     * its one default variant mirrors the product price/unit/stock above. Variants not
     * listed on a later save are retired (never deleted — order history points at them).
     */
    variants: z.array(z.lazy(() => variantUpsertSchema)).max(50).optional(),
  })
  .strict();

export const variantUpsertSchema = z
  .object({
    id: z.string().max(64).optional(),
    sku: z.string().trim().min(1).max(64),
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().max(120).optional(),
    unitAr: z.string().trim().max(80).optional(),
    unitEn: z.string().trim().max(80).optional(),
    unitValue: z.number().min(0).max(100000).optional(),
    unitMeasure: z.enum(['L', 'ml', 'kg', 'g', 'pc']).optional(),
    price: money,
    oldPrice: money.optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    stockQuantity: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export type ProductUpsertInput = z.infer<typeof productUpsertSchema>;
export type VariantUpsertInput = z.infer<typeof variantUpsertSchema>;

export const categoryUpsertSchema = z
  .object({
    id: z.string().max(64).optional(),
    slug: z.string().trim().max(120).optional(),
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    iconName: z.string().max(60).optional(),
    colorTheme: z.string().max(20).optional(),
    featured: z.boolean().optional(),
    isActive: z.boolean().optional(),
    /** Uploaded image URL (via /admin/uploads); `null` clears it. Data URLs are too long on purpose. */
    image: z.string().url().max(1000).nullable().optional(),
    descriptionAr: z.string().trim().max(2000).nullable().optional(),
    descriptionEn: z.string().trim().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    /** Parent category id, for a subcategory (e.g. "مياه" under "المشروبات"). `null`
     *  clears it back to top-level. Two levels only — enforced in the service, not here. */
    parentId: z.string().max(64).nullable().optional(),
  })
  .strict();

export type CategoryUpsertInput = z.infer<typeof categoryUpsertSchema>;
