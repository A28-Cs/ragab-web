/**
 * HyperOne fetch stage (§catalog import, stage 1).
 *
 * Sweeps the entire catalog twice — once per Magento store view — and writes verbatim
 * snapshots. Roughly 60 requests and under a minute for ~8,500 products.
 *
 * EN and AR are deliberately NOT joined here. Snapshots stay exactly as the API returned
 * them, per store view, and the join on `sku` happens in normalize. Two reasons: normalize
 * stays re-runnable with no network, and an EN/AR skew (a sku present in one view only)
 * shows up as data rather than being hidden by a lossy merge.
 */
import { join } from 'node:path';
import { logger } from '../../../lib/logger';
import {
  type RunManifest,
  type RunState,
  newRunId,
  readJson,
  runDir,
  saveManifest,
  saveState,
  setLatest,
  loadState,
  writeJsonAtomic,
  fileExists,
} from '../../artifacts';
import { HyperOneClient, type Lang, STORE_VIEWS, queryHash } from './client';
import { AVAILABLE_STORES, CATEGORY_TREE, PRODUCT_SWEEP, SWEEP_PREFLIGHT } from './queries';

const log = logger().child({ component: 'ingest:hyperone:fetch' });

const PAGE_SIZE = 300;
/** Observed 8,506. A count outside this band means the sweep filter stopped working. */
const EXPECTED_MIN = 7_000;
const EXPECTED_MAX = 12_000;

export interface RawCategory {
  uid: string;
  id: number;
  name: string;
  url_key: string | null;
  url_path: string | null;
  level: number;
  position: number;
  include_in_menu: number | null;
  product_count: number;
  image: string | null;
  children_count: string | null;
}

export interface RawProduct {
  uid: string;
  id: number;
  sku: string;
  name: string;
  url_key: string | null;
  stock_status: string | null;
  special_price: number | null;
  meta_title: string | null;
  meta_description: string | null;
  image: { url: string | null; label: string | null } | null;
  media_gallery: Array<{ url: string | null; label: string | null; position: number | null }> | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number | null; currency: string | null };
      final_price: { value: number | null; currency: string | null };
      discount: { percent_off: number | null; amount_off: number | null } | null;
    };
  };
  categories: Array<{ uid: string; id: number; name: string; url_path: string | null; level: number }> | null;
  weight: number | null;
}

export interface PageSnapshot {
  meta: {
    source: 'hyperone';
    storeView: string;
    lang: Lang;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    fetchedAt: string;
    httpStatus: number;
    durationMs: number;
    attempts: number;
    /** Refuse to normalize a snapshot produced by a different selection set. */
    queryHash: string;
  };
  items: RawProduct[];
}

export interface CategorySnapshot {
  meta: { source: 'hyperone'; lang: Lang; storeView: string; fetchedAt: string; totalCount: number };
  items: RawCategory[];
}

export interface FetchOptions {
  /** Resume an existing run instead of starting a new one. */
  runId?: string;
  /** Stop after N pages per store view — for smoke tests. */
  maxPages?: number;
  concurrency?: number;
  ratePerSecond?: number;
}

function pageFile(dir: string, lang: Lang, page: number): string {
  return join(dir, `products.${lang}.page-${String(page).padStart(3, '0')}.json`);
}

function categoryFile(dir: string, lang: Lang): string {
  return join(dir, `categories.${lang}.json`);
}

/**
 * A resumed page counts as done only if its file re-parses AND carries the expected item
 * count and the current queryHash. Trusting `_state.json` alone would silently keep a
 * truncated or stale-shaped page.
 */
async function pageIsValid(path: string, expectedHash: string): Promise<number | null> {
  if (!fileExists(path)) return null;
  try {
    const snap = await readJson<PageSnapshot>(path);
    if (snap.meta.queryHash !== expectedHash) return null;
    if (!Array.isArray(snap.items)) return null;
    return snap.items.length;
  } catch {
    return null;
  }
}

export async function fetchHyperOne(opts: FetchOptions = {}): Promise<{ runId: string; dir: string }> {
  const runId = opts.runId ?? newRunId();
  const dir = runDir('fetch', runId, 'hyperone');
  const startedAt = new Date().toISOString();
  const hash = queryHash(PRODUCT_SWEEP, { pageSize: PAGE_SIZE });

  const client = new HyperOneClient({
    concurrency: opts.concurrency ?? 4,
    ratePerSecond: opts.ratePerSecond ?? 6,
    onRetry: ({ attempt, waitMs, error }) =>
      log.warn({ attempt, waitMs, err: String(error).slice(0, 200) }, 'retrying'),
  });

  const prior = opts.runId ? await loadState(dir) : null;
  const completed = new Set<string>(prior?.completed ?? []);
  const state: RunState = {
    runId,
    stage: 'fetch',
    completed: [...completed],
    status: 'running',
    updatedAt: startedAt,
  };
  await saveState(dir, state);

  const manifest: RunManifest = {
    runId,
    stage: 'fetch',
    source: 'hyperone',
    startedAt,
    finishedAt: null,
    status: 'running',
    inputs: [],
    counts: {},
    warnings: [],
    queryHash: hash,
    notes: [],
  };
  await saveManifest(dir, manifest);

  // ── Store views: assert the two we depend on still exist ─────────────────────────────
  const stores = await client.query<{
    availableStores: Array<{ store_code: string; locale: string }>;
  }>(AVAILABLE_STORES, {}, 'en');
  const codes = new Set(stores.data.availableStores.map((s) => s.store_code));
  for (const [lang, code] of Object.entries(STORE_VIEWS)) {
    if (!codes.has(code)) {
      throw new Error(
        `store view '${code}' (${lang}) no longer exists — available: ${[...codes].join(', ')}`,
      );
    }
  }
  log.info({ stores: [...codes] }, 'store views confirmed');

  // ── Preflight: the guard that catches a silently-empty sweep filter ──────────────────
  const pre = await client.query<{ products: { total_count: number } }>(SWEEP_PREFLIGHT, {}, 'en');
  const totalCount = pre.data.products.total_count;
  if (totalCount < EXPECTED_MIN || totalCount > EXPECTED_MAX) {
    // This is precisely how `price: { from: "0" }` (which returns 0) was caught.
    throw new Error(
      `sweep preflight returned ${totalCount}, outside the expected ${EXPECTED_MIN}-${EXPECTED_MAX}. ` +
        'The sweep filter in queries.ts has stopped matching the catalog — do NOT proceed, ' +
        'a partial sweep looks exactly like a successful one downstream.',
    );
  }
  log.info({ totalCount }, 'preflight ok');

  // ── Category trees, both languages ───────────────────────────────────────────────────
  for (const lang of ['en', 'ar'] as const) {
    const key = `categories:${lang}`;
    const path = categoryFile(dir, lang);
    if (completed.has(key) && fileExists(path)) {
      log.info({ lang }, 'categories already fetched, skipping');
      continue;
    }
    const res = await client.query<{ categories: { total_count: number; items: RawCategory[] } }>(
      CATEGORY_TREE,
      {},
      lang,
    );
    const snap: CategorySnapshot = {
      meta: {
        source: 'hyperone',
        lang,
        storeView: STORE_VIEWS[lang],
        fetchedAt: new Date().toISOString(),
        totalCount: res.data.categories.total_count,
      },
      items: res.data.categories.items,
    };
    await writeJsonAtomic(path, snap);
    completed.add(key);
    state.completed = [...completed];
    await saveState(dir, state);
    manifest.counts[`categories_${lang}`] = snap.items.length;
    log.info({ lang, count: snap.items.length }, 'categories fetched');
  }

  // ── Product sweep, both languages ────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pageCount = opts.maxPages ? Math.min(opts.maxPages, totalPages) : totalPages;
  let itemsFetched = 0;
  let pagesSkipped = 0;

  for (const lang of ['en', 'ar'] as const) {
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
    // The client's own limiter bounds concurrency, so firing all pages is safe and keeps the
    // code simple — the bucket, not this loop, is what paces the request rate.
    const results = await Promise.all(
      pages.map(async (page) => {
        const key = `${lang}:page-${String(page).padStart(3, '0')}`;
        const path = pageFile(dir, lang, page);

        if (completed.has(key)) {
          const valid = await pageIsValid(path, hash);
          if (valid !== null) {
            pagesSkipped += 1;
            return valid;
          }
          log.warn({ key }, 'completed page failed revalidation — refetching');
        }

        const res = await client.query<{
          products: {
            total_count: number;
            page_info: { total_pages: number; page_size: number };
            items: RawProduct[];
          };
        }>(PRODUCT_SWEEP, { page, pageSize: PAGE_SIZE }, lang);

        const snap: PageSnapshot = {
          meta: {
            source: 'hyperone',
            storeView: STORE_VIEWS[lang],
            lang,
            page,
            pageSize: PAGE_SIZE,
            totalCount: res.data.products.total_count,
            totalPages: res.data.products.page_info.total_pages,
            fetchedAt: new Date().toISOString(),
            httpStatus: res.httpStatus,
            durationMs: res.durationMs,
            attempts: res.attempts,
            queryHash: hash,
          },
          items: res.data.products.items,
        };
        await writeJsonAtomic(path, snap);
        completed.add(key);
        state.completed = [...completed];
        await saveState(dir, state);
        return snap.items.length;
      }),
    );
    const langItems = results.reduce((a, b) => a + b, 0);
    manifest.counts[`products_${lang}`] = langItems;
    itemsFetched += langItems;
    log.info({ lang, pages: pageCount, items: langItems }, 'sweep complete');
  }

  manifest.counts.totalCount = totalCount;
  manifest.counts.pagesPerLang = pageCount;
  manifest.counts.itemsFetched = itemsFetched;
  manifest.counts.pagesSkipped = pagesSkipped;
  manifest.finishedAt = new Date().toISOString();
  manifest.status = 'complete';
  await saveManifest(dir, manifest);

  state.status = 'complete';
  await saveState(dir, state);
  await setLatest('fetch:hyperone', runId);

  log.info({ runId, dir, itemsFetched }, 'hyperone fetch done');
  return { runId, dir };
}
