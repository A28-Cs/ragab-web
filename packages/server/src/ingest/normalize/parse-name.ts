/**
 * Brand extraction (§catalog import, stage 2).
 *
 * HyperOne's `brand` and `manufacturer` attributes are NULL on every product, so the brand has
 * to come out of the name — and the two languages put it in different places:
 *
 *   EN  brand-LEADING       "Nestle Pure Life Water - 330ml"
 *   AR  descriptor-leading  "مياه طبيعية نستلة - 330مل"      ← the brand TRAILS
 *
 * So English uses a leading-n-gram pass and Arabic uses a substring search anywhere in the
 * name. A single "first token" heuristic would get English roughly right and Arabic wrong.
 */
import { fold, scrub } from '../../db/taxonomy/normalize';
import { BRAND_AR_SORTED, BRAND_EN_SORTED, BRAND_STOPLIST } from '../../db/taxonomy/brands';

export interface ParsedBrand {
  brandAr: string | null;
  brandEn: string | null;
  source: 'gazetteer' | 'leading-ngram' | 'none';
  warnings: string[];
}

const STOP = new Set(BRAND_STOPLIST.map((s) => fold(s)));

/**
 * Build a leading-n-gram frequency table over every English descriptor in the catalog.
 *
 * Frequency is what separates a brand from an adjective: "Nestle" leads 20 products, "Creamy"
 * leads one. Called once per run, then passed into parseBrand for every product.
 */
export function buildLeadingNgramIndex(
  descriptors: Iterable<string>,
  minSupport = 6,
): ReadonlySet<string> {
  const freq = new Map<string, number>();
  for (const d of descriptors) {
    const tokens = fold(d).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const n of [3, 2, 1]) {
      if (tokens.length < n) continue;
      const slice = tokens.slice(0, n);
      if (slice.every((t) => STOP.has(t))) continue;
      const gram = slice.join(' ');
      freq.set(gram, (freq.get(gram) ?? 0) + 1);
    }
  }
  const out = new Set<string>();
  for (const [gram, count] of freq) {
    if (count >= minSupport && !STOP.has(gram)) out.add(gram);
  }
  return out;
}

/** Longest leading n-gram present in the index. Longest wins: "Nestle Pure Life" > "Nestle". */
function leadingBrand(descriptorEn: string, index: ReadonlySet<string>): string | null {
  const tokens = fold(descriptorEn).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const n of [3, 2, 1]) {
    if (tokens.length < n) continue;
    const gram = tokens.slice(0, n).join(' ');
    if (index.has(gram) && !STOP.has(gram)) return gram;
  }
  return null;
}

/** Restore display casing for a folded English brand: "top value" → "Top Value". */
function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function parseBrand(
  descriptorAr: string,
  descriptorEn: string | null,
  leadingIndex: ReadonlySet<string>,
): ParsedBrand {
  const warnings: string[] = [];
  const foldedAr = fold(descriptorAr);
  const foldedEn = descriptorEn ? fold(descriptorEn) : '';

  // ── Gazetteer first, longest form first, searched ANYWHERE in the name ───────────────
  for (const pair of BRAND_AR_SORTED) {
    if (fold(pair.ar).length >= 3 && foldedAr.includes(fold(pair.ar))) {
      return { brandAr: pair.ar, brandEn: titleCase(pair.en), source: 'gazetteer', warnings };
    }
  }
  for (const pair of BRAND_EN_SORTED) {
    if (foldedEn && fold(pair.en).length >= 3 && foldedEn.includes(fold(pair.en))) {
      return { brandAr: pair.ar, brandEn: titleCase(pair.en), source: 'gazetteer', warnings };
    }
  }

  // ── Fall back to the frequency index for English only ────────────────────────────────
  const en = descriptorEn ? leadingBrand(descriptorEn, leadingIndex) : null;
  if (en) {
    // brandAr stays null rather than guessed. The column is nullable, and a wrong Arabic brand
    // is worse than a missing one: it is rendered to the customer and it feeds the search
    // vector at weight B.
    warnings.push('BRAND_AR_UNRESOLVED');
    return { brandAr: null, brandEn: titleCase(en), source: 'leading-ngram', warnings };
  }

  return { brandAr: null, brandEn: null, source: 'none', warnings };
}

/**
 * Remove the resolved brand from a descriptor, leaving the product's own words — while
 * PRESERVING the original orthography and casing of what remains.
 *
 * Token-wise rather than substring-wise on purpose. An earlier version sliced the folded
 * string and returned that, which leaked folded text into customer-facing descriptions:
 * "حلة" came out as "حله" and "Stewpot" as "stewpot". Matching per token and keeping the
 * ORIGINAL token avoids that entirely.
 */
export function stripBrand(descriptor: string, brand: string | null): string {
  const original = scrub(descriptor);
  if (!brand) return original;

  const brandTokens = fold(brand).split(/\s+/).filter(Boolean);
  if (brandTokens.length === 0) return original;
  const brandSet = new Set(brandTokens);

  // Split on whitespace only, so punctuation stays attached to its word.
  const kept = original
    .split(/\s+/)
    .filter((tok) => {
      const f = fold(tok).replace(/[^\p{L}\p{N}]/gu, '');
      return f.length === 0 ? true : !brandSet.has(f);
    })
    .join(' ');

  // If removing the brand emptied the descriptor, keep the original: a product whose name is
  // only its brand still needs something to describe.
  return scrub(kept) || original;
}
