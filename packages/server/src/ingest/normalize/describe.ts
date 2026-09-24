/**
 * Bilingual description generator (§catalog import, stage 2).
 *
 * HyperOne's `description` and `short_description` are EMPTY for every product — this was
 * verified against the live API, not assumed. Carrefour has real prose but it is Carrefour's
 * copyrighted marketing copy, behind Akamai, and matchable only fuzzily.
 *
 * So descriptions are GENERATED from facts we already hold: brand, product type, pack size and
 * category. That gives 100% coverage, no copyright exposure, a consistent voice, and output
 * that is deterministic (the same input always produces the same sentence, so re-running the
 * importer never churns the column).
 *
 * These are deliberately plain and factual rather than marketing copy. They also earn their
 * keep in search: the FTS trigger indexes description_ar/description_en at weight C, so a
 * generated description makes every product findable by its category and brand words.
 */
import type { Leaf } from '../../db/taxonomy';
import { scrub } from '../../db/taxonomy/normalize';

export interface DescribeInput {
  nameAr: string;
  nameEn: string | null;
  /** Product's own words: name minus brand minus size. */
  descriptorAr: string;
  descriptorEn: string | null;
  brandAr: string | null;
  brandEn: string | null;
  /** Display unit strings, e.g. "330 مل × 20" / "330 ml × 20". */
  unitAr: string;
  unitEn: string;
  /** True when no size could be parsed, so the unit is the 'قطعة'/'piece' fallback. */
  unitIsFallback: boolean;
  leaf: Leaf;
}

export interface GeneratedDescription {
  descriptionAr: string;
  descriptionEn: string;
}

/** Arabic needs "من <brand>" only when a brand is known. */
function arBrandClause(brandAr: string | null): string {
  return brandAr ? ` من ${brandAr}` : '';
}

function enBrandClause(brandEn: string | null): string {
  return brandEn ? ` from ${brandEn}` : '';
}

/**
 * Build the two sentences.
 *
 * Sentence 1 — what it is: the product's own words, the brand, and the pack size.
 * Sentence 2 — where it sits: department and subcategory, which is also what makes the
 *              product searchable by its category words.
 */
export function describe(input: DescribeInput): GeneratedDescription {
  const { leaf } = input;

  const subjectAr = scrub(input.descriptorAr) || scrub(input.nameAr) || leaf.nameAr;
  const subjectEn =
    scrub(input.descriptorEn ?? '') || scrub(input.nameEn ?? '') || leaf.nameEn;

  const sizeAr = input.unitIsFallback ? '' : `، عبوة ${input.unitAr}`;
  const sizeEn = input.unitIsFallback ? '' : `, ${input.unitEn} pack`;

  const descriptionAr = [
    `${subjectAr}${arBrandClause(input.brandAr)}${sizeAr}.`,
    `من قسم ${leaf.parent.nameAr} — ${leaf.nameAr}.`,
  ].join(' ');

  const descriptionEn = [
    `${subjectEn}${enBrandClause(input.brandEn)}${sizeEn}.`,
    `From ${leaf.parent.nameEn} — ${leaf.nameEn}.`,
  ].join(' ');

  return { descriptionAr, descriptionEn };
}
