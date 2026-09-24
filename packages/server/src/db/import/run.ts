/**
 * Catalog import CLI (§catalog import, load stage).
 *
 *   npm run catalog:import -- categories
 *   npm run catalog:import -- products --plan <planDir> [--limit N] [--update full|prices|none] [--opening-stock N]
 *   npm run catalog:import -- verify
 *   npm run catalog:import -- all --plan <planDir>
 *
 * No top-level await — see ingest/cli.ts for why.
 */
import { join } from 'node:path';
import { logger } from '../../lib/logger';
import { closeDb } from '../client';
import { getLatest, ingestRoot, runDir } from '../../ingest/artifacts';
import { loadCategories } from './categories';
import { loadProducts, type UpdateMode } from './products';
import { loadChefaaProducts } from './products-chefaa';
import { migrateImages, migrateGalleryImages, type ImageResult } from './images';
import { runVerification } from './verify';

const log = logger().child({ component: 'import:cli' });

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

async function resolvePlanDir(source: string | undefined): Promise<string> {
  const explicit = flag('plan');
  if (explicit && explicit !== 'true') return explicit;
  if (source === 'chefaa') {
    const latest = await getLatest('plan:chefaa');
    if (!latest) throw new Error('no chefaa plan run found — pass --plan <dir> or run ingest:plan:chefaa first');
    return runDir('plan', latest, 'chefaa');
  }
  const latest = await getLatest('plan');
  if (!latest) throw new Error('no plan run found — pass --plan <dir> or run ingest:plan first');
  return join(ingestRoot(), 'plan', latest);
}

async function runCategories(): Promise<void> {
  const r = await loadCategories();
  log.info(r, 'categories loaded');
}

async function runProducts(): Promise<void> {
  const source = flag('source'); // 'chefaa' or omitted (HyperOne, the default)
  const planDir = await resolvePlanDir(source);
  const planPath = join(planDir, 'import-plan.jsonl');
  const common = {
    planPath,
    limit: intFlag('limit'),
    update: (flag('update') as UpdateMode | undefined) ?? 'full',
    openingStock: intFlag('opening-stock') ?? 0,
  };
  const r = source === 'chefaa' ? await loadChefaaProducts(common) : await loadProducts(common);
  log.info({ planDir, source: source ?? 'hyperone', ...r }, 'products loaded');
}

function logImageResult(label: string, r: ImageResult): void {
  log.info(
    { attempted: r.attempted, uploaded: r.uploaded, skippedAlreadyOwned: r.skippedAlreadyOwned, failed: r.failed },
    `${label} finished`,
  );
  if (r.failures.length) {
    for (const f of r.failures.slice(0, 20)) log.warn(f, `${label} failure`);
    if (r.failures.length > 20) log.warn({ more: r.failures.length - 20 }, 'more failures not shown');
  }
}

async function runImages(): Promise<void> {
  const opts = {
    concurrency: intFlag('concurrency') ?? 8,
    onlyMissing: flag('all') === undefined,
    limit: intFlag('limit'),
  };
  logImageResult('main image migration', await migrateImages(opts));
  // Gallery only when the caller didn't ask to skip it — see the usage string.
  if (flag('no-gallery') === undefined) {
    logImageResult('gallery image migration', await migrateGalleryImages(opts));
  }
}

async function runVerify(): Promise<void> {
  const { pass, checks } = await runVerification();
  for (const c of checks) {
    const line = `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ` (${c.count})`}`;
    if (c.pass) log.info(line);
    else log.error({ sample: c.sample }, line);
  }
  if (!pass) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'categories':
      await runCategories();
      return;
    case 'products':
      await runProducts();
      return;
    case 'images':
      await runImages();
      return;
    case 'verify':
      await runVerify();
      return;
    case 'all':
      await runCategories();
      await runProducts();
      await runImages();
      await runVerify();
      return;
    default:
      // eslint-disable-next-line no-console
      console.log(
        'Usage: catalog:import -- categories|products|images|verify|all ' +
          '[--source chefaa (default: hyperone)] ' +
          '[--plan <dir>] [--limit N] [--update full|prices|none] [--opening-stock N] ' +
          '[--concurrency N] [--all (re-upload even already-migrated images)] ' +
          '[--no-gallery (main product image only, skip the extra-photos pass)]',
      );
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (e) => {
    log.error({ err: e }, 'catalog import failed');
    await closeDb();
    process.exit(1);
  });
