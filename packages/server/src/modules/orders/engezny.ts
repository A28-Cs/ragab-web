import { getEngeznyFirestore } from '../../integrations/engezny/firebase';
import { logger } from '../../lib/logger';
import { Money } from '../../lib/money';
import { FieldValue } from 'firebase-admin/firestore';

export interface EngeznyOrderPayload {
  status: 'pending' | 'accepted' | 'purchased' | 'delivered' | 'cancelled';
  deliveryStatus?: string;
  orderStatus?: string;
  correlationId?: string;
  customerId: string | null;
  workerId?: string | null;
  storeId: string;
  orderText: string;
  deliveryAddressText: string;
  totalItemsPrice: number;
  deliveryFee: number;
  qrCodeString: string;
  ragabOrderId: string;
  /** Alias used by Engezny UI to show "Mahsoob Web" orders section (direct-claim flow). */
  mahsoobOrderId: string;
  customerPhone?: string;
}

/**
 * Pushes or updates an order in Engezny's Firestore.
 */
export async function pushOrderToEngezny(
  orderId: string,
  data: Partial<EngeznyOrderPayload>
): Promise<void> {
  const db = getEngeznyFirestore();
  if (!db) {
    logger().warn('Engezny integration disabled (missing credentials). Skipping push.');
    return;
  }

  const docRef = db.collection('orders').doc(orderId);

  try {
    const updateData: any = { ...data };
    
    // Add timestamps and granular fields based on status if it's a new write
    if (data.status === 'pending') {
      updateData.deliveryStatus = updateData.deliveryStatus || 'awaiting_dispatch';
      updateData.orderStatus = updateData.orderStatus || 'preparing';
      updateData.correlationId = orderId;
      updateData.timestamps = {
        createdAt: FieldValue.serverTimestamp(),
        acceptedAt: null,
        purchasedAt: null,
        deliveredAt: null,
      };
    } else if (data.status === 'delivered') {
      updateData.deliveryStatus = 'delivered';
      updateData['timestamps.deliveredAt'] = FieldValue.serverTimestamp();
    } else if (data.status === 'accepted') {
      updateData.deliveryStatus = 'accepted';
      updateData['timestamps.acceptedAt'] = FieldValue.serverTimestamp();
    } else if (data.status === 'purchased') {
      updateData.deliveryStatus = 'picked_up';
      updateData['timestamps.acceptedAt'] = FieldValue.serverTimestamp();
    }

    await docRef.set(updateData, { merge: true });
    logger().info({ orderId }, 'Order successfully synced to Engezny Firestore');
  } catch (error) {
    logger().error({ err: error, orderId }, 'Failed to sync order to Engezny');
    throw error;
  }
}

/**
 * Helper to build the orderText summary for Engezny Driver UI.
 */
export function buildEngeznyOrderText(
  orderNumber: string,
  items: Array<{ productNameAr: string; quantity: number }>
): string {
  let text = `طلب رقم #${orderNumber}\nالتفاصيل:\n`;
  for (const item of items) {
    text += `- ${item.productNameAr} (x${item.quantity})\n`;
  }
  return text;
}
