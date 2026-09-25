/**
 * Pharmacy packaging model for the product wizard.
 *
 * A pharmacy sells PACKAGES, never by the kilo: a box of 20 tablets, a 120 ml syrup bottle,
 * a 30 g cream tube. Some boxes hold several strips and the strip can be sold on its own —
 * that becomes a second variant ("شريط") with its own price and stock, exactly like the
 * default "whole package" variant.
 *
 * Stored shape (no schema change): the default variant's `unitAr` is the package CONTENT
 * ("20 قرص" — what the storefront prints under the name, matching the imported catalog) and
 * its `nameAr` is package + content ("علبة 20 قرص"), which is how the type is read back.
 */
import type { Product, ProductVariant } from '../../../types';

export type PackageType = 'box' | 'bottle' | 'tube' | 'ampoule' | 'sachet' | 'spray' | 'piece';
export type ContentUnit = 'tablet' | 'capsule' | 'ml' | 'g' | 'sachet' | 'ampoule' | 'suppository' | 'piece';

export const PACKAGE_TYPES: ReadonlyArray<{
  id: PackageType;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
  defaultContent: ContentUnit;
}> = [
  { id: 'box', ar: 'علبة', en: 'Box', hintAr: 'أقراص، كبسولات، أكياس، لبوس', hintEn: 'Tablets, capsules, sachets', defaultContent: 'tablet' },
  { id: 'bottle', ar: 'زجاجة', en: 'Bottle', hintAr: 'شراب، قطرة، لوشن، غسول', hintEn: 'Syrup, drops, lotion', defaultContent: 'ml' },
  { id: 'tube', ar: 'أنبوبة', en: 'Tube', hintAr: 'كريم، مرهم، جل', hintEn: 'Cream, ointment, gel', defaultContent: 'g' },
  { id: 'ampoule', ar: 'أمبول', en: 'Ampoule', hintAr: 'حقن', hintEn: 'Injections', defaultContent: 'ampoule' },
  { id: 'sachet', ar: 'كيس', en: 'Sachet', hintAr: 'فوار، بودرة', hintEn: 'Effervescent, powder', defaultContent: 'g' },
  { id: 'spray', ar: 'بخاخ', en: 'Spray', hintAr: 'بخاخ أنف أو فم', hintEn: 'Nasal / oral spray', defaultContent: 'ml' },
  { id: 'piece', ar: 'قطعة', en: 'Item', hintAr: 'أجهزة ومستلزمات', hintEn: 'Devices & supplies', defaultContent: 'piece' },
];

/** `few` is the Arabic plural used after 3–10 ("3 أقراص"); 1–2 and 11+ take the singular ("14 قرص"). */
export const CONTENT_UNITS: Record<ContentUnit, { ar: string; few: string; en: string; measure: 'ml' | 'g' | 'pc' }> = {
  tablet: { ar: 'قرص', few: 'أقراص', en: 'tablets', measure: 'pc' },
  capsule: { ar: 'كبسولة', few: 'كبسولات', en: 'capsules', measure: 'pc' },
  ml: { ar: 'مل', few: 'مل', en: 'ml', measure: 'ml' },
  g: { ar: 'جم', few: 'جم', en: 'g', measure: 'g' },
  sachet: { ar: 'كيس', few: 'أكياس', en: 'sachets', measure: 'pc' },
  ampoule: { ar: 'أمبول', few: 'أمبولات', en: 'ampoules', measure: 'pc' },
  suppository: { ar: 'لبوس', few: 'لبوس', en: 'suppositories', measure: 'pc' },
  piece: { ar: 'قطعة', few: 'قطع', en: 'pcs', measure: 'pc' },
};

export const CONTENT_UNIT_ORDER: readonly ContentUnit[] = ['tablet', 'capsule', 'ml', 'g', 'sachet', 'ampoule', 'suppository', 'piece'];

export interface PackagingState {
  packageType: PackageType;
  contentValue: number | '';
  contentUnit: ContentUnit;
  stock: number | '';
  price: number | '';
  oldPrice: number | '';
  sellByStrip: boolean;
  stripsPerBox: number | '';
  stripPrice: number | '';
  stripOldPrice: number | '';
}

export const EMPTY_PACKAGING: PackagingState = {
  packageType: 'box',
  contentValue: '',
  contentUnit: 'tablet',
  stock: '',
  price: '',
  oldPrice: '',
  sellByStrip: false,
  stripsPerBox: '',
  stripPrice: '',
  stripOldPrice: '',
};

export function packageLabel(type: PackageType, lang: 'ar' | 'en'): string {
  const p = PACKAGE_TYPES.find((t) => t.id === type)!;
  return lang === 'ar' ? p.ar : p.en;
}

/** "20 قرص" / "3 أقراص" / "120 مل"; null when no content amount was entered. */
export function contentLabel(value: number | '', unit: ContentUnit, lang: 'ar' | 'en'): string | null {
  if (value === '' || !(value > 0)) return null;
  const u = CONTENT_UNITS[unit];
  if (lang === 'en') return `${value} ${u.en}`;
  const few = Number.isInteger(value) && value >= 3 && value <= 10;
  return `${value} ${few ? u.few : u.ar}`;
}

/** Map a stored unit word (imported or wizard-made) back to a content unit. */
function unitFromWord(word: string): ContentUnit {
  const w = word.trim().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  if (/^(قرص|اقراص)$|^tab/i.test(w)) return 'tablet';
  if (/^كبسول|^cap/i.test(w)) return 'capsule';
  if (/^(مل|ملي|مللي)$|^ml$/i.test(w)) return 'ml';
  if (/^(جم|جرام|غرام)$|^g$/i.test(w)) return 'g';
  if (/^(كيس|اكياس|ظرف|اظرف)$|^sachet/i.test(w)) return 'sachet';
  if (/^امبول|^amp/i.test(w)) return 'ampoule';
  if (/^(لبوس|قمع|اقماع)|^supp/i.test(w)) return 'suppository';
  return 'piece';
}

/** "20 قرص" → { 20, tablet }. A label without a number ("قطعة", "عبوة") → no amount. */
export function parseContent(unitAr: string | undefined): { value: number | ''; unit: ContentUnit } {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(\S+)/.exec(unitAr ?? '');
  if (!m) return { value: '', unit: unitFromWord(unitAr ?? '') };
  return { value: Number(m[1]), unit: unitFromWord(m[2]!) };
}

function inferPackageType(variantName: string, unit: ContentUnit): PackageType {
  const first = variantName.trim().split(/\s+/)[0] ?? '';
  const named = PACKAGE_TYPES.find((t) => t.ar === first);
  if (named) return named.id;
  switch (unit) {
    case 'ml':
      return 'bottle';
    case 'g':
      return 'tube';
    case 'ampoule':
      return 'ampoule';
    case 'piece':
      return 'piece';
    default:
      return 'box';
  }
}

/** Read an existing product (imported or wizard-made) back into the wizard's state. */
export function readPackaging(product: Product): PackagingState {
  const variants = product.variants ?? [];
  const def = variants.find((v) => v.isDefault) ?? variants[0];
  // The strip variant (or a legacy "single piece" variant) — any non-default counted variant.
  const strip = variants.find((v) => v !== def && v.unitMeasure === 'pc');
  const { value, unit } = parseContent(def?.unitAr || product.unitAr);

  let stripsPerBox: number | '' = '';
  if (strip) {
    if (value !== '' && strip.unitValue && strip.unitValue > 1) stripsPerBox = Math.round(value / strip.unitValue);
    else if (def && def.stockQuantity > 0) stripsPerBox = Math.round(strip.stockQuantity / def.stockQuantity) || '';
  }

  return {
    packageType: strip ? 'box' : inferPackageType(def?.nameAr ?? '', unit),
    contentValue: value,
    contentUnit: unit,
    stock: def ? def.stockQuantity : product.stockQuantity ?? '',
    price: def ? def.price : product.price || '',
    oldPrice: (def ? def.oldPrice : product.oldPrice) ?? '',
    sellByStrip: !!strip,
    stripsPerBox,
    stripPrice: strip ? strip.price : '',
    stripOldPrice: strip?.oldPrice ?? '',
  };
}

/** Units per strip when the box content divides evenly across its strips (20 قرص / 2 = 10). */
function perStripCount(s: PackagingState): number | null {
  const strips = Number(s.stripsPerBox);
  if (s.contentValue === '' || !(strips > 1)) return null;
  if (s.contentUnit !== 'tablet' && s.contentUnit !== 'capsule') return null;
  const per = s.contentValue / strips;
  return Number.isInteger(per) ? per : null;
}

/** Whether the strip variant will actually be saved (needs ≥2 strips and a price). */
export function stripIsComplete(s: PackagingState): boolean {
  return s.packageType === 'box' && s.sellByStrip && Number(s.stripsPerBox) > 1 && Number(s.stripPrice) > 0;
}

/**
 * The variants to save: the whole package (default), plus the single strip when enabled.
 * Existing variant ids/SKUs are reused so an edit updates rows instead of replacing them.
 */
export function buildVariants(s: PackagingState, existing: ProductVariant[], baseSku: string): ProductVariant[] {
  const count = Number(s.stock) || 0;
  const content = contentLabel(s.contentValue, s.contentUnit, 'ar');
  const contentEn = contentLabel(s.contentValue, s.contentUnit, 'en');
  const pkgAr = packageLabel(s.packageType, 'ar');
  const pkgEn = packageLabel(s.packageType, 'en');
  // Default first, so its id/SKU stays on the whole-package variant.
  const ordered = [...existing].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const old = (i: number) => ordered[i];

  const variants: ProductVariant[] = [
    {
      id: old(0)?.id || '',
      sku: old(0)?.sku || `${baseSku}-PKG`,
      nameAr: content ? `${pkgAr} ${content}` : pkgAr,
      nameEn: contentEn ? `${pkgEn} ${contentEn}` : pkgEn,
      unitAr: content ?? pkgAr,
      unitEn: contentEn ?? pkgEn,
      unitValue: s.contentValue === '' ? 1 : s.contentValue,
      unitMeasure: s.contentValue === '' ? 'pc' : CONTENT_UNITS[s.contentUnit].measure,
      price: Number(s.price) || 0,
      oldPrice: Number(s.oldPrice) || undefined,
      stockQuantity: count,
      inStock: true,
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    },
  ];

  if (stripIsComplete(s)) {
    const strips = Number(s.stripsPerBox);
    const per = perStripCount(s);
    const perAr = per ? contentLabel(per, s.contentUnit, 'ar') : null;
    const perEn = per ? contentLabel(per, s.contentUnit, 'en') : null;
    variants.push({
      id: old(1)?.id || '',
      sku: old(1)?.sku || `${baseSku}-STRIP`,
      nameAr: perAr ? `شريط (${perAr})` : 'شريط واحد',
      nameEn: perEn ? `Strip (${perEn})` : '1 Strip',
      unitAr: 'شريط',
      unitEn: 'strip',
      unitValue: per ?? 1,
      unitMeasure: 'pc',
      price: Number(s.stripPrice) || 0,
      oldPrice: Number(s.stripOldPrice) || undefined,
      // Independent inventory row per variant: opening strip stock = boxes × strips per box.
      stockQuantity: count * strips,
      inStock: true,
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    });
  }

  return variants;
}
