/**
 * Notification delivery processor (§23, §26). Fans one queued notification out across
 * channels — email (SMTP or dev no-op), push (FCM) and SMS (gateway) — each gated by the
 * user's saved preferences. Order templates are rendered from the ORDER ROW, not from the
 * payload, so a retried job always sends the current truth (address, totals, items).
 *
 * Delivery is idempotent per channel: every channel that completes is recorded on the job
 * (`delivered`) before the next one runs, so a retry after a partial failure never re-sends
 * an email that already went out. Push tokens the provider reports as invalid are pruned.
 */
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { publicEnv } from '../../config/env';
import { db } from '../../db/client';
import { notificationPreferences, orderItems, orders, users } from '../../db/schema';
import {
  orderConfirmationEmail,
  orderStatusEmail,
  paymentConfirmedEmail,
  refundIssuedEmail,
  sendEmail,
  type EmailTemplate,
  type OrderEmailSummary,
} from '../../lib/email';
import { logger } from '../../lib/logger';
import { Money } from '../../lib/money';
import { sendPush } from '../../lib/push';
import { sendSms, smsConfigured } from '../../lib/sms';
import { deviceService } from '../../modules/devices';

export type NotificationTemplate = 'order_confirmation' | 'order_status' | 'payment_confirmed' | 'refund_issued';
export type NotificationChannel = 'email' | 'push' | 'sms';

export interface NotificationPayload {
  userId: string;
  template: NotificationTemplate;
  data?: { orderId?: string; orderNumber?: string; status?: string; amountMinor?: number };
  /** Channels already delivered — written back to the job so a retry skips them. */
  delivered?: Partial<Record<NotificationChannel, boolean>>;
}

const STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  pending: { ar: 'قيد الانتظار', en: 'pending' },
  preparing: { ar: 'قيد التجهيز', en: 'being prepared' },
  on_the_way: { ar: 'في الطريق إليك', en: 'on its way' },
  delivered: { ar: 'تم توصيله', en: 'delivered' },
  cancelled: { ar: 'تم إلغاؤه', en: 'cancelled' },
};

/** Project the order row + its line snapshots into what the email templates need. */
export async function loadOrderSummary(orderId: string): Promise<OrderEmailSummary | null> {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const a = (order.deliveryAddress ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    orderNumber: order.orderNumber,
    subtotal: Money.ofMinor(order.subtotalMinor).toMajor(),
    deliveryFee: Money.ofMinor(order.deliveryFeeMinor).toMajor(),
    discount: Money.ofMinor(order.discountMinor).toMajor(),
    total: Money.ofMinor(order.totalMinor).toMajor(),
    items: items.map((it) => ({
      nameAr: it.productNameAr,
      nameEn: it.productNameEn ?? undefined,
      quantity: it.quantity,
      total: Money.ofMinor(it.lineTotalMinor).toMajor(),
    })),
    address: {
      recipientName: str(a.recipientName),
      phone: str(a.phone),
      village: str(a.village),
      streetAddress: str(a.streetAddress),
      landmark: str(a.landmark) || undefined,
    },
    paymentMethod: order.paymentMethod as OrderEmailSummary['paymentMethod'],
    orderUrl: `${publicEnv().NEXT_PUBLIC_APP_URL}/account/orders/${order.id}`,
  };
}

function emailFor(template: NotificationTemplate, o: OrderEmailSummary, data: NotificationPayload['data']): EmailTemplate | null {
  switch (template) {
    case 'order_confirmation':
      return orderConfirmationEmail(o);
    case 'order_status':
      return orderStatusEmail(o, String(data?.status ?? ''));
    case 'payment_confirmed':
      return paymentConfirmedEmail(o);
    case 'refund_issued':
      return refundIssuedEmail(o, Money.ofMinor(Number(data?.amountMinor ?? 0)).toMajor());
    default:
      return null;
  }
}

/** Bilingual push copy per template. The data payload carries the deep-link target (§25). */
export function pushCopy(
  template: NotificationTemplate,
  ctx: { orderId: string; orderNumber: string; status?: string; amountMinor?: number },
): { titleAr: string; titleEn: string; bodyAr: string; bodyEn: string; data: Record<string, string> } | null {
  const data = { type: 'order', orderId: ctx.orderId, orderNumber: ctx.orderNumber };
  const n = ctx.orderNumber;
  switch (template) {
    case 'order_confirmation':
      return { titleAr: 'تم استلام طلبك', titleEn: 'Order received', bodyAr: `طلبك رقم ${n} قيد المعالجة.`, bodyEn: `Your order ${n} is being processed.`, data };
    case 'order_status': {
      const label = STATUS_LABEL[ctx.status ?? ''] ?? { ar: 'تم تحديثه', en: 'updated' };
      return { titleAr: 'تحديث حالة الطلب', titleEn: 'Order update', bodyAr: `طلبك رقم ${n} ${label.ar}.`, bodyEn: `Your order ${n} is ${label.en}.`, data };
    }
    case 'payment_confirmed':
      return { titleAr: 'تم تأكيد الدفع', titleEn: 'Payment confirmed', bodyAr: `تم تأكيد دفع طلبك رقم ${n} وبدأنا في تجهيزه.`, bodyEn: `Payment for order ${n} is confirmed; we are preparing it.`, data };
    case 'refund_issued': {
      const amount = Money.ofMinor(Number(ctx.amountMinor ?? 0)).toMajor().toFixed(2);
      return { titleAr: 'تم إصدار استرداد', titleEn: 'Refund issued', bodyAr: `أعدنا ${amount} ج.م عن الطلب رقم ${n}.`, bodyEn: `${amount} EGP was refunded for order ${n}.`, data };
    }
    default:
      return null;
  }
}

/**
 * SMS is the costly channel: only the transitions a customer must act on (courier on the
 * way, delivered, cancelled) go out by text; "preparing" is covered by push + email.
 */
export function smsCopy(orderNumber: string, status: string | undefined): string | null {
  if (status !== 'on_the_way' && status !== 'delivered' && status !== 'cancelled') return null;
  const label = STATUS_LABEL[status]!;
  return `رجب: طلبك ${orderNumber} ${label.ar}. Ragab: order ${orderNumber} ${label.en}.`;
}

/**
 * Deliver one payload across channels. `job` is optional so the same code runs inline
 * (queue unavailable / tests) — without a job, per-channel progress is kept in memory only.
 */
export async function processNotificationPayload(payload: NotificationPayload, job?: Job): Promise<void> {
  const { userId, template, data } = payload;
  const delivered: Partial<Record<NotificationChannel, boolean>> = { ...(payload.delivered ?? {}) };
  const markDelivered = async (channel: NotificationChannel): Promise<void> => {
    delivered[channel] = true;
    if (job) await job.updateData({ ...payload, delivered });
  };

  const [prefs] = await db().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  const [user] = await db().select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  const summary = data?.orderId ? await loadOrderSummary(data.orderId) : null;
  const orderNumber = summary?.orderNumber ?? String(data?.orderNumber ?? '');

  // Email channel — rendered from the order row so a retry never sends stale numbers.
  if (!delivered.email && user?.email && prefs?.orderEmail !== false && summary) {
    const tpl = emailFor(template, summary, data);
    if (tpl) await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text, userId, template });
    await markDelivered('email');
  }

  // Push channel (§26): the user's registered devices, if opted in.
  if (!delivered.push && prefs?.orderPush !== false) {
    const copy = pushCopy(template, { orderId: data?.orderId ?? '', orderNumber, status: data?.status, amountMinor: data?.amountMinor });
    if (copy) {
      const tokens = await deviceService.tokensForUser(userId);
      if (tokens.length > 0) {
        const res = await sendPush({ tokens: tokens.map((t) => t.token), ...copy });
        for (const bad of res.invalidTokens) await deviceService.pruneToken(bad);
      }
    }
    await markDelivered('push');
  }

  // SMS channel — only when a real gateway is configured (the logging stub is not delivery).
  if (!delivered.sms && template === 'order_status' && prefs?.orderSms !== false && smsConfigured() && user?.phone) {
    const text = smsCopy(orderNumber, data?.status);
    if (text) await sendSms(user.phone, text);
    await markDelivered('sms');
  }

  logger().info({ userId, template, delivered }, 'notification processed');
}

export async function processNotification(job: Job): Promise<void> {
  await processNotificationPayload(job.data as NotificationPayload, job);
}
