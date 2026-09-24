/**
 * Redis client (§16, §24). Single shared connection. Lazy so importing this module
 * for its types doesn't open a socket. Used for rate limiting, caching, and BullMQ.
 */
import { Redis } from 'ioredis';
import { serverEnv } from '../config/env';

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    client = new Redis(serverEnv().REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ; our callers handle failures
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', () => {
      /* swallow — callers degrade gracefully; the logger would spam otherwise */
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
