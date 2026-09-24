/**
 * Image pipeline (§catalog import, stage 5).
 *
 * Downloads each imported product's HyperOne image and re-uploads it to the project's own
 * object storage (MinIO locally, R2 in production), then repoints `products.image` at the
 * new URL. This is the owner's explicit decision (§catalog import plan): never hotlink a
 * competitor's CDN. Verified live: the app's own CSP `img-src` already refuses the HyperOne
 * host, so until this runs, imported product images render broken by design, not by accident.
 *
 * Why not hotlink even temporarily — the Magento cache-keyed URL
 * (.../cache/<config-hash>/...) means one HyperOne image-config change 404s the ENTIRE catalog
 * at once, the `?width=800` query permanently caps resolution, and every request leaks a
 * Ragab customer's IP/Referer to a competitor.
 *
 * Idempotent by construction: the storage key is the product's own id (`products/<id>.<ext>`),
 * via `uploadImage`'s `explicitKey` parameter — so a re-run only re-fetches products whose
 * `image` column does not already point at OUR storage (S3_PUBLIC_URL / the endpoint), and a
 * genuine re-upload of the same product overwrites the same object rather than growing the
 * bucket. `--only-missing` (the default) is what makes this safe to interrupt and resume.
 */
import { eq, and, sql, not, like } from 'drizzle-orm';
import { db } from '../client';
import * as s from '../schema';
import { uploadImage } from '../../modules/uploads/service';
import { serverEnv } from '../../config/env';
import { getCredential } from '../../lib/credentials';
import { mapLimit } from '../../ingest/lib/limiter';
import { withRetry, RetryableError, NonRetryableError, statusIsRetryable } from '../../ingest/lib/retry';
import { logger } from '../../lib/logger';

const log = logger().child({ component: 'import:images' });

export interface ImageOptions {
  concurrency?: number;
  /** Skip rows whose image/url already points at our own storage. Default true. */
  onlyMissing?: boolean;
  /** Cap for smoke runs. */
  limit?: number;
}

export interface ImageResult {
  attempted: number;
  uploaded: number;
  skippedAlreadyOwned: number;
  failed: number;
  failures: Array<{ id: string; url: string; error: string }>;
}

const USER_AGENT = 'Ragab-Catalog-Ingest/1.0 (+https://ragab.market; contact: catalog-bot@ragab.market)';
const TIMEOUT_MS = 15_000;

/** Our own storage's URL prefix, so "already migrated" can be detected without a DB flag. */
async function ownStoragePrefixes(): Promise<string[]> {
  const env = serverEnv();
  const publicUrl = (await getCredential('s3', 'S3_PUBLIC_URL')) ?? env.S3_PUBLIC_URL;
  const endpoint = (await getCredential('s3', 'S3_ENDPOINT')) ?? env.S3_ENDPOINT;
  return [publicUrl, endpoint].filter((x): x is string => !!x);
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: controller.signal });
      } catch (err) {
        throw new RetryableError(`transport failure: ${String(err)}`);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const msg = `HTTP ${res.status} fetching ${url}`;
        if (statusIsRetryable(res.status)) throw new RetryableError(msg);
        throw new NonRetryableError(msg);
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    { attempts: 3, baseMs: 500, maxMs: 8_000 },
  );
}

/** Extension-free storage key stem — `uploadImage` appends the sniffed extension itself. */
function keyStemFor(productId: string): string | null {
  // `products/<id>` — id is already the ASCII `prod_<ean>` / `prod_x<hash>` (HyperOne) or
  // `prod_chefaa_<id>` (chefaa) shape asserted by the respective planner, so it is safe as a
  // storage key stem without further sanitization here.
  return /^prod_[a-z0-9_]+$/i.test(productId) ? productId : null;
}

export async function migrateImages(opts: ImageOptions = {}): Promise<ImageResult> {
  const concurrency = opts.concurrency ?? 8;
  const onlyMissing = opts.onlyMissing ?? true;
  const d = db();
  const owned = await ownStoragePrefixes();

  /*
   * PARENTHESIZED DELIBERATELY. Without them, combining this via and(isImported, ...other)
   * concatenates to `A or B and other` — and SQL's AND binds tighter than OR, so that parses
   * as `A or (B and other)`, not `(A or B) and other`. Since almost every real product id
   * matches the first EAN-shaped branch on its own, that bug made the "not already owned"
   * and "has an image" conditions vanish for the vast majority of rows — verified live: it
   * reported 6,454 "already owned" when the true count was 10.
   */
  const isImported = sql`(${s.products.id} ~ '^prod_[0-9]{8,14}$' or ${s.products.id} ~ '^prod_x[0-9a-f]{12}$' or ${s.products.id} ~ '^prod_chefaa_[0-9]+$')`;
  const notOwned = owned.length
    ? and(...owned.map((p) => not(like(s.products.image, `${p}%`))))
    : undefined;

  const hasImage = sql`${s.products.image} <> ''`;
  let rows = await d
    .select({ id: s.products.id, image: s.products.image })
    .from(s.products)
    .where(onlyMissing && notOwned ? and(isImported, notOwned, hasImage) : and(isImported, hasImage));

  /*
   * The "already owned" count for the report — computed separately from the eligibility
   * filter above, not derived from it, since `onlyMissing=false` (an explicit --all re-upload)
   * makes `rows` include the already-owned ones too and this count would otherwise read 0 even
   * though the whole point of the stat is to show how many the run is skipping.
   */
  const skippedAlreadyOwned =
    onlyMissing && notOwned
      ? Number(
          (
            await d
              .select({ n: sql<number>`count(*)::int` })
              .from(s.products)
              .where(and(isImported, hasImage, not(notOwned)))
          )[0]?.n ?? 0,
        )
      : 0;

  if (opts.limit) rows = rows.slice(0, opts.limit);

  const result: ImageResult = {
    attempted: rows.length,
    uploaded: 0,
    skippedAlreadyOwned,
    failed: 0,
    failures: [],
  };
  log.info({ attempted: rows.length, concurrency }, 'starting image migration');

  await mapLimit(rows, concurrency, async (row) => {
    const stem = keyStemFor(row.id);
    if (!stem) {
      result.failed += 1;
      result.failures.push({ id: row.id, url: row.image, error: 'id does not match the expected storage-key shape' });
      return;
    }
    try {
      const bytes = await fetchImageBytes(row.image);
      const { url } = await uploadImage(bytes, 'products', stem);
      await d.update(s.products).set({ image: url }).where(eq(s.products.id, row.id));
      result.uploaded += 1;
    } catch (err) {
      result.failed += 1;
      result.failures.push({ id: row.id, url: row.image, error: String((err as Error).message ?? err) });
      log.warn({ id: row.id, err: String(err) }, 'image migration failed for product');
    }
  });

  log.info(result, 'image migration complete');
  return result;
}

/**
 * Gallery pass — the `product_images` rows the planner captured (up to 8 extra photos per
 * product) but that the loader only started writing once §catalog import's gallery gap was
 * noticed. Same idempotency story as `migrateImages`: the storage key is the gallery row's own
 * deterministic id (`img_<productId>_<n>`), so re-running only touches rows not yet pointing at
 * our storage.
 */
export async function migrateGalleryImages(opts: ImageOptions = {}): Promise<ImageResult> {
  const concurrency = opts.concurrency ?? 8;
  const onlyMissing = opts.onlyMissing ?? true;
  const d = db();
  const owned = await ownStoragePrefixes();

  // Parenthesized for the same reason as migrateImages' isImported — see that comment.
  const isImportedProduct = sql`(${s.productImages.productId} ~ '^prod_[0-9]{8,14}$' or ${s.productImages.productId} ~ '^prod_x[0-9a-f]{12}$' or ${s.productImages.productId} ~ '^prod_chefaa_[0-9]+$')`;
  const notOwned = owned.length
    ? and(...owned.map((p) => not(like(s.productImages.url, `${p}%`))))
    : undefined;
  const hasUrl = sql`${s.productImages.url} <> ''`;

  let rows = await d
    .select({ id: s.productImages.id, url: s.productImages.url })
    .from(s.productImages)
    .where(onlyMissing && notOwned ? and(isImportedProduct, notOwned, hasUrl) : and(isImportedProduct, hasUrl));

  const skippedAlreadyOwned =
    onlyMissing && notOwned
      ? Number(
          (
            await d
              .select({ n: sql<number>`count(*)::int` })
              .from(s.productImages)
              .where(and(isImportedProduct, hasUrl, not(notOwned)))
          )[0]?.n ?? 0,
        )
      : 0;

  if (opts.limit) rows = rows.slice(0, opts.limit);

  const result: ImageResult = {
    attempted: rows.length,
    uploaded: 0,
    skippedAlreadyOwned,
    failed: 0,
    failures: [],
  };
  log.info({ attempted: rows.length, concurrency }, 'starting gallery image migration');

  await mapLimit(rows, concurrency, async (row) => {
    // The gallery row's own id (img_<productId>_<n>) is already ASCII-safe by construction —
    // see products.ts's galleryValues — so it doubles as the storage key stem directly.
    const stem = /^img_[a-z0-9_]+$/i.test(row.id) ? row.id : null;
    if (!stem) {
      result.failed += 1;
      result.failures.push({ id: row.id, url: row.url, error: 'id does not match the expected storage-key shape' });
      return;
    }
    try {
      const bytes = await fetchImageBytes(row.url);
      const { url } = await uploadImage(bytes, 'products/gallery', stem);
      await d.update(s.productImages).set({ url }).where(eq(s.productImages.id, row.id));
      result.uploaded += 1;
    } catch (err) {
      result.failed += 1;
      result.failures.push({ id: row.id, url: row.url, error: String((err as Error).message ?? err) });
      log.warn({ id: row.id, err: String(err) }, 'gallery image migration failed');
    }
  });

  log.info(result, 'gallery image migration complete');
  return result;
}
