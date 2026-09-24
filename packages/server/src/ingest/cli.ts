/**
 * Catalog ingest CLI (§catalog import).
 *
 *   npm run ingest:fetch      -- [--resume <runId>] [--max-pages N]
 *   npm run ingest:plan       -- [--fetch-run <id>] [--limit N] [--only cat_beverages]
 *
 * Stages 1-3 (fetch, normalize, classify, plan) never import db/client.ts, so they run with no
 * database and no DATABASE_URL. Only the load stage touches Postgres.
 *
 * No top-level await: .ts in this package resolves as CJS (there is no "type": "module"), which
 * is also why db/migrate.ts and db/seed.ts use a .then() tail. This file follows that contract.
 */
import { logger } from '../lib/logger';
import { fetchHyperOne } from './sources/hyperone/fetch';
import { buildPlan } from './plan';
import { fetchChefaa } from './sources/chefaa/fetch';
import { buildChefaaPlan } from './plan-chefaa';

const log = logger().child({ component: 'ingest:cli' });

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

function intFlag(name: string): number | undefined {
  const v = flag(name);
  if (v === undefined || v === 'true') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

const USAGE = `
Catalog ingest

  fetch    Sweep the HyperOne catalog (both store views) into raw snapshots.
             --resume <runId>    continue an interrupted run
             --max-pages <n>     stop after n pages per language (smoke test)
             --concurrency <n>   default 4
  plan     Normalize + classify the snapshots into a reviewable, load-ready plan.
             --fetch-run <id>    default: the latest fetch run
             --limit <n>         cap the number of planned rows
             --only <categoryId> restrict to one top-level department

  fetch-chefaa   Sweep chefaa.com's public products_eg Meilisearch index into raw snapshots.
             --resume <runId>    continue an interrupted run
             --max-buckets <n>   stop after n price buckets (smoke test)
             --concurrency <n>   default 2
  plan-chefaa    Normalize chefaa's snapshots (already categorized) into a load-ready plan.
             --fetch-run <id>    default: the latest chefaa fetch run
             --limit <n>         cap the number of planned rows

Artifacts are written under web/.cache/ingest (override with RAGAB_INGEST_DIR).
`;

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'fetch': {
      const { runId, dir } = await fetchHyperOne({
        runId: flag('resume') && flag('resume') !== 'true' ? flag('resume') : undefined,
        maxPages: intFlag('max-pages'),
        concurrency: intFlag('concurrency'),
      });
      log.info({ runId, dir }, 'fetch finished');
      return;
    }
    case 'plan': {
      const { runId, dir } = await buildPlan({
        fetchRunId: flag('fetch-run') !== 'true' ? flag('fetch-run') : undefined,
        limit: intFlag('limit'),
        only: flag('only') !== 'true' ? flag('only') : undefined,
      });
      log.info({ runId, dir }, 'plan finished — read summary.md next');
      return;
    }
    case 'fetch-chefaa': {
      const { runId, dir } = await fetchChefaa({
        runId: flag('resume') && flag('resume') !== 'true' ? flag('resume') : undefined,
        concurrency: intFlag('concurrency'),
        maxBuckets: intFlag('max-buckets'),
      });
      log.info({ runId, dir }, 'chefaa fetch finished');
      return;
    }
    case 'plan-chefaa': {
      const { runId, dir } = await buildChefaaPlan({
        fetchRunId: flag('fetch-run') !== 'true' ? flag('fetch-run') : undefined,
        limit: intFlag('limit'),
      });
      log.info({ runId, dir }, 'chefaa plan finished — read summary.md next');
      return;
    }
    default:
      // eslint-disable-next-line no-console
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    log.error({ err: e }, 'ingest failed');
    process.exit(1);
  });
