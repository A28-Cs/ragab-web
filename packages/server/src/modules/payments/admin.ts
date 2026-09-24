/**
 * Payments admin (§43). Read-only transaction list for the Payments page + a manual
 * confirmation entry point (Vodafone Cash / InstaPay transfers approved by staff). Both
 * are permission-gated at the route (`payments:view` / `payments:approve`).
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { payments, orders } from '../../db/schema';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { Money } from '../../lib/money';
import { toLegacyTimestamp } from '../../lib/clock';
import type { RequestContext } from '../../http/context';
import type { OrderStatus } from '../../types';
import { confirmWithinTx } from './service';
import { logAudit } from '../audit';
import { notifyOrderEvent } from '../notifications/dispatch';

export interface PaymentTransactionDto {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  method: 'cod' | 'vodafone_cash' | 'instapay';
  amount: number;
  status: 'paid' | 'pending' | 'refunded' | 'failed' | 'cancelled';
  /** Lifecycle of the linked order so the UI never offers "confirm" on a cancelled one. */
  orderStatus: OrderStatus;
  date: string;
}

function statusToDto(paymentStatus: string): PaymentTransactionDto['status'] {
  if (paymentStatus === 'paid') return 'paid';
  if (paymentStatus === 'refunded' || paymentStatus === 'partially_refunded') return 'refunded';
  if (paymentStatus === 'failed') return 'failed';
  if (paymentStatus === 'cancelled') return 'cancelled';
  return 'pending';
}

export async function listPayments(limit = 100): Promise<PaymentTransactionDto[]> {
  const rows = await db()
    .select({
      id: payments.id,
      orderId: payments.orderId,
      orderNumber: orders.orderNumber,
      method: payments.method,
      status: payments.status,
      amountMinor: payments.amountMinor,
      createdAt: payments.createdAt,
      deliveryAddress: orders.deliveryAddress,
      orderStatus: orders.status,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .orderBy(desc(payments.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const addr = r.deliveryAddress as { recipientName?: string } | null;
    return {
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      customerName: addr?.recipientName ?? '—',
      method: r.method as PaymentTransactionDto['method'],
      amount: Money.ofMinor(r.amountMinor).toMajor(),
      status: statusToDto(r.status),
      orderStatus: r.orderStatus as OrderStatus,
      date: toLegacyTimestamp(r.createdAt),
    };
  });
}

/**
 * Confirm a manual transfer payment (staff-approved). Idempotent; captures + advances.
 * A cancelled order is never payable: confirming it would record revenue for a sale that
 * does not exist, so the rule is enforced here (not only hidden in the UI).
 */
export async function confirmManualPayment(ctx: RequestContext, orderId: string): Promise<{ orderNumber: string; amount: number }> {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  if (order.status === 'cancelled' || order.paymentStatus === 'cancelled') {
    throw new BusinessRuleError({
      code: 'ORDER_NOT_PAYABLE',
      message: { ar: 'لا يمكن تأكيد الدفع لطلب ملغي.', en: 'A cancelled order cannot have its payment confirmed.' },
      meta: { orderStatus: order.status, paymentStatus: order.paymentStatus },
    });
  }
  const alreadyPaid = order.paymentStatus === 'paid';
  await db().transaction(async (tx) => {
    await confirmWithinTx(tx, orderId);
  });
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'payment_confirmed', resource: 'payments', resourceId: orderId, target: order.orderNumber, requestId: ctx.requestId,
  });
  // A replayed confirmation (already paid) captures nothing, so it tells the customer nothing.
  if (!alreadyPaid) await notifyOrderEvent('payment_confirmed', { userId: order.userId, orderId, orderNumber: order.orderNumber });
  return { orderNumber: order.orderNumber, amount: Money.ofMinor(order.totalMinor).toMajor() };
}
