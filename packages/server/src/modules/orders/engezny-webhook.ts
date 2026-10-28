import crypto from 'node:crypto';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { shipments, shipmentEvents } from '../../db/schema/shipping';
import { orderStatusHistory } from '../../db/schema/orders';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { serverEnv } from '../../config/env';
import { updateOrderStatus } from './service';
import type { RequestContext } from '../../http/context';
import { prefixedId } from '../../lib/ids';
import { logAudit } from '../audit';

export interface EngeznyWebhookPayload {
  event_id?: string;
  event_type:
    | 'delivery.driver_assigned'
    | 'delivery.driver_accepted'
    | 'delivery.arrived_at_pickup'
    | 'delivery.picked_up'
    | 'delivery.in_transit'
    | 'delivery.arrived_at_dropoff'
    | 'delivery.delivered'
    | 'delivery.failed'
    | 'delivery.disputed'
    | 'delivery.cancelled';
  order_id: string;
  data: {
    driver?: {
      worker_id?: string;
      name?: string;
      phone?: string;
    };
    status?: string;
    delivery_photo_url?: string;
    reason_code?: string;
    notes?: string;
    correlation_id?: string;
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
 * Handles incoming webhooks from Engezny Courier App and Cloud Functions.
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

  const systemCtx: RequestContext = {
    ...ctx,
    principal: {
      userId: 'system-engezny',
      user: { id: 'system-engezny', name: 'Engezny System', email: '', phone: '' } as any,
      sessionId: 'sys',
      isStaff: true,
      permissions: new Set(['orders:edit', 'orders:view', 'orders:approve']) as any,
    } as any,
  };

  try {
    const [order] = await db().select().from(orders).where(eq(orders.id, order_id)).limit(1);
    if (!order) {
      return { success: false, reason: 'Order not found' };
    }

    // Helper: upsert shipment row in Ragab DB
    let [shipment] = await db()
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order_id))
      .orderBy(desc(shipments.createdAt))
      .limit(1);

    const driverName = data.driver?.name || shipment?.driverName || 'مندوب إنجزني';
    const driverPhone = data.driver?.phone || shipment?.driverPhone || '';

    if (!shipment) {
      const shipId = prefixedId('ship');
      await db().insert(shipments).values({
        id: shipId,
        orderId: order_id,
        driverName,
        driverPhone,
        status: 'pending',
      });
      const [created] = await db().select().from(shipments).where(eq(shipments.id, shipId)).limit(1);
      shipment = created;
    } else if (data.driver?.name || data.driver?.phone) {
      await db()
        .update(shipments)
        .set({ driverName, driverPhone })
        .where(eq(shipments.id, shipment.id));
    }

    // Process event types with proper state isolation
    if (event_type === 'delivery.driver_assigned' || event_type === 'delivery.driver_accepted') {
      // Driver accepted the job, but has NOT picked up medicine yet.
      // Order status stays 'preparing' (with fulfillment 'ready' if ready).
      if (shipment) {
        await db().update(shipments).set({ status: 'assigned' }).where(eq(shipments.id, shipment.id));
        await db().insert(shipmentEvents).values({
          id: prefixedId('shevt'),
          shipmentId: shipment.id,
          status: 'assigned',
          note: `المندوب ${driverName} قبل مهمة التوصيل`,
        });
      }

      await logAudit({
        actorId: data.driver?.worker_id || 'system-engezny',
        actorName: driverName,
        actorRole: 'courier',
        action: 'delivery.driver_accepted',
        resource: 'orders',
        resourceId: order_id,
        target: order.orderNumber,
        metadata: { driverName, driverPhone, op: 'driver_assigned' },
        requestId: ctx.requestId,
      });

    } else if (event_type === 'delivery.picked_up') {
      // Driver physically picked up medicine from pharmacy → now 'out_for_delivery'
      if (shipment) {
        await db().update(shipments).set({ status: 'out_for_delivery' }).where(eq(shipments.id, shipment.id));
        await db().insert(shipmentEvents).values({
          id: prefixedId('shevt'),
          shipmentId: shipment.id,
          status: 'out_for_delivery',
          note: `المندوب استلم الأدوية وبدأ التوصيل`,
        });
      }

      if (order.status === 'preparing') {
        await updateOrderStatus(systemCtx, order_id, 'on_the_way');
      }

    } else if (event_type === 'delivery.delivered') {
      // Driver confirmed final delivery
      if (shipment) {
        await db().update(shipments).set({
          status: 'delivered',
          deliveredAt: new Date(),
        }).where(eq(shipments.id, shipment.id));

        await db().insert(shipmentEvents).values({
          id: prefixedId('shevt'),
          shipmentId: shipment.id,
          status: 'delivered',
          note: data.notes || 'تم تأكيد تسليم الطلب للعميل بنجاح',
        });
      }

      if (order.status === 'preparing') {
        await updateOrderStatus(systemCtx, order_id, 'on_the_way');
        await updateOrderStatus(systemCtx, order_id, 'delivered');
      } else if (order.status === 'on_the_way') {
        await updateOrderStatus(systemCtx, order_id, 'delivered');
      }

    } else if (event_type === 'delivery.failed' || event_type === 'delivery.disputed') {
      // Delivery issue or dispute
      if (shipment) {
        await db().update(shipments).set({ status: 'failed' }).where(eq(shipments.id, shipment.id));
        await db().insert(shipmentEvents).values({
          id: prefixedId('shevt'),
          shipmentId: shipment.id,
          status: 'failed',
          note: data.notes || `فشل التوصيل / نزاع: ${data.reason_code || 'غير محدد'}`,
        });
      }

      await logAudit({
        actorId: data.driver?.worker_id || 'system-engezny',
        actorName: driverName,
        actorRole: 'courier',
        action: 'delivery.failed',
        resource: 'orders',
        resourceId: order_id,
        target: order.orderNumber,
        result: 'failure',
        metadata: {
          reasonCode: data.reason_code || 'DELIVERY_FAILED',
          notes: data.notes || '',
        },
        requestId: ctx.requestId,
      });

    } else if (event_type === 'delivery.cancelled') {
      // Driver cancelled assignment before pickup - revert to preparing for another driver
      if (shipment) {
        await db().update(shipments).set({ status: 'pending', driverName: null, driverPhone: null }).where(eq(shipments.id, shipment.id));
        await db().insert(shipmentEvents).values({
          id: prefixedId('shevt'),
          shipmentId: shipment.id,
          status: 'pending',
          note: data.notes || 'المندوب انسحب من الطلب، بانتظار مندوب بديل',
        });
      }

      if (order.status === 'on_the_way') {
        await db().update(orders).set({ status: 'preparing', version: sql`${orders.version} + 1` }).where(eq(orders.id, order_id));
        await db().insert(orderStatusHistory).values({
          orderId: order_id,
          fromStatus: 'on_the_way',
          toStatus: 'preparing',
          kind: 'fulfillment',
          note: data.notes || 'إعادة الطلب إلى التجهيز بسبب انسحاب المندوب',
        });
      }
    }

    return { success: true };
  } catch (e: any) {
    logger().error({ err: e, order_id, event_type }, 'Failed to process Engezny webhook');
    return { success: false, reason: e.message };
  }
}
