import crypto from 'node:crypto';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { serverEnv } from '../../config/env';
import { updateOrderStatus } from './service';
import type { RequestContext } from '../../http/context';
import { assignCourierSchema } from './schema';

export interface EngeznyWebhookPayload {
  event_id: string;
  event_type: 'delivery.driver_assigned' | 'delivery.picked_up' | 'delivery.delivered' | 'delivery.cancelled';
  order_id: string;
  data: {
    driver?: {
      worker_id: string;
      name: string;
      phone: string;
    };
    status: string;
  };
}

/**
 * Validates the Engezny webhook HMAC signature.
 */
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = serverEnv().ENGEZNY_WEBHOOK_SECRET;
  if (!secret) {
    logger().warn('ENGEZNY_WEBHOOK_SECRET is not set, bypassing signature validation (NOT SECURE)');
    return true; // Bypass in dev if not set
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

/**
 * Handles incoming webhooks from Engezny Firebase Cloud Functions.
 */
export async function handleEngeznyWebhook(
  ctx: RequestContext,
  rawBody: string,
  signature: string
): Promise<{ success: boolean; reason?: string }> {
  if (!verifySignature(rawBody, signature)) {
    logger().warn('Engezny webhook signature verification failed');
    return { success: false, reason: 'Invalid signature' };
  }

  let payload: EngeznyWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { success: false, reason: 'Invalid JSON' };
  }

  const { event_type, order_id, data } = payload;
  logger().info({ event_type, order_id }, 'Received Engezny webhook');

  // We act as 'system' for these updates
  const systemCtx: RequestContext = {
    ...ctx,
    principal: {
      userId: 'system-engezny',
      user: { id: 'system-engezny', name: 'Engezny System', email: '', phone: '' } as any,
      sessionId: 'sys',
    } as any,
  };

  try {
    const [order] = await db().select().from(orders).where(eq(orders.id, order_id)).limit(1);
    if (!order) {
      return { success: false, reason: 'Order not found' };
    }

    if (event_type === 'delivery.driver_assigned' && data.driver) {
      // Create or update shipment assignment (Ragab model)
      // Since Ragab uses `driverName` manually, we can store it in shipment or order notes
      // Let's just update the order state to on_the_way
      if (order.status !== 'on_the_way' && order.status !== 'delivered' && order.status !== 'cancelled') {
        await updateOrderStatus(systemCtx, order_id, 'on_the_way');
      }
    } else if (event_type === 'delivery.delivered') {
      if (order.status === 'preparing') {
        await updateOrderStatus(systemCtx, order_id, 'on_the_way');
        await updateOrderStatus(systemCtx, order_id, 'delivered');
      } else if (order.status === 'on_the_way') {
        await updateOrderStatus(systemCtx, order_id, 'delivered');
      }
    } else if (event_type === 'delivery.cancelled') {
      // Driver cancelled delivery - we might revert to preparing or cancel
      // For now, let's revert to preparing so another driver can be assigned
      if (order.status === 'on_the_way') {
         await db().update(orders).set({ status: 'preparing', version: sql`${orders.version} + 1` }).where(eq(orders.id, order_id));
      }
    }

    return { success: true };
  } catch (e: any) {
    logger().error({ err: e, order_id, event_type }, 'Failed to process Engezny webhook');
    return { success: false, reason: e.message };
  }
}
