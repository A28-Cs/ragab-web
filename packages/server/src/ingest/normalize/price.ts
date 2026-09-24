/**
 * Price normalization (§catalog import, stage 2).
 *
 * HyperOne's GraphQL returns EGP as floats with visible representation noise —
 * 127.999201 and 98.997601 for what are really 128.00 and 99.00. `products.priceMinor` is a
 * bigint of MINOR units, so every value must become an integer number of piastres.
 *
 * The guard is the point. Blind `Math.round(v * 100)` would also silently "fix" a genuine
 * 12.005, and shipping a wrong price is materially worse than flagging one.
 */
import { Money } from '../../lib/money';

export interface NormalizedPrice {
  priceMinor: number;
  oldPriceMinor: number | null;
  currency: 'EGP';
  discountPercentOff: number | null;
  warnings: string[];
}

export interface RawPriceInput {
  regular: number | null;
  final: number | null;
  currency: string | null;
  percentOff?: number | null;
  specialPrice?: number | null;
}

/** Anything beyond this is not float noise — it is a real sub-piastre price. */
const NOISE_TOLERANCE = 0.02;
/** Sanity band. Outside it the row goes to review rather than into the catalog. */
const MIN_MINOR = 1;
// EGP 200,000 — raised from the grocery-only 50,000 ceiling once the chefaa pharmacy source
// showed real, correctly-priced oncology/specialty drugs (e.g. Stelara) at 50,528–56,939 EGP.
const MAX_MINOR = 20_000_000;

function roundToMinor(major: number, label: string, warnings: string[]): number {
  // Money.ofMajor is the repo's only sanctioned major→minor conversion (Math.round(v*100)).
  const minor = Money.ofMajor(major).minor;
  if (Math.abs(minor / 100 - major) > NOISE_TOLERANCE) {
    warnings.push(`PRICE_ROUND_DRIFT:${label}`);
  }
  return minor;
}

export function normalizePrice(input: RawPriceInput): NormalizedPrice {
  const warnings: string[] = [];

  if (input.currency && input.currency !== 'EGP') {
    // A coercion here would hide a real multi-currency catalog. Fail the row instead.
    warnings.push(`CURRENCY_NOT_EGP:${input.currency}`);
  }

  const finalMajor = input.final ?? input.regular;
  if (finalMajor === null || !Number.isFinite(finalMajor)) {
    return {
      priceMinor: 0,
      oldPriceMinor: null,
      currency: 'EGP',
      discountPercentOff: null,
      warnings: [...warnings, 'PRICE_MISSING'],
    };
  }

  const priceMinor = roundToMinor(finalMajor, 'final', warnings);

  /*
   * `oldPriceMinor` only when the regular price is genuinely HIGHER. Emitting an equal value
   * would (a) violate the products_old_price_ge_price CHECK's intent, (b) make the mapper
   * render "0% off", and (c) put the product in the `offersOnly` filter with no offer.
   */
  let oldPriceMinor: number | null = null;
  if (input.regular !== null && Number.isFinite(input.regular) && input.regular > finalMajor + 0.005) {
    oldPriceMinor = roundToMinor(input.regular, 'regular', warnings);
    if (oldPriceMinor <= priceMinor) oldPriceMinor = null;
  }

  // Cross-check our derived discount against the one the source reports.
  let discountPercentOff: number | null = null;
  if (oldPriceMinor !== null) {
    discountPercentOff = Math.round(((oldPriceMinor - priceMinor) / oldPriceMinor) * 100);
    if (
      input.percentOff !== null &&
      input.percentOff !== undefined &&
      Math.abs(input.percentOff - discountPercentOff) > 1
    ) {
      warnings.push('DISCOUNT_MISMATCH');
    }
  }

  // A special_price below the final price means the source disagrees with itself — surface it
  // rather than silently letting the lower number win.
  if (
    input.specialPrice !== null &&
    input.specialPrice !== undefined &&
    Number.isFinite(input.specialPrice) &&
    input.specialPrice < finalMajor - 0.005
  ) {
    warnings.push('SPECIAL_PRICE_LOWER');
  }

  if (priceMinor < MIN_MINOR) warnings.push('PRICE_TOO_LOW');
  if (priceMinor > MAX_MINOR) warnings.push('PRICE_TOO_HIGH');

  return { priceMinor, oldPriceMinor, currency: 'EGP', discountPercentOff, warnings };
}

/**
 * Reconstruct a price from the legacy CSVs at docs/products/, where it is SPLIT across two
 * columns: `number` holds whole EGP (prefixed with U+200F) and `text-d-body-sm 2` holds the
 * piastres as a two-character string. `"‏96"` + `"95"` → 9695.
 *
 * Exact integer arithmetic — no float ever touches this path, which makes it strictly more
 * reliable than the GraphQL route.
 */
export function priceMinorFromCsvColumns(whole: string, piastres: string): number | null {
  const w = whole.replace(/[^\d]/g, '');
  const p = piastres.replace(/[^\d]/g, '');
  if (!w) return null;
  const major = Number.parseInt(w, 10);
  const minor = p ? Number.parseInt(p.padEnd(2, '0').slice(0, 2), 10) : 0;
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return major * 100 + minor;
}
