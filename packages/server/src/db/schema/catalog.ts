import { sql } from 'drizzle-orm';
/**
 * Catalog (§28, §29). Prices are BIGINT minor units. `inStock` and `discountPercentage`
 * are DERIVED — services compute them from stock and price (the prototype's saveProduct
 * rules), and the mapper projects them. Bilingual dual columns preserve the frontend
 * contract; category name is denormalized into the product response via a join, not stored.
 */
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestamps, versionColumn } from './_shared';
import { DEFAULT_STORE_ID } from './system';

export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    iconName: text('icon_name').notNull().default('package'),
    image: text('image'),
    colorTheme: text('color_theme'),
    parentId: text('parent_id'),
    featured: boolean('featured').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex('categories_slug_uidx').on(t.storeId, t.slug),
    index('categories_parent_idx').on(t.parentId),
  ],
);

export const brands = pgTable(
  'brands',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    logo: text('logo'),
    ...timestamps,
  },
  (t) => [uniqueIndex('brands_slug_uidx').on(t.storeId, t.slug)],
);

export const products = pgTable(
  'products',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    sku: text('sku').notNull(),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    brandAr: text('brand_ar'),
    brandEn: text('brand_en'),
    unitAr: text('unit_ar').notNull(),
    unitEn: text('unit_en').notNull(),
    unitValue: real('unit_value'),
    unitMeasure: text('unit_measure'), // 'L'|'ml'|'kg'|'g'|'pc'
    priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
    oldPriceMinor: bigint('old_price_minor', { mode: 'number' }),
    currency: text('currency').notNull().default('EGP'),
    image: text('image').notNull().default(''),
    descriptionAr: text('description_ar').notNull().default(''),
    descriptionEn: text('description_en'),
    originAr: text('origin_ar'),
    /** Merchandising flags. */
    isPopular: boolean('is_popular').notNull().default(false),
    isEssential: boolean('is_essential').notNull().default(false),
    isNew: boolean('is_new').notNull().default(false),
    /** Sales-rank score for the "popular" sort (source catalog purchase count; higher = sold more). */
    popularity: integer('popularity').notNull().default(0),
    badgeAr: text('badge_ar'),
    badgeEn: text('badge_en'),
    tags: text('tags').array(),
    rating: real('rating'),
    reviewCount: integer('review_count').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    /** Visibility & lifecycle. */
    isActive: boolean('is_active').notNull().default(true),
    isVisible: boolean('is_visible').notNull().default(true),
    ...versionColumn,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex('products_slug_uidx').on(t.storeId, t.slug),
    uniqueIndex('products_sku_uidx').on(t.storeId, t.sku),
    index('products_category_active_idx').on(t.storeId, t.categoryId, t.isActive),
    index('products_flags_idx').on(t.isPopular, t.isEssential),
    index('products_popularity_idx').on(t.isPopular, t.popularity, t.id),
    index('products_price_idx').on(t.priceMinor),
    index('products_brand_idx').on(t.brandAr, t.brandEn),
    index('products_visibility_idx').on(t.storeId, t.isActive, t.isVisible).where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    altAr: text('alt_ar'),
    altEn: text('alt_en'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('product_images_product_idx').on(t.productId)],
);

/** Variants (§29) — used only when SKU/price/stock differ. Base product remains sellable. */
export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
    oldPriceMinor: bigint('old_price_minor', { mode: 'number' }),
    unitAr: text('unit_ar'),
    unitEn: text('unit_en'),
    unitValue: real('unit_value'),
    unitMeasure: text('unit_measure'), // 'L'|'ml'|'kg'|'g'|'pc'
    isActive: boolean('is_active').notNull().default(true),
    /** The unit a client that does not know variants means by "the product" (exactly one per product). */
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...versionColumn,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('product_variants_sku_uidx').on(t.sku),
    index('product_variants_product_idx').on(t.productId),
    uniqueIndex('product_variants_default_uidx').on(t.productId).where(sql`is_default`),
  ],
);

export const productAttributes = pgTable('product_attributes', {
  id: primaryId(),
  storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  ...timestamps,
});

export const productAttributeValues = pgTable(
  'product_attribute_values',
  {
    id: primaryId(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    attributeId: text('attribute_id')
      .notNull()
      .references(() => productAttributes.id, { onDelete: 'cascade' }),
    valueAr: text('value_ar').notNull(),
    valueEn: text('value_en'),
    ...timestamps,
  },
  (t) => [
    index('product_attr_values_product_idx').on(t.productId),
    index('product_attr_values_search_idx').on(t.attributeId, t.valueAr, t.valueEn),
  ],
);
