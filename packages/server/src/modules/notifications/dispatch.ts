/**
 * Order-event notification dispatcher (§23). The single entry point every order/payment
 * transition calls. It writes the in-app notification row synchronously (the customer's
 * bell is right the moment the API responds) and hands delivery — email, push, SMS — to
 * the notifications queue. If the queue is unreachable the payload is delivered inline so
 * a Redis blip never silently drops a customer email.
 *
 * Never throws: a notification failure must not roll back or fail the business operation
 * that triggered it. Callers `await` it AFTER their transaction has committed.
 */
import { isTest } from '../../config/env';
import { db } from '../../db/client';
import { notifications } from '../../db/schema';
import { processNotificationPayload, type NotificationPayload, type NotificationTemplate } from '../../jobs/processors/notifications';
import { enqueueNotification } from '../../jobs/queues';
import { logger } from '../../lib/logger';
import { Money } from '../../lib/money';

export type OrderEvent = NotificationTemplate;

export interface OrderEventInput {
  /** Customer to notify. Orders without one (legacy manual orders) have nobody to tell. */
  userId: string | null | undefined;
  orderId: string;
  orderNumber: string;
  /** New order status — `order_status` only. */
  status?: string;
  /** Refunded amount in minor units — `refund_issued` only. */
  amountMinor?: number;
}

const STATUS_COPY: Record<string, { titleAr: string; titleEn: string; bodyAr: string; bodyEn: string }> = {
  preparing: { titleAr: 'جاري تجهيز طلبك', titleEn: 'Your order is being prepared', bodyAr: 'بدأنا في تجهيز طلبك رقم {n}.', bodyEn: 'We started preparing order {n}.' },
  on_the_way: { titleAr: 'طلبك في الطريق', titleEn: 'Your order is on its way', bodyAr: 'خرج طلبك رقم {n} للتوصيل.', bodyEn: 'Order {n} is out for delivery.' },
  delivered: { titleAr: 'تم توصيل طلبك', titleEn: 'Your order was delivered', bodyAr: 'تم توصيل طلبك رقم {n}. شكرًا لك!', bodyEn: 'Order {n} was delivered. Thank you!' },
  cancelled: { titleAr: 'تم إلغاء طلبك', titleEn: 'Your order was cancelled', bodyAr: 'تم إلغاء طلبك رقم {n}.', bodyEn: 'Order {n} was cancelled.' },
};

function inAppCopy(event: OrderEvent, input: OrderEventInput): { titleAr: string; titleEn: string; bodyAr: string; bodyEn: string } {
  const n = input.orderNumber;
  switch (event) {
    case 'order_confirmation':
      return { titleAr: 'تم استلام طلبك', titleEn: 'Order received', bodyAr: `طلبك رقم ${n} قيد المعالجة.`, bodyEn: `Your order ${n} was received.` };
    case 'order_status': {
      const c = STATUS_COPY[input.status ?? ''] ?? { titleAr: 'تحديث حالة الطلب', titleEn: 'Order update', bodyAr: 'تم تحديث حالة طلبك رقم {n}.', bodyEn: 'Order {n} was updated.' };
      return { titleAr: c.titleAr, titleEn: c.titleEn, bodyAr: c.bodyAr.replace('{n}', n), bodyEn: c.bodyEn.replace('{n}', n) };
    }
    case 'payment_confirmed':
      return { titleAr: 'تم تأكيد الدفع', titleEn: 'Payment confirmed', bodyAr: `تم تأكيد دفع طلبك رقم ${n} وبدأنا في تجهيزه.`, bodyEn: `Payment for order ${n} is confirmed.` };
    case 'refund_issued': {
      const amount = Money.ofMinor(input.amountMinor ?? 0).toMajor().toFixed(2);
      return { titleAr: 'تم إصدار استرداد', titleEn: 'Refund issued', bodyAr: `أعدنا ${amount} ج.م عن الطلب رقم ${n}.`, bodyEn: `${amount} EGP was refunded for order ${n}.` };
    }
  }
}

export async function notifyOrderEvent(event: OrderEvent, input: OrderEventInput): Promise<void> {
  if (!input.userId) return;
  const log = logger().child({ component: 'notify', event, orderId: input.orderId });

  try {
    await db().insert(notifications).values({ userId: input.userId, category: 'order', ...inAppCopy(event, input), href: `/account/orders/${input.orderId}` });
  } catch (e) {
    log.error({ err: e }, 'in-app notification insert failed');
  }

  const payload: NotificationPayload = {
    userId: input.userId,
    template: event,
    data: { orderId: input.orderId, orderNumber: input.orderNumber, status: input.status, amountMinor: input.amountMinor },
  };

  // Tests exercise the inline path (the queue path is the same processor behind BullMQ).
  if (isTest()) {
    try {
      await processNotificationPayload(payload);
    } catch (e) {
      log.error({ err: e }, 'inline notification delivery failed');
    }
    return;
  }

  try {
    await enqueueNotification(payload);
  } catch (e) {
    log.warn({ err: e }, 'notification queue unavailable; delivering inline');
    try {
      await processNotificationPayload(payload);
    } catch (err) {
      log.error({ err }, 'inline notification delivery failed');
    }
  }
}
