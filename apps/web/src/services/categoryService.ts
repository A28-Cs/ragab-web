/**
 * Category service — backed by the API. Create = POST /categories, edit = PATCH
 * /categories/:id, delete = DELETE /categories/:id (soft; refused while products still
 * belong to the category). `perms` is ignored — the server enforces authorization.
 */
import { Category, PermissionKey } from '../types';
import { api } from '../lib/apiClient';

let _categoriesCache: { promise: Promise<Category[]>; ts: number } | null = null;
const CATEGORIES_TTL = 30_000; // 30 seconds

export const getCategories = async (): Promise<Category[]> => {
  const now = Date.now();
  if (_categoriesCache && now - _categoriesCache.ts < CATEGORIES_TTL) {
    return _categoriesCache.promise;
  }
  const promise = api.get<Category[]>('/categories');
  _categoriesCache = { promise, ts: now };
  // Clear cache on failure so the next caller retries
  promise.catch(() => { _categoriesCache = null; });
  return promise;
};

/** Force-clear the categories cache (call after create/update/delete). */
export function invalidateCategoriesCache(): void {
  _categoriesCache = null;
}

export const getCategoryBySlug = async (slug: string): Promise<Category | null> => {
  const list = await getCategories();
  return list.find((c) => c.slug === slug || c.id === slug) || null;
};

export const getCategoryById = async (id: string): Promise<Category | null> => {
  const list = await getCategories();
  return list.find((c) => c.id === id) || null;
};

export const saveCategory = async (category: Category, _perms?: Set<PermissionKey>): Promise<Category> => {
  const payload = {
    // Blank slug → the server derives one from the name.
    slug: category.slug || undefined,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    iconName: category.iconName,
    colorTheme: category.colorTheme,
    featured: !!category.featured,
    // `null` clears an image/description; the uploaded URL persists it.
    image: category.image || null,
    descriptionAr: category.descriptionAr || null,
    descriptionEn: category.descriptionEn || null,
    // `undefined` leaves it unchanged; `null` moves a subcategory back to top-level.
    parentId: category.parentId ?? null,
  };
  const result = await (category.id
    ? api.patch<Category>(`/categories/${encodeURIComponent(category.id)}`, payload)
    : api.post<Category>('/categories', payload));
  invalidateCategoriesCache();
  return result;
};

export const deleteCategory = async (id: string, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.del<{ deleted: boolean }>(`/categories/${encodeURIComponent(id)}`);
  invalidateCategoriesCache();
};
