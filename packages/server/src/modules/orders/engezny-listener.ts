import { getEngeznyFirestore } from '../../integrations/engezny/firebase';
import { logger } from '../../lib/logger';
import { db } from '../../db/client';
import { orders } from '../../db/schema/orders';
import { eq } from 'drizzle-orm';

const log = logger().child({ component: 'engezny-listener' });

/**
 * Attaches a real-time listener to ALL Engezny orders.
 * Filters to Ragab orders in the handler (avoids needing a Firestore composite index).
 *
 * Status mapping from Engezny → Ragab:
 *   accepted  → on_the_way  (driver claimed the order)
 *   delivered → delivered   (driver confirmed delivery)
 *   cancelled → preparing   (revert so another driver can pick up)
 */
export function startEngeznyListener(): () => void {
  const firestore = getEngeznyFirestore();
  if (!firestore) {
    log.warn('Engezny Firebase Admin not configured. Real-time sync listener disabled.');
    return () => {};
  }

  log.info('Starting Engezny real-time order listener...');

  // Listen to ALL orders — filter to Ragab orders in the handler
  // (avoids requiring a Firestore composite index for != null query)
  const unsubscribe = firestore.collection('orders').onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== 'modified') return;

        const docData = change.doc.data();
        const ragabOrderId = docData.ragabOrderId;

        // Skip orders that don't have a Ragab order ID
        if (!ragabOrderId) return;

        const engeznyStatus = docData.status as string;
        log.info({ ragabOrderId, engeznyStatus }, 'Engezny Ragab order changed');

        try {
          const [order] = await db()
            .select()
            .from(orders)
            .where(eq(orders.id, ragabOrderId))
            .limit(1);

          if (!order) {
            log.warn({ ragabOrderId }, 'Ragab order not found in DB, skipping');
            return;
          }

          // Just call the centralized sync function
          const { syncOrderWithEngezny } = await import('./engezny-sync');
          await syncOrderWithEngezny(ragabOrderId);
        } catch (error) {
          log.error({ err: error, ragabOrderId }, 'Failed to sync Engezny status to Ragab');
        }
      });
    },
    (error) => {
      log.error({ err: error }, 'Engezny Firestore listener disconnected with error');
    }
  );

  return unsubscribe;
}
