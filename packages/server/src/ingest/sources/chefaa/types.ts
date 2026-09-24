/**
 * chefaa `products_eg` Meilisearch document shape (§catalog import, stage 1 — chefaa source).
 *
 * Fields verified live by probing https://meilisearch.chefaa.com/indexes/products_eg/search
 * on 2026-09-24. Only the fields the pipeline actually reads are typed; the rest of a real
 * document (landing_pages, coupon_description_*, gameball_points, zones_variations,
 * availability, suppliers_info, ...) passes through the index signature so a snapshot stays a
 * verbatim capture even where this file does not model a field.
 */

export interface ChefaaCategoryRef {
  title_ar: string;
  title_en: string;
  slug: string;
}

export interface ChefaaBrand {
  id: number;
  title_ar: string;
  title_en: string;
  slug: string;
  images: string | null;
}

export interface ChefaaProduct {
  id: number;
  title_ar: string;
  title_en: string;
  price: number;
  final_price: number;
  discount: number | null;
  cost_price: number | null;
  image: string | null;
  status: string;
  slug: string;
  /** e.g. "دوائي" (medicinal) — free-text, not an enum verified exhaustively. */
  type: string | null;
  flow_type: string | null;
  full_url: string;
  brands: ChefaaBrand | null;
  level_one_category: ChefaaCategoryRef | null;
  level_two_category: ChefaaCategoryRef[] | null;
  level_three_category: ChefaaCategoryRef[] | null;
  in_stock: boolean;
  out_of_stock: boolean;
  active: boolean;
  need_prescription: boolean | null;
  description_en: string | null;
  description_ar: string | null;
  low_stock: boolean | null;
  max_quantity: number | null;
  quantity: number | null;
  purchase_count: number | null;
  /** Present only on some documents — facet-only attributes chefaa exposes per product type. */
  size?: string | null;
  concentration?: string | null;
  'pack-size'?: string | null;
  formulation?: string | null;
  'product-type'?: string | null;
  scent?: string | null;
  color?: string | null;
  flavor?: string | null;
  'skin-type'?: string | null;
  'hair-type'?: string | null;
  'hair-color'?: string | null;
  'age-range'?: string | null;
  'suitable-for'?: string | null;
  'free-from'?: string | null;
  'special-features'?: string | null;
  'oral-care'?: string | null;
  tags?: string[] | null;
  [extra: string]: unknown;
}

export interface ChefaaPageSnapshot {
  meta: {
    source: 'chefaa';
    index: string;
    /** The price-range filter this page swept, e.g. "price >= 0 AND price <= 12.5". */
    bucketFilter: string;
    bucketMin: number;
    bucketMax: number;
    fetchedAt: string;
    count: number;
  };
  items: ChefaaProduct[];
}
