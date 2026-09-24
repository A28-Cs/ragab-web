/**
 * Payment reconciliation (§20, §52): intents whose webhook never arrived are asked about
 * at the provider; only a definitive answer changes state, and a success runs the same
 * capture path as the webhook (amount check included).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import {
  users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryItems,
  payments, paymentIntents, paymentTransactions, carts, cartItems, notifications, emailEvents,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema } from '../checkout';
import { paymentService } from '.';
import type { ParsedPaymentEvent } from './provider';
import { reconcilePaymentsJob, PAYMENT_STUCK_AFTER_MS } from '../../jobs/processors/maintenance';
import { prefixedId } from '../../lib/ids';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });

const PHONE = '01077665522';
const ADDR_ID = 'addr_reconcile_test';
let userId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function freshOrder(session: Record<string, string>, key: string): Promise<CallResult> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_rice', quantity: 1 }, cookies: session }); // 135 + 15 = 150 → 15000 minor
  return callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': key }, body: { addressId: ADDR_ID, paymentMethod: 'vodafone_cash' } });
}
/** A Paymob intent the customer was redirected to `ageMs` ago and never came back from. */
async function stuckPaymobIntent(orderId: string, amountMinor: number, ageMs: number): Promise<string> {
  const id = prefixedId('pi');
  await db().insert(paymentIntents).values({
    id, orderId, provider: 'paymob', method: 'vodafone_cash', status: 'requires_action', amountMinor, currency: 'EGP',
    providerIntentId: `pmb_${id}`, idempotencyKey: `${orderId}:paymob`, createdAt: new Date(Date.now() - ageMs),
  });
  return id;
}
const succeeded = (amountMinor: number, txId = '777001'): ParsedPaymentEvent => ({ providerEventId: txId, eventType: 'transaction_inquiry', outcome: 'succeeded', providerPaymentId: txId, amountMinor, raw: {} });
const failed = (): ParsedPaymentEvent => ({ providerEventId: '777002', eventType: 'transaction_inquiry', outcome: 'failed', providerPaymentId: '777002', raw: {} });

async function orderRow(id: string) {
  const [row] = await db().select().from(orders).where(eq(orders.id, id)).limit(1);
  return row!;
}
async function reserved(productId: string): Promise<number> {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.productId, productId)).limit(1);
  return inv!.quantityReserved;
}

describe('payment reconciliation job (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'مُسوّى', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    await db().insert(addresses).values({ id: ADDR_ID, userId, title: 'المنزل', recipientName: 'مُسوّى', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 5', isDefault: true }).onConflictDoNothing();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('leaves a young intent alone, then captures a stuck one through the webhook path', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, 'rc-capture')).body.data.order;
    const intentId = await stuckPaymobIntent(order.id, 15_000, PAYMENT_STUCK_AFTER_MS + 60_000);
    const inquire = vi.fn(async () => succeeded(15_000));

    // Not yet stuck from the sweep's point of view → not even asked about.
    const early = await reconcilePaymentsJob({ inquire, now: new Date(Date.now() - PAYMENT_STUCK_AFTER_MS) });
    expect(early.checked).toBe(0);
    expect(inquire).not.toHaveBeenCalled();

    const sweep = await reconcilePaymentsJob({ inquire });
    expect(sweep).toMatchObject({ captured: 1, failed: 0, unresolved: 0 });
    expect(inquire).toHaveBeenCalledWith('paymob', order.id);

    const row = await orderRow(order.id);
    expect(row.paymentStatus).toBe('paid');
    expect(row.status).toBe('preparing');
    const [pay] = await db().select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    expect(pay!.status).toBe('paid');
    expect(pay!.providerPaymentId).toBe('777001');
    const [intent] = await db().select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
    expect(intent!.status).toBe('succeeded');
    // The customer hears about it exactly as they would from the webhook.
    const notes = await db().select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.titleAr, 'تم تأكيد الدفع')));
    expect(notes.length).toBe(1);

    // A second sweep finds nothing to do.
    const again = await reconcilePaymentsJob({ inquire });
    expect(again.checked).toBe(0);
  });

  it('refuses a success whose amount differs from the order total and leaves it for a human', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, 'rc-mismatch')).body.data.order;
    const intentId = await stuckPaymobIntent(order.id, 15_000, PAYMENT_STUCK_AFTER_MS + 60_000);

    const sweep = await reconcilePaymentsJob({ inquire: async () => succeeded(100, '777009') });
    expect(sweep).toMatchObject({ checked: 1, captured: 0, unresolved: 1 });
    const row = await orderRow(order.id);
    expect(row.paymentStatus).toBe('pending');
    expect(row.status).toBe('pending');

    // It stays in every sweep until a human settles it — simulate that so later tests are isolated.
    expect((await reconcilePaymentsJob({ inquire: async () => succeeded(100, '777009') })).unresolved).toBe(1);
    await db().update(paymentIntents).set({ status: 'cancelled' }).where(eq(paymentIntents.id, intentId));
  });

  it('a provider-reported failure releases the held stock; no answer changes nothing', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const before = await reserved('prod_rice');
    const failing = (await freshOrder(session, 'rc-failed')).body.data.order;
    const silent = (await freshOrder(session, 'rc-silent')).body.data.order;
    expect(await reserved('prod_rice')).toBe(before + 2);
    await stuckPaymobIntent(failing.id, 15_000, PAYMENT_STUCK_AFTER_MS + 60_000);
    await stuckPaymobIntent(silent.id, 15_000, PAYMENT_STUCK_AFTER_MS + 60_000);

    const sweep = await reconcilePaymentsJob({ inquire: async (_p, orderId) => (orderId === failing.id ? failed() : null) });
    expect(sweep).toMatchObject({ checked: 2, failed: 1, unresolved: 1 });

    expect((await orderRow(failing.id)).paymentStatus).toBe('failed');
    expect((await orderRow(silent.id)).paymentStatus).toBe('pending');
    expect(await reserved('prod_rice')).toBe(before + 1); // only the failed order's reservation was released
  });
});

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      await tx.delete(notifications).where(inArray(notifications.userId, ids));
      await tx.delete(emailEvents).where(inArray(emailEvents.userId, ids));
      const os = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
      const oids = os.map((o: { id: string }) => o.id);
      if (oids.length) {
        await tx.delete(paymentTransactions).where(inArray(paymentTransactions.orderId, oids));
        await tx.delete(paymentIntents).where(inArray(paymentIntents.orderId, oids));
        await tx.delete(payments).where(inArray(payments.orderId, oids));
        await tx.delete(stockReservations).where(inArray(stockReservations.orderId, oids));
        await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, oids));
        await tx.delete(orderItems).where(inArray(orderItems.orderId, oids));
        await tx.delete(orders).where(inArray(orders.id, oids));
      }
      const cs = await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, ids));
      const cids = cs.map((c: { id: string }) => c.id);
      if (cids.length) await tx.delete(cartItems).where(inArray(cartItems.cartId, cids));
      await tx.delete(carts).where(inArray(carts.userId, ids));
      await tx.delete(addresses).where(inArray(addresses.userId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    }
    await tx.delete(stockMovements).where(inArray(stockMovements.productId, ['prod_rice']));
    await tx.update(inventoryItems).set({ quantityOnHand: 60, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_rice'));
  });
}
