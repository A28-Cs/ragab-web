/**
 * The chefaa planner (§catalog import, stage 2+3 — chefaa source).
 *
 * Unlike ingest/plan.ts (HyperOne), this does NOT run the keyword classifier: chefaa's own
 * level_one/level_two category on every product already IS the classification (see
 * sources/chefaa/mapping.ts), and chefaa's own brand object is already resolved (no
 * leading-ngram brand guessing needed). What is left to do here is normalization: price,
 * unit/size parsing from the title, description cleanup, and carrying chefaa's extra facet
 * attributes (concentration, size, need_prescription, ...) into `productAttributes` rows via
 * the generic EAV table already in the schema, since chefaa's medicine/cosmetic facets have
 * no dedicated products.* columns.
 *
 * Same artifact contract as plan.ts: import-plan.jsonl (load-ready), review-queue.csv
 * (fallback-classified rows, for the owner to map a missing level_two slug), summary.md.
 */
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { logger } from '../lib/logger';
import { LEAVES, PARENTS, scrub, asciiSlug } from '../db/taxonomy';
import {
  getLatest,
  listFiles,
  newRunId,
  readJson,
  runDir,
  saveManifest,
  setLatest,
  type RunManifest,
} from './artifacts';
import type { ChefaaPageSnapshot, ChefaaProduct } from './sources/chefaa/types';
import { classifyChefaaCategories } from './sources/chefaa/mapping';
import { normalizePrice } from './normalize/price';
import { parseSize, formatUnit } from './normalize/units';

const log = logger().child({ component: 'ingest:chefaa:plan' });

export interface ChefaaAttribute {
  nameAr: string;
  nameEn: string;
  valueAr: string;
  valueEn: string;
}

/** One load-ready chefaa product. Field names mirror the `products` table exactly. */
export interface ChefaaPlanRow {
  id: string;
  sku: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  categoryId: string;
  brandAr: string | null;
  brandEn: string | null;
  unitAr: string;
  unitEn: string;
  unitValue: number | null;
  unitMeasure: 'L' | 'ml' | 'kg' | 'g' | 'pc' | null;
  priceMinor: number;
  oldPriceMinor: number | null;
  currency: 'EGP';
  image: string;
  images: string[];
  descriptionAr: string;
  descriptionEn: string;
  tags: string[];
  isActive: boolean;
  isVisible: boolean;
  inStock: boolean;
  /** Source purchase_count — drives the storefront "popular" sort (products.popularity). */
  popularity: number;
  attributes: ChefaaAttribute[];
  meta: {
    source: 'chefaa';
    sourceUrl: string;
    sourceProductId: number;
    extractedAt: string;
    fallbackClassification: boolean;
    warnings: string[];
  };
}

export interface ChefaaPlanOptions {
  fetchRunId?: string;
  runId?: string;
  limit?: number;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(',')}\n`;
}

/**
 * chefaa's `description_ar`/`description_en` are plain text with HTML entities but no tags
 * (verified live — section headers and bullets are concatenated with no delimiter at all in
 * many rows, which is how the source actually renders it). Decode entities and collapse
 * whitespace; never invent paragraph breaks the source does not have.
 */
function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  const decoded = raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return scrub(decoded).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** chefaa's own slug is already a clean ASCII kebab-case value — reuse it, id-suffixed. */
function buildSlug(item: ChefaaProduct): string {
  const base =
    item.slug && /^[a-z0-9-]+$/i.test(item.slug) ? item.slug.toLowerCase() : asciiSlug(item.title_en) || 'product';
  // chefaa's own `slug` field sometimes already contains "--" (e.g. from a comma in the
  // source title) — collapse and trim so the result still passes the ASCII slug hygiene
  // check (products_slug_uidx) the same way asciiSlug() does for the HyperOne source.
  const collapsed = `chefaa-${base}-${item.id}`.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return collapsed.slice(0, 160);
}

const ATTR_FIELDS: Array<{ key: keyof ChefaaProduct; nameAr: string; nameEn: string }> = [
  { key: 'concentration', nameAr: 'التركيز', nameEn: 'Concentration' },
  { key: 'size', nameAr: 'الحجم', nameEn: 'Size' },
  { key: 'pack-size', nameAr: 'حجم العبوة', nameEn: 'Pack Size' },
  { key: 'formulation', nameAr: 'الشكل الدوائي', nameEn: 'Formulation' },
  { key: 'product-type', nameAr: 'نوع المنتج', nameEn: 'Product Type' },
  { key: 'scent', nameAr: 'الرائحة', nameEn: 'Scent' },
  { key: 'color', nameAr: 'اللون', nameEn: 'Color' },
  { key: 'flavor', nameAr: 'النكهة', nameEn: 'Flavor' },
  { key: 'skin-type', nameAr: 'نوع البشرة', nameEn: 'Skin Type' },
  { key: 'hair-type', nameAr: 'نوع الشعر', nameEn: 'Hair Type' },
  { key: 'hair-color', nameAr: 'لون الشعر', nameEn: 'Hair Color' },
  { key: 'age-range', nameAr: 'الفئة العمرية', nameEn: 'Age Range' },
  { key: 'suitable-for', nameAr: 'مناسب لـ', nameEn: 'Suitable For' },
  { key: 'free-from', nameAr: 'خالي من', nameEn: 'Free From' },
  { key: 'special-features', nameAr: 'خصائص إضافية', nameEn: 'Special Features' },
  { key: 'oral-care', nameAr: 'العناية بالفم', nameEn: 'Oral Care' },
];

function buildAttributes(item: ChefaaProduct): ChefaaAttribute[] {
  const out: ChefaaAttribute[] = [];
  for (const f of ATTR_FIELDS) {
    const raw = item[f.key];
    if (typeof raw === 'string' && raw.trim()) {
      out.push({ nameAr: f.nameAr, nameEn: f.nameEn, valueAr: raw.trim(), valueEn: raw.trim() });
    } else if (Array.isArray(raw) && raw.length) {
      const v = raw.filter((x) => typeof x === 'string').join(', ');
      if (v) out.push({ nameAr: f.nameAr, nameEn: f.nameEn, valueAr: v, valueEn: v });
    }
  }
  if (item.type) out.push({ nameAr: 'نوع المنتج', nameEn: 'Product Type', valueAr: item.type, valueEn: item.type });
  if (item.need_prescription) {
    out.push({
      nameAr: 'يتطلب وصفة طبية',
      nameEn: 'Requires Prescription',
      valueAr: 'نعم',
      valueEn: 'Yes',
    });
  }
  return out;
}

async function loadSnapshots(dir: string): Promise<Map<number, ChefaaProduct>> {
  const files = (await listFiles(dir, '.json')).filter((f) => f.startsWith('products.bucket-'));
  const out = new Map<number, ChefaaProduct>();
  for (const f of files) {
    const snap = await readJson<ChefaaPageSnapshot>(join(dir, f));
    for (const item of snap.items) out.set(item.id, item);
  }
  return out;
}

/**
 * Owner decision (2026-09-25): Viagra/sildenafil stays out of the "popular" ranking even
 * though it is a genuine best seller — it would otherwise sit in the medications top 10.
 */
const NEVER_POPULAR = /فياجر|فياغر|viagra|سيلدينافيل|سيلدنافيل|sildenafil/i;

function popularityOf(item: ChefaaProduct): number {
  if (NEVER_POPULAR.test(`${item.title_ar ?? ''} ${item.title_en ?? ''}`)) return 0;
  return Math.max(0, Math.trunc(item.purchase_count ?? 0));
}

export async function buildChefaaPlan(opts: ChefaaPlanOptions = {}): Promise<{ runId: string; dir: string }> {
  const fetchRunId = opts.fetchRunId ?? (await getLatest('fetch:chefaa'));
  if (!fetchRunId) throw new Error('no chefaa fetch run found — run fetch-chefaa first');
  const fetchDir = runDir('fetch', fetchRunId, 'chefaa');

  const runId = opts.runId ?? newRunId();
  const dir = runDir('plan', runId, 'chefaa');
  const startedAt = new Date().toISOString();

  const products = await loadSnapshots(fetchDir);
  log.info({ count: products.size, fetchRunId }, 'snapshots loaded');

  const rows: ChefaaPlanRow[] = [];
  const reviewRows: string[] = [];
  const perLeaf = new Map<string, number>();
  let droppedBadLeaf = 0;
  let droppedNoPrice = 0;
  let fallbackCount = 0;
  let withImages = 0;
  let withDescription = 0;
  let inStockCount = 0;
  let outOfStockCount = 0;
  let withPrescription = 0;

  for (const item of products.values()) {
    if (opts.limit && rows.length >= opts.limit) break;

    const nameAr = scrub(item.title_ar ?? '');
    const nameEn = item.title_en ? scrub(item.title_en) : null;
    if (!nameAr) {
      droppedBadLeaf += 1;
      continue;
    }

    const cls = classifyChefaaCategories(
      item.level_one_category?.slug ?? null,
      (item.level_two_category ?? []).map((c) => c.slug),
      item.level_three_category ?? null,
    );
    const leaf = LEAVES.get(cls.leafId);
    if (!leaf) {
      droppedBadLeaf += 1;
      reviewRows.push(
        csvLine([item.id, nameAr, nameEn ?? '', item.level_one_category?.slug ?? '', 'NO_LEAF', cls.leafId]),
      );
      continue;
    }
    if (cls.fallback) {
      fallbackCount += 1;
      reviewRows.push(
        csvLine([
          item.id,
          nameAr,
          nameEn ?? '',
          item.level_one_category?.slug ?? '',
          (item.level_two_category ?? []).map((c) => c.slug).join('|'),
          'FALLBACK_TO_' + cls.leafId,
        ]),
      );
    }

    const price = normalizePrice({
      regular: Number.isFinite(item.price) ? item.price : null,
      final: Number.isFinite(item.final_price) ? item.final_price : item.price ?? null,
      currency: 'EGP',
      percentOff: typeof item.discount === 'number' ? item.discount : null,
    });
    if (price.priceMinor <= 0) {
      droppedNoPrice += 1;
      reviewRows.push(csvLine([item.id, nameAr, nameEn ?? '', leaf.id, 'PRICE_MISSING']));
      continue;
    }

    const size = parseSize(nameAr);
    const unitAr = formatUnit(size, 'ar');
    const unitEn = formatUnit(size, 'en');

    const descriptionAr = cleanDescription(item.description_ar) || nameAr;
    const descriptionEn = cleanDescription(item.description_en) || nameEn || '';
    if (item.description_ar || item.description_en) withDescription += 1;

    const images = [item.image].filter((u): u is string => !!u);
    if (images.length) withImages += 1;

    const inStock = item.in_stock === true && item.out_of_stock !== true;
    if (inStock) inStockCount += 1;
    else outOfStockCount += 1;
    if (item.need_prescription) withPrescription += 1;

    // chefaa's own level_three_category occasionally repeats the department's own name
    // (e.g. "العناية بالشعر" showing up as a "condition" tag on a hair-care product) — drop
    // anything that duplicates a top-level department name, or it leaks a category into tags.
    const parentNames = new Set(
      [...PARENTS.values()].flatMap((p) => [p.nameAr, p.nameEn]),
    );
    const tags = [
      ...cls.level3TagsAr,
      ...(item.type ? [item.type] : []),
      ...(item.need_prescription ? ['يتطلب وصفة طبية'] : []),
    ].filter((t, i, arr) => arr.indexOf(t) === i && !parentNames.has(t));

    rows.push({
      id: `prod_chefaa_${item.id}`,
      sku: `chefaa-${item.id}`,
      slug: buildSlug(item),
      nameAr,
      nameEn,
      categoryId: leaf.id,
      brandAr: item.brands?.title_ar ? scrub(item.brands.title_ar) : null,
      brandEn: item.brands?.title_en ? scrub(item.brands.title_en) : null,
      unitAr,
      unitEn,
      unitValue: size.unitValue,
      unitMeasure: size.unitMeasure,
      priceMinor: price.priceMinor,
      oldPriceMinor: price.oldPriceMinor,
      currency: 'EGP',
      image: images[0] ?? '',
      images: images.slice(1),
      descriptionAr,
      descriptionEn,
      tags,
      isActive: item.status === 'active' && item.active !== false,
      isVisible: item.status === 'active' && !cls.fallback,
      inStock,
      popularity: popularityOf(item),
      attributes: buildAttributes(item),
      meta: {
        source: 'chefaa',
        sourceUrl: item.full_url,
        sourceProductId: item.id,
        extractedAt: new Date().toISOString(),
        fallbackClassification: cls.fallback,
        warnings: price.warnings,
      },
    });
    perLeaf.set(leaf.id, (perLeaf.get(leaf.id) ?? 0) + 1);
  }

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'import-plan.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''),
    'utf8',
  );
  await writeFile(
    join(dir, 'review-queue.csv'),
    `﻿${csvLine(['sourceId', 'nameAr', 'nameEn', 'level1', 'level2OrLeaf', 'reason'])}${reviewRows.join('')}`,
    'utf8',
  );

  const perDept = new Map<string, number>();
  for (const [leafId, n] of perLeaf) {
    const dept = LEAVES.get(leafId)?.parent.nameAr ?? leafId;
    perDept.set(dept, (perDept.get(dept) ?? 0) + n);
  }
  const summaryLines: string[] = [
    `# chefaa import plan — ${runId}`,
    '',
    `Source fetch run: \`${fetchRunId}\``,
    '',
    '## Totals',
    '',
    '| | count |',
    '|---|---:|',
    `| source products (unique id) | ${products.size} |`,
    `| **planned for import** | **${rows.length}** |`,
    `| dropped — no leaf resolved | ${droppedBadLeaf} |`,
    `| dropped — missing/invalid price | ${droppedNoPrice} |`,
    `| classified via department fallback (review) | ${fallbackCount} |`,
    `| with at least one image | ${withImages} |`,
    `| with a description | ${withDescription} |`,
    `| in stock | ${inStockCount} |`,
    `| out of stock | ${outOfStockCount} |`,
    `| requires prescription | ${withPrescription} |`,
    '',
    '## Per department',
    '',
    '| department | products |',
    '|---|---:|',
    ...[...perDept.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `| ${d} | ${n} |`),
    '',
    '## Next steps',
    '',
    '1. Read `review-queue.csv` — every row that fell back to a department-level "Other" leaf.',
    '2. Add the missing `level_two_category.slug` to `ingest/sources/chefaa/mapping.ts` and re-run.',
    '',
  ];
  await writeFile(join(dir, 'summary.md'), summaryLines.join('\n'), 'utf8');

  const manifest: RunManifest = {
    runId,
    stage: 'plan',
    source: 'chefaa',
    startedAt,
    finishedAt: new Date().toISOString(),
    status: 'complete',
    inputs: [{ stage: 'fetch', runId: fetchRunId }],
    counts: {
      sourceProducts: products.size,
      planned: rows.length,
      droppedBadLeaf,
      droppedNoPrice,
      fallbackCount,
      withImages,
      withDescription,
      inStockCount,
      outOfStockCount,
      withPrescription,
    },
    warnings: [],
  };
  await saveManifest(dir, manifest);
  await setLatest('plan:chefaa', runId);

  log.info({ runId, dir, planned: rows.length, fallbackCount }, 'chefaa plan complete');
  return { runId, dir };
}
