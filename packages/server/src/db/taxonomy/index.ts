/**
 * Taxonomy public surface (§catalog import). Import from here, not from taxonomy.ts.
 */
export type {
  CategoryDef,
  SubCategoryDef,
  ColorTheme,
  Leaf,
  SourceRule,
  Classification,
  ClassificationTier,
} from './types';
export { OUT_OF_SCOPE } from './types';
export { TAXONOMY } from './taxonomy';
export { SOURCE_RULES, CSV_SOURCE_RULES, BRANCH_MIRROR_RE } from './rules';
export { SKU_OVERRIDES } from './overrides';
export {
  scrub,
  fold,
  tokenize,
  tokenSet,
  containsFolded,
  containsAllTokens,
  normalizeDigits,
  asciiSlug,
} from './normalize';
export {
  FREEZER_TOKENS,
  CANNED_TOKENS,
  PROCESSED_PRODUCE_TOKENS,
  FACET_TAGS,
  SIZE_RE,
  MULTIPACK_RE,
  UNIT_LEXICON,
  UNIT_TOKENS_SORTED,
  CONTAINER_NOUNS,
  type UnitMeasure,
} from './facets';

import { TAXONOMY } from './taxonomy';
import type { CategoryDef, Leaf } from './types';

/** Every leaf, keyed by id, with a back-pointer to its parent. Built once at module load. */
export const LEAVES: ReadonlyMap<string, Leaf> = new Map(
  TAXONOMY.flatMap((parent) => parent.children.map((c) => [c.id, { ...c, parent }] as const)),
);

/** Every leaf, keyed by slug. */
export const LEAVES_BY_SLUG: ReadonlyMap<string, Leaf> = new Map(
  [...LEAVES.values()].map((l) => [l.slug, l] as const),
);

/** Parents keyed by id. */
export const PARENTS: ReadonlyMap<string, CategoryDef> = new Map(
  TAXONOMY.map((p) => [p.id, p] as const),
);

/** All ~112 category rows, parents first then children — the order the importer inserts in. */
export function allCategoryRows(): Array<{
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  colorTheme: string;
  parentId: string | null;
  sortOrder: number;
  featured: boolean;
  isActive: boolean;
}> {
  const rows = TAXONOMY.map((p) => ({
    id: p.id,
    slug: p.slug,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    iconName: p.iconName,
    colorTheme: p.colorTheme,
    parentId: null,
    sortOrder: p.sortOrder,
    featured: p.featured ?? false,
    isActive: p.isActive ?? true,
  }));
  const children = TAXONOMY.flatMap((p) =>
    p.children.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      iconName: c.iconName ?? p.iconName,
      colorTheme: p.colorTheme,
      parentId: p.id,
      sortOrder: c.sortOrder,
      featured: false,
      // Cascades the parent's deactivation down — no child left "active" under a
      // department the owner turned off.
      isActive: p.isActive ?? true,
    })),
  );
  return [...rows, ...children];
}

/** The tag vocabulary a leaf may contribute (owner rule 8). Defaults to its bullets. */
export function leafTagVocabulary(leafId: string): readonly string[] {
  const leaf = LEAVES.get(leafId);
  if (!leaf) return [];
  return leaf.tagsAr ?? leaf.keywordsAr;
}

/** The 8 category ids reused from db/seed.ts — see taxonomy.ts. */
export const REUSED_SEED_CATEGORY_IDS: readonly string[] = [
  'cat_beverages',
  'cat_dairy',
  'cat_bakery',
  'cat_groceries',
  'cat_snacks',
  'cat_cleaning',
  'cat_care',
  'cat_fresh',
];
