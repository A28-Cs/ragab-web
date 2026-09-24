/**
 * The planner (§catalog import, stage 2+3 driver).
 *
 * Reads the raw fetch snapshots and produces a LOAD-READY, reviewable plan. It is pure: no
 * network, no database. That is what makes it safe to run repeatedly while tuning the
 * classifier, and it is why the review loop converges — a human reads review-queue.csv, writes
 * decisions into db/taxonomy/overrides.ts, and re-runs this.
 *
 * Outputs, into the run directory:
 *   import-plan.jsonl     one row per product, exactly the values the loader will write
 *   review-queue.csv      Arabic name, source paths, candidates, a blank decision column
 *   brands-unmatched.csv  products whose brand could not be resolved, to grow the gazetteer
 *   summary.md            per-department counts, confidence histogram, drop reasons
 */
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { logger } from '../lib/logger';
import {
  LEAVES,
  PARENTS,
  TAXONOMY,
  asciiSlug,
  scrub,
  type Leaf,
} from '../db/taxonomy';
import {
  getLatest,
  listFiles,
  newRunId,
  readJson,
  runDir,
  saveManifest,
  setLatest,
  summarizeWarnings,
  type RunManifest,
} from './artifacts';
import type { PageSnapshot, RawProduct } from './sources/hyperone/fetch';
import { formatUnit, parseSize, reconcileSize, type ParsedSize } from './normalize/units';
import { buildLeadingNgramIndex, parseBrand, stripBrand } from './normalize/parse-name';
import { normalizePrice } from './normalize/price';
import { describe } from './normalize/describe';
import { classify, dispositionOf, type ClassifyResult } from './classify/classify';

const log = logger().child({ component: 'ingest:plan' });

/** One load-ready product. Field names mirror the `products` table exactly. */
export interface PlanRow {
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
  /** Audit trail — not columns, but carried in the artifact and the report. */
  meta: {
    tier: string;
    confidence: number;
    ambiguous: boolean;
    ruleNote?: string;
    sourcePaths: string[];
    packCount: number | null;
    warnings: string[];
    hyperoneId: number;
  };
}

export interface PlanOptions {
  fetchRunId?: string;
  runId?: string;
  /** Cap for smoke runs. */
  limit?: number;
  /** Only this top-level category id. */
  only?: string;
}

interface Joined {
  sku: string;
  ar: RawProduct;
  en: RawProduct | null;
}

async function loadSnapshots(dir: string, lang: 'en' | 'ar'): Promise<Map<string, RawProduct>> {
  const files = (await listFiles(dir, '.json')).filter((f) => f.startsWith(`products.${lang}.`));
  const out = new Map<string, RawProduct>();
  for (const f of files) {
    const snap = await readJson<PageSnapshot>(join(dir, f));
    for (const item of snap.items) if (item.sku) out.set(item.sku, item);
  }
  return out;
}

/** Prefer a larger rendition than the storefront thumbnail; the PDP needs more than 250px. */
function imageUrl(raw: string | null | undefined, width = 800): string {
  if (!raw) return '';
  const base = raw.split('?')[0]!;
  return `${base}?width=${width}&format=webp`;
}

/** Deterministic, ASCII-safe, fixed-length fallback for a non-EAN sku (see the id/slug note). */
function shortHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

/**
 * The id/slug-safe form of a HyperOne sku. Most skus are already an 8-14 digit EAN and pass
 * through unchanged; anything else (verified live: some products carry their full name in the
 * sku field) becomes a deterministic, ASCII-only, fixed-length hash instead — so a re-run
 * still converges on the same id, and the value can never break products_slug_uidx's ASCII
 * hygiene the way a raw multi-word name with spaces and punctuation would.
 */
export function safeIdSku(sku: string): string {
  return /^\d{8,14}$/.test(sku) ? sku : `x${shortHash(sku)}`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(',')}\n`;
}

export async function buildPlan(opts: PlanOptions = {}): Promise<{ runId: string; dir: string }> {
  const fetchRunId = opts.fetchRunId ?? (await getLatest('fetch:hyperone'));
  if (!fetchRunId) throw new Error('no hyperone fetch run found — run the fetch stage first');
  const fetchDir = runDir('fetch', fetchRunId, 'hyperone');

  const runId = opts.runId ?? newRunId();
  const dir = runDir('plan', runId);
  const startedAt = new Date().toISOString();

  const [enMap, arMap] = await Promise.all([
    loadSnapshots(fetchDir, 'en'),
    loadSnapshots(fetchDir, 'ar'),
  ]);
  log.info({ en: enMap.size, ar: arMap.size, fetchRunId }, 'snapshots loaded');

  // Arabic is the required language (products.nameAr is NOT NULL), so it drives the join.
  const joined: Joined[] = [...arMap.entries()].map(([sku, ar]) => ({
    sku,
    ar,
    en: enMap.get(sku) ?? null,
  }));
  const enOnly = [...enMap.keys()].filter((k) => !arMap.has(k));

  // The brand index needs the whole catalog's descriptors before any single product can be
  // resolved, so size parsing happens in two passes.
  const sizes = new Map<string, { ar: ParsedSize; en: ParsedSize | null; merged: ParsedSize; warnings: string[] }>();
  for (const j of joined) {
    const ar = parseSize(j.ar.name);
    const en = j.en ? parseSize(j.en.name) : null;
    const { size, warnings } = reconcileSize(en, ar, j.ar.url_key ?? j.en?.url_key ?? null);
    sizes.set(j.sku, { ar, en, merged: size, warnings });
  }
  const leadingIndex = buildLeadingNgramIndex(
    joined.map((j) => sizes.get(j.sku)!.en?.descriptor ?? ''),
  );
  log.info({ ngrams: leadingIndex.size }, 'brand index built');

  const rows: PlanRow[] = [];
  const reviewRows: string[] = [];
  const brandUnmatched: string[] = [];
  const allWarnings: Array<{ code: string; key: string }> = [];
  const perLeaf = new Map<string, number>();
  const dropped = { outOfScope: 0, unclassified: 0, price: 0, filtered: 0 };
  const tierCount = new Map<string, number>();
  const confidenceBuckets = new Map<string, number>();

  for (const j of joined) {
    if (opts.limit && rows.length >= opts.limit) break;

    const size = sizes.get(j.sku)!;
    const nameAr = scrub(j.ar.name);
    const nameEn = j.en ? scrub(j.en.name) : null;
    const sourcePaths = (j.ar.categories ?? [])
      .concat(j.en?.categories ?? [])
      .map((c) => c.url_path)
      .filter((p): p is string => !!p);
    const uniquePaths = [...new Set(sourcePaths)];

    const result: ClassifyResult = classify({
      sku: j.sku,
      nameAr,
      nameEn,
      descriptorAr: size.ar.descriptor,
      descriptorEn: size.en?.descriptor ?? null,
      sourcePaths: uniquePaths,
    });

    for (const w of new Set([...result.warnings, ...size.warnings])) {
      allWarnings.push({ code: w, key: j.sku });
    }

    const disposition = dispositionOf(result);
    if (disposition === 'skip') {
      if (result.outOfScope) dropped.outOfScope += 1;
      else {
        dropped.unclassified += 1;
        reviewRows.push(
          csvLine([j.sku, nameAr, nameEn ?? '', uniquePaths.join(' | '), 'UNCLASSIFIED', '', '', '']),
        );
      }
      continue;
    }

    const leaf = LEAVES.get(result.leafId) as Leaf;
    if (opts.only && leaf.parent.id !== opts.only) {
      dropped.filtered += 1;
      continue;
    }

    const price = normalizePrice({
      regular: j.ar.price_range?.minimum_price?.regular_price?.value ?? null,
      final: j.ar.price_range?.minimum_price?.final_price?.value ?? null,
      currency: j.ar.price_range?.minimum_price?.final_price?.currency ?? 'EGP',
      percentOff: j.ar.price_range?.minimum_price?.discount?.percent_off ?? null,
      specialPrice: j.ar.special_price ?? null,
    });
    for (const w of price.warnings) allWarnings.push({ code: w, key: j.sku });
    if (price.priceMinor <= 0 || price.warnings.some((w) => w.startsWith('PRICE_'))) {
      dropped.price += 1;
      reviewRows.push(
        csvLine([j.sku, nameAr, nameEn ?? '', uniquePaths.join(' | '), 'PRICE_SUSPECT', leaf.id, price.priceMinor, price.warnings.join(';')]),
      );
      continue;
    }

    const brand = parseBrand(size.ar.descriptor, size.en?.descriptor ?? null, leadingIndex);
    if (!brand.brandEn && !brand.brandAr) {
      brandUnmatched.push(csvLine([j.sku, nameAr, nameEn ?? '', leaf.id]));
    }

    const unitIsFallback = size.merged.unitMeasure === null;
    const unitAr = formatUnit(size.merged, 'ar');
    const unitEn = formatUnit(size.merged, 'en');

    /*
     * Strip the brand out of the descriptor before describing, or the sentence says it twice:
     * "حلة تروفال - 20سم من تروفال." The brand is reintroduced deliberately by describe() in
     * the "من <brand>" / "from <brand>" clause.
     */
    const desc = describe({
      nameAr,
      nameEn,
      descriptorAr: stripBrand(size.ar.descriptor, brand.brandAr),
      descriptorEn: stripBrand(size.en?.descriptor ?? '', brand.brandEn) || null,
      brandAr: brand.brandAr,
      brandEn: brand.brandEn,
      unitAr,
      unitEn,
      unitIsFallback,
      leaf,
    });

    /*
     * Deterministic ids + an ASCII slug built from the EAN, so a re-run converges on the same
     * four rows and never collides on products_slug_uidx.
     *
     * NOT every HyperOne `sku` is a clean digit-only EAN — verified live: 11 products (Rush
     * Brush hair tools, Turkish coffee makers, an Ariston water heater, a Lavvento cable) carry
     * their full product NAME in the `sku` field instead of a barcode. Appending that raw
     * string to a slug produced a 100+ char, space-containing, non-ASCII value that failed the
     * slug hygiene check outright. All 11 happen to also be out-of-scope electronics, so they
     * are dropped before this point runs today — but the guard stays, because nothing
     * guarantees HyperOne's data stays clean on the next refresh.
     */
    const idSafeSku = safeIdSku(j.sku);
    const slugBase = nameEn ? asciiSlug(nameEn) : '';
    const slug = slugBase ? `${slugBase}-${idSafeSku}` : `product-${idSafeSku}`;

    const gallery = (j.ar.media_gallery ?? [])
      .filter((g) => g.url)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((g) => imageUrl(g.url))
      .filter((u, i, arr) => arr.indexOf(u) === i);
    const main = imageUrl(j.ar.image?.url) || gallery[0] || '';

    rows.push({
      id: `prod_${idSafeSku}`,
      sku: j.sku,
      slug: slug.slice(0, 160),
      nameAr,
      nameEn,
      categoryId: leaf.id,
      brandAr: brand.brandAr,
      brandEn: brand.brandEn,
      unitAr,
      unitEn,
      unitValue: size.merged.unitValue,
      unitMeasure: size.merged.unitMeasure,
      priceMinor: price.priceMinor,
      oldPriceMinor: price.oldPriceMinor,
      currency: 'EGP',
      image: main,
      images: gallery.filter((g) => g !== main).slice(0, 8),
      descriptionAr: desc.descriptionAr,
      descriptionEn: desc.descriptionEn,
      tags: result.tags,
      isActive: true,
      // Per the owner's decision prices are live selling prices, so products are visible —
      // except anything the classifier is not confident about, which stays hidden until a
      // human clears it.
      isVisible: disposition === 'assign',
      inStock: (j.ar.stock_status ?? '').toUpperCase() === 'IN_STOCK',
      meta: {
        tier: result.tier,
        confidence: result.confidence,
        ambiguous: result.ambiguous,
        ruleNote: result.ruleNote,
        sourcePaths: uniquePaths,
        packCount: size.merged.packCount,
        warnings: [...new Set([...result.warnings, ...size.warnings, ...price.warnings])],
        hyperoneId: j.ar.id,
      },
    });

    perLeaf.set(leaf.id, (perLeaf.get(leaf.id) ?? 0) + 1);
    tierCount.set(result.tier, (tierCount.get(result.tier) ?? 0) + 1);
    const bucket =
      result.confidence >= 0.9 ? '0.90+' : result.confidence >= 0.75 ? '0.75-0.89' : '0.40-0.74';
    confidenceBuckets.set(bucket, (confidenceBuckets.get(bucket) ?? 0) + 1);

    if (result.confidence < 0.9 || result.ambiguous) {
      reviewRows.push(
        csvLine([
          j.sku,
          nameAr,
          nameEn ?? '',
          uniquePaths.join(' | '),
          result.ambiguous ? 'AMBIGUOUS' : 'LOW_CONFIDENCE',
          leaf.id,
          `${leaf.parent.nameAr} → ${leaf.nameAr}`,
          result.losingLeaves.map((id) => LEAVES.get(id)?.nameAr ?? id).join(' | '),
        ]),
      );
    }
  }

  /* ── Write artifacts ──────────────────────────────────────────────────────────────── */

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'import-plan.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''),
    'utf8',
  );

  const reviewHeader = csvLine([
    'sku', 'nameAr', 'nameEn', 'sourcePaths', 'reason', 'assignedLeaf', 'assignedName',
    'alternatives',
  ]);
  await writeFile(join(dir, 'review-queue.csv'), `﻿${reviewHeader}${reviewRows.join('')}`, 'utf8');
  await writeFile(
    join(dir, 'brands-unmatched.csv'),
    `﻿${csvLine(['sku', 'nameAr', 'nameEn', 'leaf'])}${brandUnmatched.join('')}`,
    'utf8',
  );

  const emptyLeaves = [...LEAVES.values()].filter((l) => !perLeaf.has(l.id));
  const summary = buildSummaryMarkdown({
    runId,
    fetchRunId,
    total: joined.length,
    rows: rows.length,
    dropped,
    tierCount,
    confidenceBuckets,
    perLeaf,
    emptyLeaves,
    reviewCount: reviewRows.length,
    brandUnmatched: brandUnmatched.length,
    enOnly: enOnly.length,
  });
  await writeFile(join(dir, 'summary.md'), summary, 'utf8');

  const manifest: RunManifest = {
    runId,
    stage: 'plan',
    source: 'hyperone',
    startedAt,
    finishedAt: new Date().toISOString(),
    status: 'complete',
    inputs: [{ stage: 'fetch', runId: fetchRunId }],
    counts: {
      sourceProducts: joined.length,
      planned: rows.length,
      droppedOutOfScope: dropped.outOfScope,
      droppedUnclassified: dropped.unclassified,
      droppedPrice: dropped.price,
      droppedFiltered: dropped.filtered,
      reviewQueue: reviewRows.length,
      brandUnmatched: brandUnmatched.length,
      leavesPopulated: perLeaf.size,
      leavesEmpty: emptyLeaves.length,
    },
    warnings: summarizeWarnings(allWarnings),
  };
  await saveManifest(dir, manifest);
  await setLatest('plan', runId);

  log.info({ runId, dir, planned: rows.length, review: reviewRows.length }, 'plan complete');
  return { runId, dir };
}

function buildSummaryMarkdown(d: {
  runId: string;
  fetchRunId: string;
  total: number;
  rows: number;
  dropped: { outOfScope: number; unclassified: number; price: number; filtered: number };
  tierCount: Map<string, number>;
  confidenceBuckets: Map<string, number>;
  perLeaf: Map<string, number>;
  emptyLeaves: Leaf[];
  reviewCount: number;
  brandUnmatched: number;
  enOnly: number;
}): string {
  const lines: string[] = [];
  lines.push(`# Catalog import plan — ${d.runId}`, '');
  lines.push(`Source fetch run: \`${d.fetchRunId}\` (HyperOne Magento GraphQL)`, '');
  lines.push('## Totals', '');
  lines.push('| | count |', '|---|---:|');
  lines.push(`| source products | ${d.total} |`);
  lines.push(`| **planned for import** | **${d.rows}** |`);
  lines.push(`| dropped — outside the 25 sections | ${d.dropped.outOfScope} |`);
  lines.push(`| dropped — unclassified (review) | ${d.dropped.unclassified} |`);
  lines.push(`| dropped — suspect price | ${d.dropped.price} |`);
  if (d.dropped.filtered) lines.push(`| dropped — --only filter | ${d.dropped.filtered} |`);
  lines.push(`| review queue | ${d.reviewCount} |`);
  lines.push(`| brand unresolved | ${d.brandUnmatched} |`);
  lines.push(`| present in EN store but not AR | ${d.enOnly} |`);
  lines.push('');

  lines.push('## Classification tiers', '');
  lines.push('| tier | meaning | count |', '|---|---|---:|');
  const tierMeaning: Record<string, string> = {
    A: 'manual override (overrides.ts)',
    B: "source-path rule (HyperOne's own tree)",
    C: 'keyword match on the name',
  };
  for (const [t, n] of [...d.tierCount.entries()].sort()) {
    lines.push(`| ${t} | ${tierMeaning[t] ?? ''} | ${n} |`);
  }
  lines.push('');

  lines.push('## Confidence', '');
  lines.push('| band | visible? | count |', '|---|---|---:|');
  for (const band of ['0.90+', '0.75-0.89', '0.40-0.74']) {
    const n = d.confidenceBuckets.get(band) ?? 0;
    lines.push(`| ${band} | ${band === '0.40-0.74' ? 'hidden' : 'yes'} | ${n} |`);
  }
  lines.push('');

  lines.push('## Per department', '');
  lines.push('| # | department | products | subcategories populated |', '|---:|---|---:|---|');
  for (const p of TAXONOMY) {
    const total = p.children.reduce((s, c) => s + (d.perLeaf.get(c.id) ?? 0), 0);
    const filled = p.children.filter((c) => d.perLeaf.has(c.id)).length;
    lines.push(`| ${p.sortOrder / 100} | ${p.nameAr} — ${p.nameEn} | ${total} | ${filled}/${p.children.length} |`);
  }
  lines.push('');

  if (d.emptyLeaves.length) {
    lines.push('## Empty subcategories', '');
    lines.push(
      'These matched no product. Either the source does not stock them, or a rule needs adding.',
      '',
    );
    for (const l of d.emptyLeaves) {
      lines.push(`- \`${l.id}\` — ${l.parent.nameAr} → ${l.nameAr}`);
    }
    lines.push('');
  }

  lines.push('## Next steps', '');
  lines.push('1. Read `review-queue.csv` and fill in the `decision` column.');
  lines.push('2. Move decisions into `src/db/taxonomy/overrides.ts` (tier A, highest confidence).');
  lines.push('3. Re-run the planner — tier A is checked in, so the loop converges.');
  lines.push('4. Grow `src/db/taxonomy/brands.ts` from `brands-unmatched.csv`.');
  lines.push('');
  return lines.join('\n');
}
