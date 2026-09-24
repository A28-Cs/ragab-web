/**
 * Payments service (§17-§20, §52). Coordinates payment intents/payments with orders,
 * always keeping the order's payment_status as the projection of a signature-verified
 * event or a server-side action — never a client claim. Confirmation is idempotent:
 * applying the same success twice produces no second capture and no duplicate transition.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../db/client';
import { db } from '../../db/client';
import { orders, orderStatusHistory, paymentIntents, payments, paymentTransactions } from '../../db/schema';
import { NotFoundError, BusinessRuleError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { getSettings } from '../settings/service';
import { commitReservationsForOrder, releaseReservationsForOrder } from '../inventory/service';
import { assertOrderTransition, assertPaymentTransition, type PaymentState } from '../orders/stateMachine';
import { getProvider } from './providers';
import type { ProviderKey } from './provider';
import { notifyOrderEvent } from '../notifications/dispatch';
import type { PaymentMethod } from '../../types';

/** Resolve which provider handles an order's payment method, given store config. */
async function resolveProviderKey(method: PaymentMethod): Promise<ProviderKey> {
  if (method === 'cod') return 'cod';
  const settings = await getSettings();
  const { getCredential } = await import('../../lib/credentials');
  const paymobConfigured = Boolean(await getCredential('paymob', 'PAYMOB_SECRET_KEY'));
  if (settings.onlinePaymentsEnabled && paymobConfigured) return 'paymob';
  return 'manual_transfer';
}

export interface InitPaymentResult {
  status: string;
  redirectUrl?: string;
  clientSecret?: string;
  instructions?: { ar: string; en: string };
  paymentMethod: PaymentMethod;
}

/**
 * Initialize payment for a freshly placed order (§21 step 3). Runs AFTER the order
 * transaction has committed — no external calls happen inside a DB transaction (§22).
 */
export async function initPayment(orderId: string): Promise<InitPaymentResult> {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });

  const method = order.paymentMethod as PaymentMethod;
  const providerKey = await resolveProviderKey(method);
  const provider = getProvider(providerKey);

  // Idempotency: reuse an existing intent for this order+provider BEFORE touching the
  // provider, so a retried checkout never opens a second Paymob intention.
  const [existingIntent] = await db().select().from(paymentIntents).where(and(eq(paymentIntents.orderId, orderId), eq(paymentIntents.provider, providerKey))).limit(1);
  const address = order.deliveryAddress as { recipientName?: string; phone?: string };
  const intentInput = {
    orderId,
    orderNumber: order.orderNumber,
    amountMinor: order.totalMinor,
    currency: order.currency,
    method: (method === 'cod' ? 'cod' : method === 'instapay' ? 'instapay' : 'vodafone_cash') as 'cod' | 'instapay' | 'vodafone_cash',
    customer: { name: address.recipientName ?? 'Customer', phone: address.phone ?? '' },
  };

  if (existingIntent) {
    const stored = (existingIntent.metadata ?? {}) as { redirectUrl?: string; instructions?: { ar: string; en: string } };
    // COD / manual transfer intents are pure (no external call) — recompute so the
    // instructions stay current; a Paymob intent is replayed from what we stored.
    const replay = providerKey === 'paymob'
      ? { status: existingIntent.status === 'created' ? 'created' : 'requires_action', redirectUrl: stored.redirectUrl, clientSecret: existingIntent.providerClientSecret ?? undefined, instructions: stored.instructions }
      : await provider.createIntent(intentInput);
    return { status: replay.status, redirectUrl: replay.redirectUrl, clientSecret: replay.clientSecret, instructions: replay.instructions, paymentMethod: method };
  }

  const result = await provider.createIntent(intentInput);

  await db().insert(paymentIntents).values({
    id: prefixedId('pi'),
    orderId,
    provider: providerKey,
    method,
    status: result.status === 'created' ? 'created' : 'requires_action',
    amountMinor: order.totalMinor,
    currency: order.currency,
    providerIntentId: result.providerIntentId ?? null,
    providerClientSecret: result.clientSecret ?? null,
    idempotencyKey: `${orderId}:${providerKey}`,
    metadata: { redirectUrl: result.redirectUrl, instructions: result.instructions },
  }).onConflictDoNothing();
  // Create the pending payment row (captured on confirm / delivery). UNIQUE(order_id)
  // turns a concurrent duplicate into a no-op instead of a second payment.
  await db().insert(payments).values({
    id: prefixedId('pay'),
    orderId,
    provider: providerKey,
    method,
    status: 'pending',
    amountMinor: order.totalMinor,
    currency: order.currency,
  }).onConflictDoNothing({ target: payments.orderId });

  return { status: result.status, redirectUrl: result.redirectUrl, clientSecret: result.clientSecret, instructions: result.instructions, paymentMethod: method };
}

/**
 * Mark an order's payment as succeeded and advance fulfillment — idempotent. Safe to
 * call from a webhook, a manual approval, or a reconciliation job; a second call is a
 * no-op. Runs in a transaction: capture the payment, transition the order, commit stock.
 */
export async function confirmPaymentSucceeded(
  orderId: string,
  opts: { providerPaymentId?: string; amountMinor?: number } = {},
): Promise<void> {
  const outcome = await db().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });

    // Idempotent guard: already paid → nothing to do (and nothing to tell the customer).
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || order.paymentStatus === 'partially_refunded') {
      return { captured: false, userId: order.userId, orderNumber: order.orderNumber };
    }

    // The provider's amount must match what we charged — a mismatch is never marked paid.
    // The webhook records the error and the reconciliation job surfaces it for a human.
    if (opts.amountMinor !== undefined && opts.amountMinor !== order.totalMinor) {
      throw new BusinessRuleError({
        code: 'PAYMENT_AMOUNT_MISMATCH',
        message: { ar: 'مبلغ الدفع لا يطابق إجمالي الطلب.', en: 'The captured amount does not match the order total.' },
        meta: { expectedMinor: order.totalMinor, receivedMinor: opts.amountMinor },
      });
    }

    // A capture landing on an already-cancelled order means the customer's money was
    // taken for nothing: record the money truth, keep the order cancelled, and shout.
    const lateCapture = order.status === 'cancelled' || order.paymentStatus === 'cancelled';
    if (!lateCapture) assertPaymentTransition(order.paymentStatus as PaymentState, 'paid');
    if (lateCapture) logger().error({ orderId }, 'payment captured for a cancelled order — refund required');

    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    if (payment) {
      await tx.update(payments).set({
        status: 'paid',
        capturedAt: new Date(),
        providerPaymentId: opts.providerPaymentId ?? payment.providerPaymentId,
        version: sql`${payments.version} + 1`,
      }).where(eq(payments.id, payment.id));
      await tx.insert(paymentTransactions).values({
        paymentId: payment.id, orderId, kind: 'capture', status: 'succeeded',
        amountMinor: opts.amountMinor ?? payment.amountMinor, providerTxnId: opts.providerPaymentId ?? null,
      });
    }

    await tx.update(orders).set({ paymentStatus: 'paid', version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.paymentStatus, toStatus: 'paid', kind: 'payment' });

    // Advance the order into fulfillment and commit the reserved stock (the sale). A
    // cancelled order stays cancelled (its stock was already released).
    if (order.status === 'pending') {
      assertOrderTransition(order.status, 'preparing');
      await tx.update(orders).set({ status: 'preparing' }).where(eq(orders.id, orderId));
      await tx.insert(orderStatusHistory).values({ orderId, fromStatus: 'pending', toStatus: 'preparing', kind: 'order' });
    }
    if (!lateCapture) await commitReservationsForOrder(tx, orderId);
    return { captured: !lateCapture, userId: order.userId, orderNumber: order.orderNumber };
  });
  logger().info({ orderId }, 'payment confirmed');
  // A late capture on a cancelled order is an incident for staff (refund), not good news for the customer.
  if (outcome.captured) await notifyOrderEvent('payment_confirmed', { userId: outcome.userId, orderId, orderNumber: outcome.orderNumber });
}

/** Mark payment failed and release the held stock (§52 order-created-payment-failed). */
export async function markPaymentFailed(orderId: string, reason?: string): Promise<void> {
  await db().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.paymentStatus === 'paid') return;
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    if (payment && payment.status !== 'paid') {
      await tx.update(payments).set({ status: 'failed', failureReason: reason ?? null }).where(eq(payments.id, payment.id));
    }
    await tx.update(orders).set({ paymentStatus: 'failed' }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.paymentStatus, toStatus: 'failed', kind: 'payment' });
    await releaseReservationsForOrder(tx, orderId);
  });
}

/** Confirm a manual transfer within a staff-approval transaction (used by refunds/approval flows). */
export async function confirmWithinTx(tx: Transaction, orderId: string): Promise<void> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new BusinessRuleError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  if (order.paymentStatus === 'paid') return;
  if (order.status === 'cancelled' || order.paymentStatus === 'cancelled') {
    throw new BusinessRuleError({ code: 'ORDER_NOT_PAYABLE', message: { ar: 'لا يمكن تأكيد الدفع لطلب ملغي.', en: 'A cancelled order cannot have its payment confirmed.' } });
  }
  assertPaymentTransition(order.paymentStatus as PaymentState, 'paid');
  const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
  if (payment) await tx.update(payments).set({ status: 'paid', capturedAt: new Date(), version: sql`${payments.version} + 1` }).where(eq(payments.id, payment.id));
  await tx.update(orders).set({ paymentStatus: 'paid', version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
  await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.paymentStatus, toStatus: 'paid', kind: 'payment' });
  // Same fulfillment step the webhook path takes: a confirmed transfer moves the order
  // into preparation so the two capture paths leave the order in the same state.
  if (order.status === 'pending') {
    assertOrderTransition(order.status, 'preparing');
    await tx.update(orders).set({ status: 'preparing' }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: 'pending', toStatus: 'preparing', kind: 'order' });
  }
  await commitReservationsForOrder(tx, orderId);
}

export { resolveProviderKey };
