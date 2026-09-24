/**
 * Catalog mappers. The DERIVED fields the prototype computed client-side move here:
 *   inStock            = available > 0
 *   discountPercentage = round((old - price) / old * 100)
 * Money projects from minor units. `stockQuantity` exposes AVAILABLE (on_hand minus
 * reserved) so the storefront never offers already-reserved units.
 */
import { Money } from '../../lib/money';
import { toLegacyTimestamp } from '../../lib/clock';
import type { Category, Product, ProductVariant } from '../../types';

/** A product's sellable unit + its available stock (migration 0007). */
export interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  nameAr: string;
  nameEn: string | null;
  priceMinor: number;
  oldPriceMinor: number | null;
  unitAr: string | null;
  unitEn: string | null;
  unitValue: number | null;
  unitMeasure: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  available: number;
}

export function toVariantDto(v: VariantRow): ProductVariant {
  const available = Math.max(0, v.available);
  return {
    id: v.id,
    sku: v.sku,
    nameAr: v.nameAr,
    nameEn: v.nameEn ?? undefined,
    unitAr: v.unitAr ?? undefined,
    unitEn: v.unitEn ?? undefined,
    unitValue: v.unitValue ?? undefined,
    unitMeasure: (v.unitMeasure as ProductVariant['unitMeasure']) ?? undefined,
    price: Money.ofMinor(v.priceMinor).toMajor(),
    oldPrice: v.oldPriceMinor != null ? Money.ofMinor(v.oldPriceMinor).toMajor() : undefined,
    discountPercentage:
      v.oldPriceMinor != null && v.oldPriceMinor > v.priceMinor ? Math.round(((v.oldPriceMinor - v.priceMinor) / v.oldPriceMinor) * 100) : undefined,
    inStock: available > 0,
    stockQuantity: available,
    isActive: v.isActive,
    isDefault: v.isDefault,
    sortOrder: v.sortOrder,
  };
}

export interface ProductRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  categoryId: string;
  categoryNameAr: string;
  categoryNameEn: string | null;
  brandAr: string | null;
  brandEn: string | null;
  unitAr: string;
  unitEn: string;
  priceMinor: number;
  oldPriceMinor: number | null;
  image: string;
  descriptionAr: string;
  descriptionEn: string | null;
  originAr: string | null;
  isPopular: boolean;
  isEssential: boolean;
  isNew: boolean;
  badgeAr: string | null;
  badgeEn: string | null;
  tags: string[] | null;
  rating: number | null;
  reviewCount: number;
  unitValue: number | null;
  unitMeasure: string | null;
  lowStockThreshold: number;
  available: number;
  createdAt: Date;
  /**
   * Full microsecond-precision text of `createdAt`, straight from Postgres — the driver
   * parses `timestamptz` into a JS `Date`, which only holds millisecond precision, so
   * round-tripping a cursor through `Date` silently truncates it and can misplace a row
   * relative to same-millisecond siblings (common after a bulk import). Cursor encoding
   * uses this raw string instead; `createdAt`/`createdAtIso` stay millisecond-precision
   * for display, which is fine there.
   */
  createdAtRaw: string;
  /** Attached by the repository (one extra query per page, never N+1). */
  variants?: VariantRow[];
  /** Extra gallery photo URLs, sorted. Attached by the repository like variants. */
  images?: string[];
}

export function toProductDto(row: ProductRow): Product {
  const price = Money.ofMinor(row.priceMinor).toMajor();
  const oldPrice = row.oldPriceMinor != null ? Money.ofMinor(row.oldPriceMinor).toMajor() : undefined;
  const discountPercentage =
    row.oldPriceMinor != null && row.oldPriceMinor > row.priceMinor
      ? Math.round(((row.oldPriceMinor - row.priceMinor) / row.oldPriceMinor) * 100)
      : undefined;
  const available = Math.max(0, row.available);

  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn ?? undefined,
    categoryId: row.categoryId,
    categoryNameAr: row.categoryNameAr,
    categoryNameEn: row.categoryNameEn ?? undefined,
    brandAr: row.brandAr ?? undefined,
    brandEn: row.brandEn ?? undefined,
    unitAr: row.unitAr,
    unitEn: row.unitEn,
    price,
    oldPrice,
    discountPercentage,
    inStock: available > 0,
    stockQuantity: available,
    image: row.image,
    images: row.images && row.images.length > 0 ? row.images : undefined,
    badgeAr: row.badgeAr ?? undefined,
    badgeEn: row.badgeEn ?? undefined,
    isPopular: row.isPopular,
    isEssential: row.isEssential,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn ?? undefined,
    originAr: row.originAr ?? undefined,
    rating: row.rating ?? undefined,
    reviewCount: row.reviewCount,
    unitValue: row.unitValue ?? undefined,
    unitMeasure: (row.unitMeasure as Product['unitMeasure']) ?? undefined,
    lowStockThreshold: row.lowStockThreshold,
    tags: row.tags ?? undefined,
    isNew: row.isNew,
    createdAtIso: row.createdAt.toISOString(),
    variants: row.variants?.map(toVariantDto),
    defaultVariantId: row.variants?.find((v) => v.isDefault)?.id,
  };
}

export interface CategoryRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  image: string | null;
  colorTheme: string | null;
  featured: boolean;
  descriptionAr: string | null;
  descriptionEn: string | null;
  itemCount: number;
  parentId?: string | null;
}

export function toCategoryDto(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    iconName: row.iconName,
    itemCount: row.itemCount,
    featured: row.featured,
    image: row.image ?? undefined,
    colorTheme: (row.colorTheme as Category['colorTheme']) ?? undefined,
    descriptionAr: row.descriptionAr ?? undefined,
    descriptionEn: row.descriptionEn ?? undefined,
    parentId: row.parentId ?? undefined,
  };
}

// re-export so the timestamp helper is available where product rows are shaped
export { toLegacyTimestamp };
