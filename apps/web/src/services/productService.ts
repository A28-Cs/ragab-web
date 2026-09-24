/**
 * Product service — now backed by the real API at /api/v1 (was in-memory mock).
 * The exported signatures are UNCHANGED so callers keep working; only the data source
 * moved to the server, which is authoritative for price, stock and the derived fields.
 * The optional `perms` argument on admin mutations is kept for source compatibility but
 * is ignored here — authorization is enforced server-side.
 */
import { Product, PermissionKey } from '../types';
import { api, type PageResult } from '../lib/apiClient';
import { fetchAllPages } from '../lib/pageWalker';

export interface ProductFilters {
  categoryId?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  offersOnly?: boolean;
  lowStockOnly?: boolean;
  brand?: string;
  sortBy?: 'popular' | 'price_low' | 'price_high' | 'newest' | 'discount' | 'rating';
}

/**
 * Control-center listing (`products:view`): the same filters WITHOUT the storefront
 * visibility filter, so staff see hidden/inactive products too. Walks every page —
 * only for callers that need the WHOLE catalog in memory (a picker, a CSV export).
 * The products table itself uses `getAdminProductsPage` below instead: with 6,400+
 * real products, walking every page just to render one table is what made that page
 * slow — see AC "control-center product list stays fast at catalog scale".
 */
export const getAdminProducts = async (filters?: ProductFilters): Promise<Product[]> =>
  fetchAllPages<Product>(
    '/admin/products',
    {
      categoryId: filters?.categoryId,
      searchQuery: filters?.searchQuery,
      sortBy: filters?.sortBy,
    },
    // Default maxPages (50 × 100 = 5,000) undercuts the imported catalog (6,400+ products);
    // raise the bound so the walk still reaches the end instead of silently truncating.
    { maxPages: 200 },
  );

/** One page of the control-center listing — search/category filter and paging happen on the server. */
export const getAdminProductsPage = async (
  filters: ProductFilters & { cursor?: string; limit?: number } = {},
): Promise<PageResult<Product>> =>
  api.get<PageResult<Product>>('/admin/products', {
    categoryId: filters.categoryId,
    searchQuery: filters.searchQuery,
    sortBy: filters.sortBy,
    lowStockOnly: filters.lowStockOnly,
    cursor: filters.cursor,
    limit: filters.limit ?? 20,
  });

export const getProducts = async (filters?: ProductFilters, signal?: AbortSignal): Promise<Product[]> => {
  const page = await api.get<PageResult<Product>>('/products', {
    categoryId: filters?.categoryId,
    searchQuery: filters?.searchQuery,
    minPrice: filters?.minPrice,
    maxPrice: filters?.maxPrice,
    inStockOnly: filters?.inStockOnly,
    offersOnly: filters?.offersOnly,
    brand: filters?.brand,
    sortBy: filters?.sortBy,
    limit: 100,
  }, signal);
  return page.items;
};

/**
 * Facet counts for the filter sidebar: how many results EACH category has under the
 * given filters (category filter itself ignored server-side, so every category's count
 * reflects switching to it). Categories with zero matches are simply absent from the map.
 */
export const getCategoryFacetCounts = async (filters?: ProductFilters): Promise<Record<string, number>> =>
  api.get<Record<string, number>>('/products/category-counts', {
    categoryId: filters?.categoryId,
    searchQuery: filters?.searchQuery,
    minPrice: filters?.minPrice,
    maxPrice: filters?.maxPrice,
    inStockOnly: filters?.inStockOnly,
    offersOnly: filters?.offersOnly,
    brand: filters?.brand,
  });

export const getProductBySlug = async (slug: string): Promise<Product | null> => {
  try {
    return await api.get<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
};

export const getProductById = async (id: string): Promise<Product | null> => getProductBySlug(id);

export const getPopularProducts = async (limit = 8): Promise<Product[]> => api.get<Product[]>('/products/popular', { limit });
export const getEssentialProducts = async (limit = 8): Promise<Product[]> => api.get<Product[]>('/products/essential', { limit });
export const getOfferProducts = async (limit = 8): Promise<Product[]> => api.get<Product[]>('/products/offers', { limit });

/** Batch-fetch products by IDs (for recently-viewed, wishlists, etc). */
export const getProductsByIds = async (ids: string[]): Promise<Product[]> => {
  if (ids.length === 0) return [];
  return api.get<Product[]>('/products/by-ids', { ids: ids.join(',') });
};

export const saveProduct = async (product: Product, _perms?: Set<PermissionKey>): Promise<Product> => {
  const payload = {
    // `??` would keep an empty-string slug (the default for a brand-new product) instead of falling through.
    sku: (product as { sku?: string }).sku || product.slug || product.nameAr,
    slug: product.slug,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    categoryId: product.categoryId,
    brandAr: product.brandAr,
    unitAr: product.unitAr,
    unitEn: product.unitEn,
    price: product.price,
    oldPrice: product.oldPrice,
    image: product.image || undefined,
    // The admin wizard always carries a concrete array (possibly empty); omitted only when
    // a caller never loaded `images` at all, so it can't wipe the gallery by accident.
    images: product.images,
    descriptionAr: product.descriptionAr,
    descriptionEn: product.descriptionEn,
    isPopular: product.isPopular,
    isEssential: product.isEssential,
    // With explicit units the product-level stock is derived from the default unit.
    stockQuantity: product.variants ? undefined : product.stockQuantity,
    ...(product.variants
      ? {
          variants: product.variants.map((v, i) => ({
            id: v.id || undefined,
            sku: v.sku,
            nameAr: v.nameAr,
            nameEn: v.nameEn || undefined,
            unitAr: v.unitAr || undefined,
            unitEn: v.unitEn || undefined,
            price: v.price,
            oldPrice: v.oldPrice,
            stockQuantity: v.stockQuantity,
            isDefault: v.isDefault,
            isActive: v.isActive,
            sortOrder: v.sortOrder ?? i,
          })),
        }
      : {}),
  };
  if (product.id) return api.patch<Product>(`/products/${encodeURIComponent(product.id)}`, payload);
  return api.post<Product>('/products', payload);
};

export const deleteProduct = async (id: string, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.del(`/products/${encodeURIComponent(id)}`);
};

/** Absolute stock for one unit; `variantId` omitted ⇒ the product's default unit. */
export const updateStock = async (id: string, quantity: number, _perms?: Set<PermissionKey>, variantId?: string): Promise<void> => {
  await api.post(`/admin/inventory/${encodeURIComponent(id)}/adjust`, { quantity, reason: 'admin stock update', ...(variantId ? { variantId } : {}) });
};
