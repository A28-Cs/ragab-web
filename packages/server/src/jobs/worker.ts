/**
 * Worker process (§23, §49). A SEPARATE process from Next.js that drains the BullMQ
 * queues and runs repeatable maintenance jobs (reservation expiry, token cleanup).
 * Graceful shutdown drains in-flight jobs. Run with `tsx src/jobs/worker.ts`.
 */
import { Worker, Queue } from 'bullmq';
import { redis, closeRedis } from '../lib/redis';
import { closeDb } from '../db/client';
import { logger } from '../lib/logger';
import { serverEnv } from '../config/env';
import { QUEUE_NAMES } from './queues';
import { processNotification } from './processors/notifications';
import { releaseExpiredReservationsJob, cleanupExpiredTokensJob, reconcilePaymentsJob } from './processors/maintenance';
import { startEngeznyListener } from '../modules/orders/engezny-listener';

const log = logger().child({ component: 'worker' });

async function main(): Promise<void> {
  serverEnv(); // validate config at boot
  const connection = redis();

  const unsubscribeEngezny = startEngeznyListener();

  const notificationWorker = new Worker(QUEUE_NAMES.notifications, async (job) => processNotification(job), { connection, concurrency: 5 });

  const maintenanceWorker = new Worker(
    QUEUE_NAMES.maintenance,
    async (job) => {
      if (job.name === 'release-expired-reservations') return releaseExpiredReservationsJob();
      if (job.name === 'cleanup-expired-tokens') return cleanupExpiredTokensJob();
      if (job.name === 'reconcile-payments') return reconcilePaymentsJob();
    },
    { connection, concurrency: 2 },
  );

  for (const w of [notificationWorker, maintenanceWorker]) {
    w.on('failed', (job, err) => log.error({ jobId: job?.id, queue: w.name, err }, 'job failed'));
  }

  // Schedule repeatable maintenance jobs (idempotent — BullMQ dedupes by key).
  const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, { connection });
  await maintenanceQueue.add('release-expired-reservations', {}, { repeat: { every: 60_000 }, jobId: 'release-expired-reservations' });
  await maintenanceQueue.add('cleanup-expired-tokens', {}, { repeat: { every: 60 * 60_000 }, jobId: 'cleanup-expired-tokens' });
  await maintenanceQueue.add('reconcile-payments', {}, { repeat: { every: 5 * 60_000 }, jobId: 'reconcile-payments' });

  log.info('worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker shutting down');
    unsubscribeEngezny();
    await Promise.allSettled([notificationWorker.close(), maintenanceWorker.close(), maintenanceQueue.close()]);
    await closeRedis();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'worker crashed on boot');
  process.exit(1);
});
