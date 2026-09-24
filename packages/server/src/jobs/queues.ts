/**
 * BullMQ queues (§23). Named queues for async, non-critical work. Business-critical
 * consistency stays synchronous in transactions (§23) — these handle emails, sweeps,
 * reindexing and reconciliation. Redis connection is shared via ioredis.
 */
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const QUEUE_NAMES = {
  notifications: 'notifications',
  maintenance: 'maintenance',
  webhooks: 'webhooks',
} as const;

const connection = () => redis();

let queues: Record<string, Queue> | null = null;

export function getQueues(): { notifications: Queue; maintenance: Queue; webhooks: Queue } {
  if (!queues) {
    queues = {
      notifications: new Queue(QUEUE_NAMES.notifications, { connection: connection() }),
      maintenance: new Queue(QUEUE_NAMES.maintenance, { connection: connection() }),
      webhooks: new Queue(QUEUE_NAMES.webhooks, { connection: connection() }),
    };
  }
  return queues as { notifications: Queue; maintenance: Queue; webhooks: Queue };
}

/** Enqueue a notification for async delivery. */
export async function enqueueNotification(payload: { userId: string; template: string; data?: Record<string, unknown> }): Promise<void> {
  await getQueues().notifications.add('send', payload, { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 });
}
