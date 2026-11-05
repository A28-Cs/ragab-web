import { getEngeznyFirestore } from '../../integrations/engezny/firebase';
import { logger } from '../../lib/logger';
import { Money } from '../../lib/money';
import { FieldValue } from 'firebase-admin/firestore';

export interface EngeznyOrderItem {
  id?: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unit?: string;
  image?: string;
  price?: number;
  notes?: string;
}

export interface EngeznyOrderPayload {
  status: 'pending' | 'accepted' | 'purchased' | 'delivered' | 'cancelled';
  deliveryStatus?: string;
  orderStatus?: string;
  correlationId?: string;
  customerId: string | null;
  workerId?: string | null;
  storeId: string;
  orderNumber?: string;
  orderText: string;
  items?: EngeznyOrderItem[];
  deliveryAddressText: string;
  totalItemsPrice: number;
  deliveryFee: number;
  qrCodeString: string;
  ragabOrderId: string;
  /** Alias used by Engezny UI to show "Mahsoob Web" orders section (direct-claim flow). */
  mahsoobOrderId: string;
  customerPhone?: string;
  customerMapUrl?: string | null;
  storeMapUrl?: string | null;
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

    if (data.customerMapUrl) {
      updateData.customerMapUrl = data.customerMapUrl;
      updateData.deliveryLocation = updateData.deliveryLocation || {
        mapUrl: data.customerMapUrl,
        address: data.deliveryAddressText
      };
    }
    if (data.storeMapUrl) {
      updateData.storeMapUrl = data.storeMapUrl;
      updateData.pickupLocation = updateData.pickupLocation || {
        mapUrl: data.storeMapUrl,
        name: 'صيدلية رجب'
      };
    }
    
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

      try {
        await db.collection('notifications').add({
          type: 'new_order',
          recipientRole: 'worker',
          orderId,
          orderNumber: data.orderNumber || orderId.slice(0, 8),
          title: 'طلب جديد متاح للتوصيل',
          message: `يتوفر طلب صيدلية جديد (#${data.orderNumber || orderId.slice(0, 8)}) جاهز للقبول والتوصيل`,
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (notifErr) {
        logger().warn({ notifErr }, 'Could not add worker notification in Engezny');
      }
    } else if (data.status === 'cancelled') {
      try {
        await db.collection('notifications').add({
          type: 'order_cancelled',
          recipientRole: 'worker',
          orderId,
          orderNumber: data.orderNumber || orderId.slice(0, 8),
          title: 'تم إلغاء الطلب',
          message: `تم إلغاء الطلب #${data.orderNumber || orderId.slice(0, 8)} من قِبل الصيدلية`,
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (notifErr) {
        logger().warn({ notifErr }, 'Could not add worker cancellation notification in Engezny');
      }
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
