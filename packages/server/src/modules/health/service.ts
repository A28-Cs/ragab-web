/**
 * Health checks (§50). /health is liveness — trivially true if the process runs.
 * /ready checks the real dependencies (DB, Redis) WITHOUT leaking internals: it returns
 * only up/down per dependency, never versions, hosts, or errors.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { redis } from '../../lib/redis';

export function liveness(): { status: 'ok'; uptime: number } {
  return { status: 'ok', uptime: Math.round(process.uptime()) };
}

export async function readiness(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, 'up' | 'down'> }> {
  const checks: Record<string, 'up' | 'down'> = {};
  checks.database = await ping(() => db().execute(sql`SELECT 1`));
  checks.redis = await ping(async () => {
    const r = await redis().ping();
    if (r !== 'PONG') throw new Error('unexpected');
  });
  const status = Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded';
  return { status, checks };
}

async function ping(fn: () => Promise<unknown>): Promise<'up' | 'down'> {
  try {
    await Promise.race([fn(), timeout(2000)]);
    return 'up';
  } catch {
    return 'down';
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}
