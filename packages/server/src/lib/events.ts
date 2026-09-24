import { Redis } from 'ioredis';
import { serverEnv } from '../config/env';
import { logger } from './logger';
import { AppRealtimeEvent, RealtimeTopic } from '@ragab/types';
import { redis } from './redis';

/**
 * Creates a new Redis client specifically for subscribing.
 * A Redis connection in subscriber mode cannot send standard commands.
 */
export function createSubscriber(): Redis {
  return new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

/**
 * Publishes a domain event to a specific Redis topic channel.
 */
export async function publishEvent(topic: RealtimeTopic, event: AppRealtimeEvent): Promise<void> {
  try {
    const payload = JSON.stringify(event);
    await redis().publish(`topic:${topic}`, payload);
    logger().debug({ topic, event: event.event, eventId: event.eventId }, 'Published realtime event');
  } catch (err) {
    logger().error({ err, topic }, 'Failed to publish realtime event');
  }
}
