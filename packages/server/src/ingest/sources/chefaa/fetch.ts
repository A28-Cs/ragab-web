/**
 * chefaa fetch stage (§catalog import, stage 1 — chefaa source).
 *
 * Meilisearch's `maxTotalHits` (measured live: 1000) means no single query — however
 * filtered — can return more than 1000 hits, and `id` is not a sortable attribute (checked
 * live: only `price`, `final_price`, `purchase_count`, `sorting`, `title_ar`, `title_en` and
 * per-zone `availability.zone_N` are). So a flat "sweep everything, sorted by id" like
 * HyperOne's is not available here.
 *
 * Instead this recursively bisects the WHOLE catalog by `price` — the one attribute that is
 * both filterable AND sortable — into half-open ranges `[min, max)` small enough (< 900 hits,
 * a safety margin under the 1000 cap) to fetch in one page each. Exact counts per range come
 * from `ChefaaClient.exactCount`, which is NOT subject to the 1000 cap (it sums a boolean
 * facet's distribution, computed by Meilisearch over the whole matching set). Ranges are
 * half-open and non-overlapping by construction, so no product can land in two buckets and
 * none can fall through a gap at a boundary.
 *
 * No category filter is applied at fetch time — every document in the index is captured
 * regardless of status/stock, and classification (including whether to import it at all)
 * happens in plan-chefaa.ts. That keeps this stage a pure, source-shaped mirror, exactly like
 * HyperOne's snapshots.
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
import { ChefaaClient } from './client';
import type { ChefaaPageSnapshot, ChefaaProduct } from './types';

const log = logger().child({ component: 'ingest:chefaa:fetch' });

/** Safety margin under Meilisearch's measured `maxTotalHits` of 1000. */
const SAFE_PAGE = 900;
/** A range narrower than this (EGP) that still overflows SAFE_PAGE gets the tie-break fallback. */
const MIN_SPLIT_WIDTH = 0.05;
/** Observed live 2026-09-24: ~33.9k across all departments + the unclassified/pet buckets. */
const EXPECTED_MIN = 20_000;
const EXPECTED_MAX = 80_000;

export interface FetchChefaaOptions {
  runId?: string;
  concurrency?: number;
  ratePerSecond?: number;
  /** Stop after N leaf buckets — for smoke tests. Omit for a full sweep. */
  maxBuckets?: number;
}

interface Bucket {
  min: number;
  max: number;
}

function bucketKey(b: Bucket): string {
  return `price[${b.min},${b.max})`;
}

function bucketFile(dir: string, index: number): string {
  return join(dir, `products.bucket-${String(index).padStart(4, '0')}.json`);
}

export async function fetchChefaa(opts: FetchChefaaOptions = {}): Promise<{ runId: string; dir: string }> {
  const runId = opts.runId ?? newRunId();
  const dir = runDir('fetch', runId, 'chefaa');
  const startedAt = new Date().toISOString();

  const client = new ChefaaClient({
    concurrency: opts.concurrency,
    ratePerSecond: opts.ratePerSecond,
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
    source: 'chefaa',
    startedAt,
    finishedAt: null,
    status: 'running',
    inputs: [],
    counts: {},
    warnings: [],
    notes: [],
  };
  await saveManifest(dir, manifest);

  // ── Preflight: total catalog size, the guard that catches a silently-broken sweep ────
  const totalCount = await client.exactCount(undefined);
  if (totalCount < EXPECTED_MIN || totalCount > EXPECTED_MAX) {
    throw new Error(
      `chefaa preflight count is ${totalCount}, outside the expected ${EXPECTED_MIN}-${EXPECTED_MAX}. ` +
        'Either the index changed shape or exactCount() broke — do NOT proceed, a partial ' +
        'sweep looks exactly like a successful one downstream.',
    );
  }
  const priceStats = await client.priceRange(undefined);
  if (!priceStats) throw new Error('chefaa price facetStats missing — cannot bucket the sweep');
  log.info({ totalCount, priceStats }, 'preflight ok');

  let bucketIndex = 0;
  let itemsFetched = 0;
  let bucketsWritten = 0;
  let bucketsSkipped = 0;
  const seenIds = new Set<number>();
  let duplicates = 0;
  const warnings: Array<{ code: string; key: string }> = [];

  // Half-open [min, maxExclusive) covering the whole observed price range, plus a hair of
  // slack above the true max so the top bucket's `< maxExclusive` still includes it.
  async function sweep(range: Bucket): Promise<void> {
    if (opts.maxBuckets && bucketsWritten >= opts.maxBuckets) return;
    const key = bucketKey(range);
    const filter = `price >= ${range.min} AND price < ${range.max}`;
    const path = bucketFile(dir, bucketIndex);
    bucketIndex += 1;

    if (completed.has(key) && fileExists(path)) {
      const snap = await readJson<ChefaaPageSnapshot>(path).catch(() => null);
      if (snap && Array.isArray(snap.items)) {
        bucketsSkipped += 1;
        itemsFetched += snap.items.length;
        for (const it of snap.items) {
          if (seenIds.has(it.id)) duplicates += 1;
          seenIds.add(it.id);
        }
        return;
      }
      log.warn({ key }, 'completed bucket failed revalidation — refetching');
    }

    const count = await client.exactCount(filter);
    if (count === 0) {
      completed.add(key);
      return;
    }

    if (count <= SAFE_PAGE) {
      const res = await client.search<ChefaaProduct>({
        filter,
        hitsPerPage: SAFE_PAGE,
        page: 1,
        sort: ['price:asc'],
      });
      const snap: ChefaaPageSnapshot = {
        meta: {
          source: 'chefaa',
          index: 'products_eg',
          bucketFilter: filter,
          bucketMin: range.min,
          bucketMax: range.max,
          fetchedAt: new Date().toISOString(),
          count: res.hits.length,
        },
        items: res.hits,
      };
      await writeJsonAtomic(path, snap);
      completed.add(key);
      state.completed = [...completed];
      await saveState(dir, state);
      bucketsWritten += 1;
      itemsFetched += res.hits.length;
      for (const it of res.hits) {
        if (seenIds.has(it.id)) duplicates += 1;
        seenIds.add(it.id);
      }
      if (res.hits.length !== count) {
        warnings.push({ code: 'BUCKET_COUNT_MISMATCH', key });
        log.warn({ key, expected: count, got: res.hits.length }, 'bucket count mismatch');
      }
      return;
    }

    // Too big for one page — split on price. Query THIS range's own min/max, not the
    // parent's, so the split point actually separates the crowded half from the sparse one.
    const stats = await client.priceRange(filter);
    const width = range.max - range.min;
    if (!stats || stats.min >= stats.max || width <= MIN_SPLIT_WIDTH) {
      // Degenerate: this narrow a range still holds > SAFE_PAGE products (a real price tie).
      // Fall back to the largest page Meilisearch will give us, sorted by a real sortable
      // attribute, and report the shortfall honestly rather than silently dropping rows.
      const res = await client.search<ChefaaProduct>({
        filter,
        hitsPerPage: 1000,
        page: 1,
        sort: ['title_ar:asc'],
      });
      const snap: ChefaaPageSnapshot = {
        meta: {
          source: 'chefaa',
          index: 'products_eg',
          bucketFilter: filter,
          bucketMin: range.min,
          bucketMax: range.max,
          fetchedAt: new Date().toISOString(),
          count: res.hits.length,
        },
        items: res.hits,
      };
      await writeJsonAtomic(path, snap);
      completed.add(key);
      state.completed = [...completed];
      await saveState(dir, state);
      bucketsWritten += 1;
      itemsFetched += res.hits.length;
      for (const it of res.hits) {
        if (seenIds.has(it.id)) duplicates += 1;
        seenIds.add(it.id);
      }
      if (res.hits.length < count) {
        warnings.push({ code: 'PRICE_TIE_OVERFLOW', key });
        log.error(
          { key, exactCount: count, captured: res.hits.length },
          'price tie exceeds the 1000-hit cap and cannot be split further — some rows in ' +
            'this exact-price band were not captured; see the fetch manifest',
        );
      }
      return;
    }

    const mid = Math.round(((stats.min + stats.max) / 2) * 100) / 100;
    const splitMid = mid > range.min && mid < range.max ? mid : (range.min + range.max) / 2;
    await sweep({ min: range.min, max: splitMid });
    await sweep({ min: splitMid, max: range.max });
  }

  await sweep({ min: 0, max: Math.ceil(priceStats.max) + 1 });

  manifest.counts.totalCount = totalCount;
  manifest.counts.itemsFetched = itemsFetched;
  manifest.counts.uniqueIds = seenIds.size;
  manifest.counts.bucketsWritten = bucketsWritten;
  manifest.counts.bucketsSkipped = bucketsSkipped;
  manifest.counts.duplicates = duplicates;
  manifest.warnings = Array.from(
    warnings.reduce((m, w) => m.set(w.code, (m.get(w.code) ?? 0) + 1), new Map<string, number>()),
  ).map(([code, count]) => ({
    code,
    count,
    sampleKeys: warnings.filter((w) => w.code === code).slice(0, 5).map((w) => w.key),
  }));
  manifest.finishedAt = new Date().toISOString();
  manifest.status = seenIds.size < totalCount * 0.999 ? 'blocked' : 'complete';
  await saveManifest(dir, manifest);

  state.status = manifest.status === 'complete' ? 'complete' : 'blocked';
  await saveState(dir, state);
  await setLatest('fetch:chefaa', runId);

  log.info(
    { runId, dir, totalCount, itemsFetched, uniqueIds: seenIds.size, duplicates, bucketsWritten },
    'chefaa fetch done',
  );
  return { runId, dir };
}
