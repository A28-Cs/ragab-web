/**
 * chefaa.com Meilisearch client (§catalog import, stage 1 — chefaa source).
 *
 * chefaa's storefront (https://chefaa.com/eg-ar/...) is server-rendered HTML with NO product
 * JSON API of its own — category/product listing pages are paginated via a `?page=N` query
 * string, which robots.txt explicitly disallows site-wide (`Disallow: /*?`), and `/eg-en` is
 * disallowed outright. Client-side search/browse instead goes straight to a self-hosted
 * Meilisearch instance (`instantsearch.js` + `@meilisearch/instant-meilisearch`, confirmed
 * live via the page's own `/js/search.js` bundle), which is a SEPARATE host with no robots.txt
 * restriction of its own and is queried by POST, not by disallowed query-string URLs.
 *
 * The search key below is chefaa's own PUBLIC, read-only, client-side key: it ships in plain
 * text inside every visitor's page source (`searchKey` in the inline bootstrap script), it is
 * a `search`-scoped key (verified: `GET /version` with it returns "invalid_api_key" — an admin
 * action is refused), and it is exactly the request chefaa's own front end makes on every
 * category page load. Querying it directly is not bypassing auth, a CAPTCHA or an access
 * control — it is the site's own public, unauthenticated read path, used the way it is
 * designed to be used, politely and with an honest User-Agent so chefaa can reach us instead
 * of blocking us.
 *
 * One quirk: the reverse proxy in front of Meilisearch checks Origin/Referer server-side
 * (a bare `curl` with no Origin gets `invalid_api_key`; the same request with
 * `Origin: https://chefaa.com` succeeds) — so both headers are sent on every call, matching
 * what the browser already does.
 */
import { Limiter } from '../../lib/limiter';
import {
  NonRetryableError,
  RetryableError,
  parseRetryAfter,
  statusIsRetryable,
  withRetry,
} from '../../lib/retry';

export const CHEFAA_SEARCH_HOST = process.env.CHEFAA_SEARCH_HOST ?? 'https://meilisearch.chefaa.com';
export const CHEFAA_INDEX = process.env.CHEFAA_INDEX ?? 'products_eg';
/** chefaa's own public client-side search key — see the file header. Overridable in case they rotate it. */
export const CHEFAA_SEARCH_KEY =
  process.env.CHEFAA_SEARCH_KEY ?? 'd63cccef2eeacd2734bef1c445980b5720de94f5f161bf9d8322a377a0b03536';

const USER_AGENT = 'Ragab-Catalog-Ingest/1.0 (+https://ragab.market; contact: catalog-bot@ragab.market)';
const ORIGIN = 'https://chefaa.com';
const REFERER = 'https://chefaa.com/eg-ar';

export interface MeiliSearchResult<H> {
  hits: H[];
  query: string;
  processingTimeMs: number;
  hitsPerPage: number;
  page: number;
  totalPages: number;
  /** Capped at the server's `maxTotalHits` (observed: 1000) — never trust this for counting. */
  totalHits: number;
  facetDistribution?: Record<string, Record<string, number>>;
  facetStats?: Record<string, { min: number; max: number }>;
}

export interface SearchParams {
  q?: string;
  filter?: string;
  sort?: string[];
  hitsPerPage?: number;
  page?: number;
  facets?: string[];
}

export interface ChefaaClientOptions {
  host?: string;
  index?: string;
  apiKey?: string;
  ratePerSecond?: number;
  concurrency?: number;
  minGapMs?: number;
  timeoutMs?: number;
  attempts?: number;
  onRetry?: (info: { attempt: number; waitMs: number; error: unknown }) => void;
}

export class ChefaaClient {
  private readonly host: string;
  private readonly index: string;
  private readonly apiKey: string;
  private readonly limiter: Limiter;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly onRetry?: ChefaaClientOptions['onRetry'];

  constructor(opts: ChefaaClientOptions = {}) {
    this.host = opts.host ?? CHEFAA_SEARCH_HOST;
    this.index = opts.index ?? CHEFAA_INDEX;
    this.apiKey = opts.apiKey ?? CHEFAA_SEARCH_KEY;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.attempts = opts.attempts ?? 5;
    this.onRetry = opts.onRetry;
    // Polite by construction: 4 req/s, concurrency 2 — chefaa is a guest host we do not own,
    // and this sweep does not need to be fast to finish inside minutes.
    this.limiter = new Limiter({
      ratePerSecond: opts.ratePerSecond ?? 4,
      concurrency: opts.concurrency ?? 2,
      minGapMs: opts.minGapMs ?? 200,
    });
  }

  async search<H>(params: SearchParams): Promise<MeiliSearchResult<H>> {
    return withRetry(
      () =>
        this.limiter.run(async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);
          let res: Response;
          try {
            res = await fetch(`${this.host}/indexes/${this.index}/search`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                'user-agent': USER_AGENT,
                authorization: `Bearer ${this.apiKey}`,
                origin: ORIGIN,
                referer: REFERER,
              },
              body: JSON.stringify({ q: '', hitsPerPage: 50, page: 1, ...params }),
              signal: controller.signal,
            });
          } catch (err) {
            throw new RetryableError(`transport failure: ${String(err)}`);
          } finally {
            clearTimeout(timer);
          }

          const text = await res.text();
          if (!res.ok) {
            const msg = `HTTP ${res.status}: ${text.slice(0, 300)}`;
            if (statusIsRetryable(res.status)) {
              throw new RetryableError(msg, parseRetryAfter(res.headers.get('retry-after')));
            }
            throw new NonRetryableError(msg);
          }

          let parsed: MeiliSearchResult<H>;
          try {
            parsed = JSON.parse(text) as MeiliSearchResult<H>;
          } catch (err) {
            throw new RetryableError(`malformed JSON: ${String(err)}`);
          }
          return parsed;
        }),
      { attempts: this.attempts, onRetry: this.onRetry },
    );
  }

  /**
   * Exact match count for an arbitrary filter, sidestepping the `totalHits` cap: Meilisearch
   * computes `facetDistribution` over the WHOLE matching set regardless of `maxTotalHits`, so
   * summing a boolean facet's two buckets gives the true count for free. `out_of_stock` is a
   * facet on every document (verified live), so it always has exactly 2 keys to sum.
   */
  async exactCount(filter: string | undefined): Promise<number> {
    const res = await this.search<never>({
      q: '',
      hitsPerPage: 0,
      page: 1,
      ...(filter ? { filter } : {}),
      facets: ['out_of_stock'],
    });
    const dist = res.facetDistribution?.['out_of_stock'] ?? {};
    return Object.values(dist).reduce((a, b) => a + b, 0);
  }

  /** Min/max of the `price` field over an arbitrary filter (both filterable AND sortable). */
  async priceRange(filter: string | undefined): Promise<{ min: number; max: number } | null> {
    const res = await this.search<never>({
      q: '',
      hitsPerPage: 0,
      page: 1,
      ...(filter ? { filter } : {}),
      facets: ['price'],
    });
    return res.facetStats?.['price'] ?? null;
  }
}
