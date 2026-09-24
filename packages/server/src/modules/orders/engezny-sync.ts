import { getEngeznyFirestore } from '../../integrations/engezny/firebase';
import { logger } from '../../lib/logger';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { eq, sql } from 'drizzle-orm';
import { updateOrderStatus } from './service';

const log = logger().child({ component: 'engezny-sync' });

/**
 * Synchronizes an order's status from Engezny Firestore into Ragab PostgreSQL.
 * Reads the true status directly from Engezny Firestore via server-side Firebase Admin SDK.
 * Safely handles multi-step state machine transitions (preparing -> on_the_way -> delivered).
 *
 * @returns true if order status was updated, false otherwise.
 */
export async function syncOrderWithEngezny(orderIdOrNumber: string): Promise<boolean> {
  const firestore = getEngeznyFirestore();
  if (!firestore) {
    log.warn('Engezny Firebase Admin not configured. Skipping sync.');
    return false;
  }

  try {
    const [order] = await db()
      .select()
      .from(orders)
      .where(sql`${orders.id} = ${orderIdOrNumber} OR ${orders.orderNumber} = ${orderIdOrNumber}`)
      .limit(1);

    if (!order) {
      log.warn({ orderIdOrNumber }, 'Order not found in Ragab DB, skipping sync.');
      return false;
    }

    // Terminal statuses cannot be changed
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return false;
    }

    // Query Engezny doc (doc ID is Ragab's order.id)
    let docSnap = await firestore.collection('orders').doc(order.id).get();
    let docData = docSnap.exists ? docSnap.data() : null;

    // Fallback: search by ragabOrderId field
    if (!docData) {
      const q = await firestore.collection('orders').where('ragabOrderId', '==', order.id).limit(1).get();
      if (!q.empty) {
        docData = q.docs[0].data();
      }
    }

    if (!docData) {
      return false;
    }

    const engeznyStatus = docData.status as string;
    log.info({ orderId: order.id, ragabStatus: order.status, engeznyStatus }, 'Syncing order from Engezny');

    const { buildContext } = await import('../../http/context');
    const systemCtx = await buildContext({
      method: 'POST',
      url: 'http://localhost/system/engezny-sync',
      headers: new Headers(),
    });
    systemCtx.principal = {
      userId: 'system-engezny',
      user: { id: 'system-engezny', name: 'Engezny System', email: '', phone: '' } as any,
      sessionId: 'sys',
      isStaff: true,
      permissions: new Set(['orders:edit', 'orders:view', 'orders:approve']) as any,
    } as any;

    let updated = false;

    // Engezny 'accepted' = driver claimed the order but is still preparing/picking up.
    // No status change in Ragab is needed — it should remain 'preparing'.
    // This prevents the order from vanishing in Engezny immediately after claim.
    if (engeznyStatus === 'accepted') {
      log.info({ orderId: order.id }, 'Engezny accepted -> driver claimed, keeping Ragab status as-is (preparing)');
      // nothing to update

    // Engezny 'purchased' = driver finished picking up and is on the way to customer
    } else if (engeznyStatus === 'purchased') {
      if (order.status === 'preparing') {
        log.info({ orderId: order.id }, 'Engezny purchased -> updating Ragab to on_the_way');
        await updateOrderStatus(systemCtx, order.id, 'on_the_way');
        updated = true;
      }
    } else if (engeznyStatus === 'delivered') {
      if (order.status === 'preparing') {
        // Step 1: preparing -> on_the_way (state machine requirement)
        log.info({ orderId: order.id }, 'Engezny delivered -> step 1: updating to on_the_way');
        await updateOrderStatus(systemCtx, order.id, 'on_the_way');
        // Step 2: on_the_way -> delivered
        log.info({ orderId: order.id }, 'Engezny delivered -> step 2: updating to delivered');
        await updateOrderStatus(systemCtx, order.id, 'delivered');
        updated = true;
      } else if (order.status === 'on_the_way') {
        log.info({ orderId: order.id }, 'Engezny delivered -> updating to delivered');
        await updateOrderStatus(systemCtx, order.id, 'delivered');
        updated = true;
      }
    } else if (engeznyStatus === 'cancelled' || engeznyStatus === 'disputed') {
      log.info({ orderId: order.id }, 'Engezny cancelled -> updating Ragab to cancelled');
      await updateOrderStatus(systemCtx, order.id, 'cancelled');
      updated = true;
    }

    return updated;
  } catch (error) {
    log.error({ err: error, orderIdOrNumber }, 'Error during syncOrderWithEngezny');
    return false;
  }
}
