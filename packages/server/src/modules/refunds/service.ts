/**
 * Refunds (§18, §46, §52). Full and partial, idempotent, permission-gated
 * (payments:approve) with step-up re-authentication and audit. Flow keeps external
 * calls OUT of the DB transaction (§22):
 *   1. tx: insert a PENDING refund row — the SUM(refunds) ≤ payment trigger reserves
 *      the amount against the cap, blocking concurrent over-refunds at the DB layer.
 *   2. call the provider's refund API (external).
 *   3. tx: on success, bump payment.refundedMinor, set order payment_status
 *      (refunded / partially_refunded), and on a FULL refund cancel + restock.
 * The DB trigger is the final backstop: a refund that would exceed the payment is
 * rejected regardless of application logic.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders, orderItems, orderStatusHistory, payments, refunds } from '../../db/schema';
import { AuthenticationError, AuthorizationError, BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import type { RequestContext } from '../../http/context';
import { can } from '../../security/permissions';
import { verifyPassword } from '../../security/password';
import { getProvider } from '../payments/providers';
import { restockForOrder } from '../inventory/service';
import { logAudit } from '../audit';
import { notifyOrderEvent } from '../notifications/dispatch';
import type { ProviderKey } from '../payments/provider';

export interface RefundInput {
  orderId: string;
  amountMinor?: number; // omitted → full remaining
  reason?: string;
  /** Step-up re-auth (§46): the actor re-enters their password for this sensitive op. */
  reauthPassword: string;
}

export async function issueRefund(ctx: RequestContext, input: RefundInput): Promise<{ refundId: string; status: string; refundedMinor: number; full: boolean; orderNumber: string; amount: number }> {
  // Authorization + step-up re-auth.
  if (!ctx.principal?.isStaff || !can(ctx.principal.permissions, 'payments', 'approve')) {
    throw new AuthorizationError({ message: { ar: 'ليس لديك صلاحية للاسترداد.', en: 'You do not have permission to issue refunds.' }, meta: { permission: 'payments:approve' } });
  }
  const hash = ctx.principal.user.passwordHash;
  if (!hash || !(await verifyPassword(hash, input.reauthPassword))) {
    throw new AuthenticationError({ code: 'REAUTH_REQUIRED', message: { ar: 'يرجى تأكيد كلمة المرور.', en: 'Password confirmation is required for this action.' } });
  }

  const [order] = await db().select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  const [payment] = await db().select().from(payments).where(eq(payments.orderId, input.orderId)).limit(1);
  if (!payment || payment.status === 'pending' || payment.status === 'failed') {
    throw new BusinessRuleError({ code: 'ORDER_NOT_PAID', message: { ar: 'لا يوجد دفع مكتمل لاسترداده.', en: 'There is no captured payment to refund.' } });
  }

  const remaining = payment.amountMinor - payment.refundedMinor;
  const amount = input.amountMinor ?? remaining;
  if (amount <= 0 || amount > remaining) {
    throw new BusinessRuleError({ code: 'REFUND_AMOUNT_INVALID', message: { ar: 'قيمة الاسترداد غير صحيحة.', en: 'Invalid refund amount.' }, meta: { remaining: String(remaining) } });
  }

  // Deterministic key: the same refund attempted from the same starting balance is the
  // same operation (a double click), while a legitimate second partial refund happens
  // after `refundedMinor` moved and therefore gets a different key.
  const idempotencyKey = `${input.orderId}:${payment.refundedMinor}:${amount}`;
  let refundId = prefixedId('rfnd');
  // 1. Reserve the amount as a pending refund (trigger enforces the cap). On a key
  //    conflict, replay a succeeded refund, retry a failed one, and refuse an in-flight one.
  const inserted = await db().insert(refunds).values({
    id: refundId, paymentId: payment.id, orderId: input.orderId, amountMinor: amount,
    reason: input.reason ?? null, status: 'pending', actorId: ctx.principal.userId, idempotencyKey,
  }).onConflictDoNothing({ target: refunds.idempotencyKey }).returning({ id: refunds.id });
  if (inserted.length === 0) {
    const [existing] = await db().select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing?.status === 'succeeded') {
      return { refundId: existing.id, status: 'succeeded', refundedMinor: payment.refundedMinor, full: payment.refundedMinor >= payment.amountMinor, orderNumber: order.orderNumber, amount: amount / 100 };
    }
    if (existing?.status === 'pending') {
      throw new BusinessRuleError({ code: 'REFUND_IN_PROGRESS', message: { ar: 'هناك استرداد قيد التنفيذ لهذا الطلب.', en: 'A refund for this order is already in progress.' } });
    }
    // A previously failed attempt: reuse its row so the cap trigger sees one reservation.
    refundId = existing!.id;
    await db().update(refunds).set({ status: 'pending', actorId: ctx.principal.userId, reason: input.reason ?? existing!.reason }).where(eq(refunds.id, refundId));
  }

  // 2. Call the provider (external — outside any tx).
  const provider = getProvider(payment.provider as ProviderKey);
  const providerResult = payment.providerPaymentId
    ? await provider.refund({ providerPaymentId: payment.providerPaymentId, amountMinor: amount, currency: payment.currency })
    : { status: 'succeeded' as const };

  if (providerResult.status === 'failed') {
    await db().update(refunds).set({ status: 'failed' }).where(eq(refunds.id, refundId));
    throw new BusinessRuleError({ code: 'REFUND_FAILED', message: { ar: 'فشل الاسترداد لدى مزود الدفع.', en: 'The refund failed at the payment provider.' } });
  }

  // 3. Commit the refund effects transactionally.
  const newRefunded = payment.refundedMinor + amount;
  const isFull = newRefunded >= payment.amountMinor;
  await db().transaction(async (tx) => {
    await tx.update(refunds).set({ status: 'succeeded', providerRefundId: providerResult.providerRefundId ?? null }).where(eq(refunds.id, refundId));
    await tx.update(payments).set({ refundedMinor: newRefunded, status: isFull ? 'refunded' : 'paid', version: sql`${payments.version} + 1` }).where(eq(payments.id, payment.id));
    await tx.update(orders).set({
      paymentStatus: isFull ? 'refunded' : 'partially_refunded',
      refunded: true,
      ...(isFull ? { status: 'cancelled' as const } : {}),
      version: sql`${orders.version} + 1`,
    }).where(eq(orders.id, input.orderId));
    await tx.insert(orderStatusHistory).values({ orderId: input.orderId, fromStatus: order.paymentStatus, toStatus: isFull ? 'refunded' : 'partially_refunded', kind: 'payment', actorId: ctx.principal!.userId });

    // Full refund reverses the order → restock the items (compensating movements).
    if (isFull) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      // '' ⇒ the product's default variant (lines older than migration 0007).
      await restockForOrder(tx, input.orderId, items.map((i) => ({ productId: i.productId ?? '', variantId: i.variantId ?? '', quantity: i.quantity })).filter((l) => l.productId));
    }
  });

  await logAudit({
    actorId: ctx.principal.userId, actorName: ctx.principal.user.name, actorRole: 'staff',
    action: isFull ? 'order_cancelled_refunded' : 'refund_issued', resource: 'payments', resourceId: input.orderId,
    target: order.orderNumber, metadata: { amountMinor: String(amount), full: String(isFull) }, requestId: ctx.requestId,
  });
  await notifyOrderEvent('refund_issued', { userId: order.userId, orderId: input.orderId, orderNumber: order.orderNumber, amountMinor: amount });

  return { refundId, status: 'succeeded', refundedMinor: newRefunded, full: isFull, orderNumber: order.orderNumber, amount: amount / 100 };
}
