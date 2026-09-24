/**
 * Arabic + Latin text normalization for catalog matching (§catalog import).
 *
 * Two distinct operations, and conflating them is a bug:
 *
 *   scrub(s) — for values that get STORED. Removes invisible characters that corrupt
 *              display and comparison, but preserves the reader's orthography. Uses NFC,
 *              not NFKC: NFKC rewrites Arabic presentation forms and ligatures, which
 *              changes how a product name looks to a customer.
 *
 *   fold(s)  — for MATCHING and dedupe only. Never stored. Additionally collapses the
 *              orthographic variance that makes Arabic string equality useless
 *              (ا/أ/إ/آ, ي/ى, ه/ة), strips diacritics, and lowercases Latin.
 *
 * `fold` must be applied to BOTH sides of every comparison — keywords at module load and
 * product names at match time. A one-sided fold silently fails to match.
 *
 * These are not theoretical concerns. Two cases are already committed in this repo:
 *   docs/products/زبادي.csv        contains "زبادى كبير هايبروان"  (final ى in a ي file)
 *   docs/products/قهوه وبن...csv  writes قهوة's taa marbuta as a plain ه
 * Without fold() both fail to match their own category. Both are pinned in classify.test.ts.
 */

/* ── Character classes ──────────────────────────────────────────────────────────────── */

/**
 * Bidi control characters. U+200F (RLM) is NOT hypothetical: the scraped price column in
 * docs/products/*.csv literally reads "‏74" — the RLM is inside the quoted field, so
 * parseInt() on the raw value returns NaN.
 */
const BIDI_CONTROLS = /[‎‏؜‪-‮⁦-⁩]/g;

/** Zero-width characters: ZWSP, ZWNJ, ZWJ, BOM. Invisible, and they break equality. */
const ZERO_WIDTH = /[​‌‍﻿]/g;

/** Spaces that are not U+0020: NBSP, figure space, narrow NBSP. */
const ODD_SPACES = /[   ]/g;

/** Tatweel (kashida) — a purely typographic stretch character carrying no meaning. */
const TATWEEL = /ـ/g;

/** Harakat / tashkeel plus the superscript alef and the extended Quranic marks. */
const DIACRITICS = /[ً-ْٰۖ-ۭ]/g;

/** Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits. */
const ARABIC_INDIC = /[٠-٩]/g;
const EASTERN_ARABIC_INDIC = /[۰-۹]/g;

/** Arabic decimal separator U+066B and thousands separator U+066C. */
const ARABIC_DECIMAL_SEP = /٫/g;
const ARABIC_THOUSANDS_SEP = /٬/g;

/** Orthographic folds. Order matters only in that all alef forms collapse together. */
const FOLD_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/[أإآٱ]/g, 'ا'], // أ إ آ ٱ → ا
  [/ى/g, 'ي'], //             ى → ي
  [/ة/g, 'ه'], //             ة → ه
  [/ؤ/g, 'و'], //             ؤ → و
  [/ئ/g, 'ي'], //             ئ → ي
  [/ء/g, ''], //                   ء → (dropped)
];

/* ── Public API ─────────────────────────────────────────────────────────────────────── */

/** Convert Arabic-Indic and Persian digits to ASCII, and Arabic separators to ASCII. */
export function normalizeDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(ARABIC_DECIMAL_SEP, '.')
    .replace(ARABIC_THOUSANDS_SEP, '');
}

/**
 * Clean a value for STORAGE. Preserves orthography and case; removes only what is
 * invisible, typographic, or a non-ASCII digit. NFC — never NFKC.
 */
export function scrub(s: string): string {
  return normalizeDigits(
    s
      .replace(BIDI_CONTROLS, '')
      .replace(ZERO_WIDTH, '')
      .replace(ODD_SPACES, ' ')
      .replace(TATWEEL, ''),
  )
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a value to a MATCH KEY. Never store the result. Applies scrub, then collapses
 * Arabic orthographic variance, strips diacritics, and lowercases Latin.
 */
export function fold(s: string): string {
  let out = scrub(s).replace(DIACRITICS, '');
  for (const [re, to] of FOLD_MAP) out = out.replace(re, to);
  return out.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Split a folded string into comparable tokens. Splits on anything that is neither a
 * letter nor a number in any script, so Arabic and Latin tokenize identically.
 */
export function tokenize(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** A folded token set, for subset/overlap tests. */
export function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

/** True when every token of `needle` appears among `haystack`'s tokens. */
export function containsAllTokens(haystack: string, needle: string): boolean {
  const have = tokenSet(haystack);
  const want = tokenize(needle);
  return want.length > 0 && want.every((t) => have.has(t));
}

/**
 * True when the folded `needle` appears as a substring of the folded `haystack`.
 * Substring rather than token match, so a keyword can span a compound word.
 */
export function containsFolded(haystack: string, needle: string): boolean {
  const n = fold(needle);
  return n.length > 0 && fold(haystack).includes(n);
}

/**
 * ASCII-only slug fragment, for the `asciiSlug(nameEn) + '-' + ean` product slug and the
 * `<parentSlug>-<leaf>` category slug.
 *
 * NOTE this is deliberately NOT the Unicode-aware slugify in modules/catalog/service.ts.
 * That one preserves Arabic (\p{L}), which is correct for hand-authored admin edits but
 * puts raw Arabic into URL paths — and Mobile's category_card.dart pushes the slug into
 * go_router UNENCODED. Imported rows always carry an English name, so they always get an
 * ASCII slug, and the importer sets `slug` explicitly rather than letting the service
 * derive it (which would also hit service.ts's non-deterministic `product-${Date.now()}`
 * fallback).
 */
export function asciiSlug(s: string): string {
  return scrub(s)
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
