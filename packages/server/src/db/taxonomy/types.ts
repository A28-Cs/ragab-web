/**
 * Catalog taxonomy types (§catalog import).
 *
 * The owner's brief has three indent levels, but only TWO of them are categories:
 *
 *     Category: المشروبات  →  Subcategory: المياه  →  Product: مياه شرب
 *                                                     Attributes: Brand, Size, Barcode, Price
 *
 * The third level (the bullets) is the PRODUCT level, not a category level. They become
 * classification keywords and `products.tags` — never `categories` rows. This is also the
 * only shape the schema permits: `validateParentId` in modules/catalog/service.ts refuses a
 * grandchild with CATEGORY_PARENT_TOO_DEEP, and every read path rolls up exactly one hop
 * (repository.ts buildConditions, service.ts listCategories), so a third level would report
 * wrong product counts on the department cards.
 */

/** Closed union, mirroring packages/types Category.colorTheme. Nothing renders it today. */
export type ColorTheme = 'brand' | 'green' | 'blue' | 'rose' | 'violet' | 'orange';

export interface SubCategoryDef {
  /** Stable forever — this IS the row's primary key. Hand-picked ASCII. NEVER regenerated. */
  id: string;
  /**
   * Globally unique within the store. ALWAYS `<parentSlug>-<leaf>`.
   * `categories_slug_uidx` is (store_id, slug) — store-scoped, NOT parent-scoped — and Arabic
   * child names genuinely repeat across parents (عصائر under both المشروبات and المجمدات), so
   * prefixing is what makes all ~115 slugs unique by construction rather than by luck.
   */
  slug: string;
  nameAr: string;
  /** REQUIRED: feeds the slug and the NOT NULL column. A permanent URL — see the README. */
  nameEn: string;
  /** The brief's decimal × 10 (1.1 → 10, 1.2 → 20), leaving room to insert later. */
  sortOrder: number;
  /** The brief's bullets, verbatim. Match keywords AND the tag vocabulary. NEVER rows. */
  keywordsAr: readonly string[];
  /** EN equivalents, for matching HyperOne's English store view. May be shorter. */
  keywordsEn: readonly string[];
  /** Tag vocabulary override. Defaults to keywordsAr; set to exclude a bullet from tagging. */
  tagsAr?: readonly string[];
  /**
   * Generic head nouns used for MATCHING ONLY and never tagged. The brief's bullets are
   * specific ("زيت ذرة", "زيت عباد الشمس"), so a product named just "زيت حار تشويس" matches
   * none of them. These add the bare category noun back without polluting the tag vocabulary
   * — which must stay the owner's own words.
   */
  matchAlso?: readonly string[];
  /** At least one must appear in the name, or this leaf is ineligible. Normalized tokens. */
  requireAny?: readonly string[];
  /** Any one present VETOES this leaf outright. Normalized tokens. */
  forbidAny?: readonly string[];
  /** Overrides the parent's icon. Rarely needed — children are reached via chips. */
  iconName?: string;
  /** The owner confirms Ragab does not stock this yet. Exempts it from verify check 5. */
  expectedEmpty?: boolean;
}

export interface CategoryDef {
  /** REUSE the 8 seeded ids (cat_dairy, cat_beverages, ...) — see taxonomy.ts. */
  id: string;
  /** Bare, no prefix. The 8 reused parents keep their existing slugs. */
  slug: string;
  nameAr: string;
  nameEn: string;
  /** Canonical lowercase kebab-case lucide name. Must exist in BOTH client icon maps. */
  iconName: string;
  colorTheme: ColorTheme;
  /** The brief's number × 100 (1 → 100, 2 → 200). */
  sortOrder: number;
  /** Homepage rail. AT MOST 8 true — asserted by taxonomy.test.ts. */
  featured?: boolean;
  descriptionAr?: string;
  descriptionEn?: string;
  /**
   * Default true. Set false to soft-deactivate a whole department (and, unless a child
   * overrides it, every child under it) without deleting it from the taxonomy — e.g. the
   * grocery brief's departments once chefaa's real catalog made them redundant while still
   * empty. `allCategoryRows()` cascades this to children so a department never shows an
   * active child under an inactive parent.
   */
  isActive?: boolean;
  children: SubCategoryDef[];
}

/** A leaf plus a back-pointer to its parent, as built by the LEAVES index. */
export type Leaf = SubCategoryDef & { parent: CategoryDef };

/** Sentinel target for source paths that fall outside the owner's 25 categories. */
export const OUT_OF_SCOPE = '__out_of_scope__' as const;

export interface SourceRule {
  /** Normalized source category path (HyperOne url_path, or a legacy CSV file path). */
  match: { path: string } | { prefix: string } | { regex: string };
  /** Target LEAF id, or OUT_OF_SCOPE. Asserted to exist by taxonomy.test.ts. */
  target: string;
  /** Extra tags beyond the leaf's own matched keywords. */
  tags?: readonly string[];
  /** Why this rule exists — surfaced in the review report so the RULE can be audited. */
  note: string;
  /** Deliberately coarse: products still get eyeballed even though the rule matched. */
  review?: boolean;
}

export type ClassificationTier = 'A' | 'B' | 'C';

export interface Classification {
  /** Singular by construction — the owner's "one primary category per product" rule. */
  leafId: string;
  confidence: number;
  tier: ClassificationTier;
  /** True when ≥2 leaves tied at the top score. Assigned deterministically, but queued. */
  ambiguous: boolean;
  /** Evidence, carried into both the report and the tags. */
  matchedKeywords: readonly string[];
  /** Runner-up leaves → tags, never categories. */
  losingLeaves: readonly string[];
  warnings: readonly string[];
}
