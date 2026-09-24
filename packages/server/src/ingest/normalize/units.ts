/**
 * Pack-size parsing (§catalog import, stage 2).
 *
 * HyperOne exposes no `weight` and no size attribute — both are null on every product I
 * probed. The size is embedded in the NAME, after the last separator, in both languages:
 *
 *   Nestle Pure Life Water - 330ml x 20 Bottles   |   مياه طبيعية نستلة - 330مل *20 زجاجة
 *   Hayat Natural Water Gallon -19L               |   جالون مياه طبيعية حياة - 19لتر
 *                                                 |   جبنة كريمي سبريد كيري - 150جم
 *                                                 |   جبنة مثلثات أبو الولد - 8 قطع
 *                                                 |   كرتونة بيض أحمر توب فاليو-30بيضة
 *
 * Note the separator varies (" - ", " -", "-", or absent) and the multiplier is `x` in
 * English and `*` in Arabic.
 *
 * THE FREE ORACLE: HyperOne's `url_key` is `<packNumber>-<EAN>` — `150-3073781107302` for
 * 150جم, `8-3073781207088` for 8 قطع, `30-9634000066226` for 30 بيضة. That gives an
 * INDEPENDENTLY AUTHORED ground truth for the number the parser must extract, present on
 * every single product, for free. It is used as a cross-check, not as the primary parse,
 * because it carries no unit.
 */
import { fold, normalizeDigits, scrub } from '../../db/taxonomy/normalize';
import { CONTAINER_NOUNS, UNIT_TOKENS_SORTED, type UnitMeasure } from '../../db/taxonomy/facets';

export interface ParsedSize {
  /** Value of a SINGLE unit (330 for "330ml x 20"), not the pack total. */
  unitValue: number | null;
  unitMeasure: UnitMeasure | null;
  /** Multiplier, e.g. 20 for "330ml x 20". No DB column — display string only. */
  packCount: number | null;
  /** Container noun for the display string, e.g. زجاجة / Bottles. */
  containerNoun: string | null;
  /** Total in base units (ml / g / pc), for cross-source matching only. */
  baseQuantity: { value: number; measure: 'ml' | 'g' | 'pc' } | null;
  /** The name with the size portion removed — the classification payload. */
  descriptor: string;
  warnings: string[];
}

/** Separators that introduce the size portion of a name. */
const SEP_RE = /\s*[-–—]\s*/g;

/** Build the unit alternation once, longest-token-first (see facets.ts). */
const UNIT_ALTERNATION = UNIT_TOKENS_SORTED.map((u) => escapeRe(u.token)).join('|');
const UNIT_LOOKUP = new Map(UNIT_TOKENS_SORTED.map((u) => [u.token, u.measure] as const));

/** value then unit: `330مل`, `330 ml`, `1.5 لتر`, `19L` */
const VALUE_UNIT_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALTERNATION})(?![\\p{L}\\p{N}])`, 'iu');
/** unit then value, rarer: `لتر 1` */
const UNIT_VALUE_RE = new RegExp(`(${UNIT_ALTERNATION})\\s*(\\d+(?:[.,]\\d+)?)(?![\\p{L}\\p{N}])`, 'iu');
/** multiplier: `*20`, `x 20`, `× 6` */
const MULT_AFTER_RE = /[x×*]\s*(\d+)/iu;
/** `20 x 330ml` — the count comes first */
const MULT_BEFORE_RE = /(\d+)\s*[x×*]\s*(?=\d)/iu;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/** ml / g / pc totals, so 1 L and 1000 ml compare equal across sources. */
function toBase(value: number, measure: UnitMeasure): { value: number; measure: 'ml' | 'g' | 'pc' } {
  switch (measure) {
    case 'L':
      return { value: value * 1000, measure: 'ml' };
    case 'ml':
      return { value, measure: 'ml' };
    case 'kg':
      return { value: value * 1000, measure: 'g' };
    case 'g':
      return { value, measure: 'g' };
    case 'pc':
      return { value, measure: 'pc' };
  }
}

/** Extract the pack number from a `<packNumber>-<EAN>` url_key. Null when not that shape. */
export function packNumberFromUrlKey(urlKey: string | null | undefined): number | null {
  if (!urlKey) return null;
  // Shapes seen live: "150-3073781107302", "330-20-6224010081116", "1-6-10-6222014300974".
  const parts = urlKey.split('-').filter(Boolean);
  if (parts.length < 2) return null;
  const head = parts[0]!;
  if (!/^\d+$/.test(head)) return null;
  // The final segment is the EAN; a single-segment key is not the oracle shape.
  const tail = parts[parts.length - 1]!;
  if (!/^\d{8,14}$/.test(tail)) return null;
  const n = Number(head);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extract the EAN from a url_key or product URL. */
export function eanFromUrlKey(urlKey: string | null | undefined): string | null {
  if (!urlKey) return null;
  const last = urlKey.split('/').pop() ?? urlKey;
  const parts = last.split('-').filter(Boolean);
  const tail = parts[parts.length - 1];
  return tail && /^\d{8,14}$/.test(tail) ? tail : null;
}

/**
 * Parse the size out of one product name.
 *
 * Strategy: split on the LAST separator and try the tail first (that is where the size lives
 * in the overwhelming majority of names). If the tail carries no size, search the whole
 * string — some names append the size with no separator at all (`عيش-30بيضة`).
 */
/**
 * A baby-weight RANGE, e.g. "9 - 18ك - مقاس 4" (diapers sized for a 9-18kg baby). This is not
 * the product's own weight — the product's actual size is the piece count later in the name
 * ("80 حفاضة"). Stripped before parsing so the range's trailing number cannot be picked up as
 * unitValue and bury the real pack size. Verified against 43 real diaper listings.
 */
const WEIGHT_RANGE_RE = /\d+\s*-\s*\d+\s*ك(?:جم|ج)?\s*-?\s*(?=مقاس)/giu;

export function parseSize(rawName: string): ParsedSize {
  const warnings: string[] = [];
  const name = scrub(rawName);
  const numeric = normalizeDigits(name).replace(WEIGHT_RANGE_RE, ' ');

  // Find the last separator position, so `head` keeps any internal hyphens.
  SEP_RE.lastIndex = 0;
  let lastSep = -1;
  let lastSepLen = 0;
  for (let m = SEP_RE.exec(numeric); m; m = SEP_RE.exec(numeric)) {
    lastSep = m.index;
    lastSepLen = m[0].length;
  }

  const tail = lastSep >= 0 ? numeric.slice(lastSep + lastSepLen) : '';
  const head = lastSep >= 0 ? numeric.slice(0, lastSep) : numeric;

  let target = tail;
  let sizeFoundInTail = true;
  if (!VALUE_UNIT_RE.test(tail) && !UNIT_VALUE_RE.test(tail)) {
    target = numeric;
    sizeFoundInTail = false;
  }

  let unitValue: number | null = null;
  let unitMeasure: UnitMeasure | null = null;

  const vu = VALUE_UNIT_RE.exec(target);
  if (vu) {
    unitValue = toNumber(vu[1]!);
    unitMeasure = UNIT_LOOKUP.get(fold(vu[2]!)) ?? UNIT_LOOKUP.get(vu[2]!.toLowerCase()) ?? null;
  } else {
    const uv = UNIT_VALUE_RE.exec(target);
    if (uv) {
      unitMeasure = UNIT_LOOKUP.get(fold(uv[1]!)) ?? UNIT_LOOKUP.get(uv[1]!.toLowerCase()) ?? null;
      unitValue = toNumber(uv[2]!);
    }
  }

  // Multiplier, searched in the size region only so a brand like "7 Up" is not read as a pack.
  let packCount: number | null = null;
  const multAfter = MULT_AFTER_RE.exec(target);
  const multBefore = MULT_BEFORE_RE.exec(target);
  if (multAfter) packCount = Number(multAfter[1]);
  else if (multBefore) packCount = Number(multBefore[1]);
  if (packCount !== null && (!Number.isInteger(packCount) || packCount < 2 || packCount > 96)) {
    // Outside a plausible pack range this is a model number or a flavour, not a multiplier.
    packCount = null;
  }

  // Container noun, for the display string only — never the measure.
  let containerNoun: string | null = null;
  const folded = fold(target);
  for (const noun of CONTAINER_NOUNS) {
    if (folded.includes(fold(noun))) {
      containerNoun = noun;
      break;
    }
  }

  if (unitMeasure === null) {
    warnings.push('NO_SIZE_PARSED');
  }

  const baseQuantity =
    unitValue !== null && unitMeasure !== null
      ? (() => {
          const b = toBase(unitValue, unitMeasure);
          return { value: b.value * (packCount ?? 1), measure: b.measure };
        })()
      : null;

  // Descriptor: drop the size region so brand/keyword matching is not polluted by numbers.
  let descriptor = sizeFoundInTail && lastSep >= 0 ? head : numeric;
  if (!sizeFoundInTail && vu) descriptor = numeric.slice(0, vu.index);
  descriptor = scrub(descriptor);

  return { unitValue, unitMeasure, packCount, containerNoun, baseQuantity, descriptor, warnings };
}

/**
 * Reconcile the independent EN and AR parses, and cross-check both against the url_key
 * oracle. Disagreement is recorded rather than silently resolved — a size that two languages
 * and the URL cannot agree on is exactly what a human should look at.
 */
export function reconcileSize(
  en: ParsedSize | null,
  ar: ParsedSize,
  urlKey: string | null,
): { size: ParsedSize; warnings: string[] } {
  const warnings: string[] = [];
  // Prefer EN: its grammar is more regular and its unit tokens are unambiguous.
  const primary = en && en.unitMeasure !== null ? en : ar;
  const other = primary === ar ? en : ar;

  if (
    other &&
    other.unitMeasure !== null &&
    primary.unitMeasure !== null &&
    primary.baseQuantity &&
    other.baseQuantity &&
    (primary.baseQuantity.measure !== other.baseQuantity.measure ||
      Math.abs(primary.baseQuantity.value - other.baseQuantity.value) > 0.01)
  ) {
    warnings.push('SIZE_LANG_DISAGREE');
  }

  const oracle = packNumberFromUrlKey(urlKey);
  if (oracle !== null && primary.unitMeasure !== null) {
    const matchesValue = primary.unitValue !== null && Math.abs(primary.unitValue - oracle) < 0.01;
    const matchesPack = primary.packCount !== null && primary.packCount === oracle;
    if (!matchesValue && !matchesPack) warnings.push('SIZE_URLKEY_DISAGREE');
  }

  return { size: primary, warnings: [...primary.warnings, ...warnings] };
}

/** Human display strings. Uses U+00D7, never the source's ASCII `*`. */
export function formatUnit(size: ParsedSize, lang: 'ar' | 'en'): string {
  const AR_UNITS: Record<UnitMeasure, string> = { L: 'لتر', ml: 'مل', kg: 'كجم', g: 'جم', pc: 'قطعة' };
  const EN_UNITS: Record<UnitMeasure, string> = { L: 'L', ml: 'ml', kg: 'kg', g: 'g', pc: 'pc' };

  // Guaranteed fallback: unitAr and unitEn are NOT NULL in the schema, so this can never
  // return an empty string.
  if (size.unitMeasure === null || size.unitValue === null) {
    return lang === 'ar' ? 'قطعة' : 'piece';
  }
  const units = lang === 'ar' ? AR_UNITS : EN_UNITS;
  const value = Number.isInteger(size.unitValue) ? String(size.unitValue) : String(size.unitValue);
  const base = `${value} ${units[size.unitMeasure]}`;
  return size.packCount ? `${base} × ${size.packCount}` : base;
}
