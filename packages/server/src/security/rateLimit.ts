/**
 * Distributed rate limiting (§16). A sliding-window-log counter implemented as an
 * atomic Redis Lua script so concurrent instances share one limit (no bypass by
 * hitting a different node). Keyed by `route + (userId ?? ip)`. Fails OPEN only when
 * Redis is unreachable AND the route is non-critical; critical routes fail CLOSED.
 */
import { redis } from '../lib/redis';
import { RateLimitError } from '../lib/errors';
import { logger } from '../lib/logger';

/**
 * KEYS[1] = bucket key, ARGV[1] = now(ms), ARGV[2] = window(ms), ARGV[3] = limit.
 * Uses a sorted set of timestamps: drop expired, count, add current, set TTL.
 * Returns { allowed(0|1), remaining, resetMs }.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random())
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, window}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = window
if oldest[2] then reset = (tonumber(oldest[2]) + window) - now end
return {0, 0, reset}
`;

export interface RateLimitRule {
  /** Stable name used in the Redis key and logs, e.g. 'auth.login'. */
  name: string;
  limit: number;
  windowMs: number;
  /** When true, a Redis outage denies the request instead of allowing it. */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export async function checkRateLimit(rule: RateLimitRule, identity: string): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return { allowed: true, remaining: rule.limit, resetMs: 0 };
  }
  const key = `rl:${rule.name}:${identity}`;
  try {
    const client = redis();
    const [allowed, remaining, resetMs] = (await client.eval(
      SLIDING_WINDOW_LUA,
      1,
      key,
      Date.now().toString(),
      rule.windowMs.toString(),
      rule.limit.toString(),
    )) as [number, number, number];
    return { allowed: allowed === 1, remaining, resetMs };
  } catch (e) {
    logger().error({ err: e, rule: rule.name }, 'rate limiter unavailable');
    if (rule.failClosed) return { allowed: false, remaining: 0, resetMs: rule.windowMs };
    return { allowed: true, remaining: rule.limit, resetMs: 0 };
  }
}

/** Throwing convenience wrapper used by the route handler. */
export async function enforceRateLimit(rule: RateLimitRule, identity: string): Promise<void> {
  const res = await checkRateLimit(rule, identity);
  if (!res.allowed) {
    throw new RateLimitError({
      retryAfterSeconds: Math.ceil(res.resetMs / 1000),
      message: {
        ar: 'عدد المحاولات كبير جداً. يرجى المحاولة لاحقاً.',
        en: 'Too many requests. Please try again later.',
      },
      meta: { rule: rule.name },
    });
  }
}

/** Named rules for the sensitive operations in §16. Critical auth/payment fail closed. */
export const RATE_RULES = {
  login: { name: 'auth.login', limit: 5, windowMs: 60_000, failClosed: true },
  register: { name: 'auth.register', limit: 5, windowMs: 60 * 60_000, failClosed: true },
  passwordReset: { name: 'auth.password_reset', limit: 3, windowMs: 60 * 60_000, failClosed: true },
  otp: { name: 'auth.otp', limit: 5, windowMs: 10 * 60_000, failClosed: true },
  deleteAccount: { name: 'auth.delete_account', limit: 5, windowMs: 60 * 60_000, failClosed: true },
  resendVerification: { name: 'auth.resend', limit: 3, windowMs: 15 * 60_000, failClosed: true },
  search: { name: 'catalog.search', limit: 60, windowMs: 60_000 },
  coupon: { name: 'cart.coupon', limit: 10, windowMs: 60_000, failClosed: true },
  cartMutation: { name: 'cart.mutation', limit: 60, windowMs: 60_000 },
  checkout: { name: 'checkout', limit: 10, windowMs: 60_000, failClosed: true },
  payment: { name: 'payment', limit: 10, windowMs: 60_000, failClosed: true },
  webhook: { name: 'webhook', limit: 240, windowMs: 60_000 },
  // Self-service image upload (house photo): the generic `authenticated` rule (300/min)
  // would let one account push ~1.5 GB/min of storage before re-encoding even runs.
  // Legitimate use is a handful of retries while getting the photo right.
  imageUpload: { name: 'profile.image_upload', limit: 10, windowMs: 60 * 60_000, failClosed: true },
  readApi: { name: 'read', limit: 300, windowMs: 60_000 },
  writeApi: { name: 'write', limit: 60, windowMs: 60_000 },
  /** Defaults applied by defineRoute when a route names no rule (P3-7): nothing is unlimited. */
  admin: { name: 'admin', limit: 240, windowMs: 60_000 },
  authenticated: { name: 'authenticated', limit: 300, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
