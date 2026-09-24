/**
 * Token-bucket rate limiter + concurrency gate (§catalog import).
 *
 * Hand-rolled rather than pulling p-limit/p-throttle: it is ~60 lines, it needs to be tuned
 * by hand per source anyway, and the repo already hand-rolls this class of utility
 * (lib/idempotency.ts, db/migrate.ts).
 */

export interface LimiterOptions {
  /** Maximum requests started per second. */
  ratePerSecond: number;
  /** Maximum requests in flight at once. */
  concurrency: number;
  /** Hard floor between two request starts, in ms. Politeness on top of the rate. */
  minGapMs?: number;
}

export class Limiter {
  private readonly ratePerSecond: number;
  private readonly concurrency: number;
  private readonly minGapMs: number;
  private tokens: number;
  private lastRefill: number;
  private lastStart = 0;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(opts: LimiterOptions) {
    this.ratePerSecond = Math.max(0.1, opts.ratePerSecond);
    this.concurrency = Math.max(1, opts.concurrency);
    this.minGapMs = opts.minGapMs ?? 0;
    this.tokens = this.ratePerSecond;
    this.lastRefill = Date.now();
  }

  /** Run `fn` once a slot and a token are available. Resolves with its result. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    while (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;

    for (;;) {
      this.refill();
      const gapWait = Math.max(0, this.lastStart + this.minGapMs - Date.now());
      if (this.tokens >= 1 && gapWait === 0) break;
      const tokenWait = this.tokens >= 1 ? 0 : ((1 - this.tokens) / this.ratePerSecond) * 1000;
      await sleep(Math.max(5, Math.max(gapWait, tokenWait)));
    }
    this.tokens -= 1;
    this.lastStart = Date.now();
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.ratePerSecond, this.tokens + elapsed * this.ratePerSecond);
    this.lastRefill = now;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run tasks with a bounded concurrency, preserving input order in the output. */
export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
