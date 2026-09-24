import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import { users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryItems, payments, paymentIntents, refunds, carts, cartItems } from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema } from '.';
import { orderService, updateDeliverySchema } from '../orders';
import { refundService, refundSchema } from '../refunds';
import { paymentService, confirmManualPayment } from '../payments';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });
const getOrderRoute = defineRoute({ method: 'GET', auth: 'required', paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => orderService.getOrder(ctx, params.id) });
const statusRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'orders', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: z.object({ status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']) }), handler: ({ params, body, ctx }) => orderService.updateOrderStatus(ctx, params.id, body.status) });
const refundRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, bodySchema: refundSchema, handler: ({ body, ctx }) => refundService.issueRefund(ctx, body) });
const cancelRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => orderService.cancelMyOrder(ctx, params.id) });
const confirmRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, paramsSchema: z.object({ orderId: z.string() }), handler: ({ params, ctx }) => confirmManualPayment(ctx, params.orderId) });

const PHONE = '01077665544';
const ADDR_ID = 'addr_checkout_test';
let userId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}

/** Clean cart, add lines, checkout COD; returns the created order DTO. */
async function freshOrder(session: Record<string, string>, lines: { productId: string; quantity: number }[], key: string): Promise<CallResult> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  for (const l of lines) await callRoute(addRoute, { method: 'POST', body: { productId: l.productId, quantity: l.quantity }, cookies: session });
  return callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': key }, body: { addressId: ADDR_ID, paymentMethod: 'cod' } });
}

async function onHand(productId: string): Promise<number> {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.productId, productId)).limit(1);
  return inv!.quantityOnHand;
}
async function reserved(productId: string): Promise<number> {
  const [inv] = await db().select().from(inventoryItems).where(eq(inventoryItems.productId, productId)).limit(1);
  return inv!.quantityReserved;
}
async function advance(admin: Record<string, string>, id: string, status: string): Promise<CallResult> {
  return callRoute(statusRoute, { method: 'PATCH', cookies: admin, params: { id }, body: { status } });
}

describe('checkout → order → payment → refund (integration, the money core)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'زبون', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    await db().insert(addresses).values({ id: ADDR_ID, userId, title: 'المنزل', recipientName: 'زبون', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 1', isDefault: true }).onConflictDoNothing();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('rejects client-injected money fields at checkout (strict schema, §8)', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    await callRoute(clearRoute, { method: 'DELETE', cookies: session });
    await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_oil', quantity: 2 }, cookies: session });
    const res = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'ck-strict' }, body: { addressId: ADDR_ID, paymentMethod: 'cod', total: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('checkout (COD) computes the total server-side and reserves stock', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const before = await reserved('prod_oil');
    const res = await freshOrder(session, [{ productId: 'prod_oil', quantity: 2 }], 'ck-cod'); // 2×95=190, +15 delivery
    expect(res.status).toBe(201);
    expect(res.body.data.order.subtotal).toBe(190);
    expect(res.body.data.order.deliveryFee).toBe(15);
    expect(res.body.data.order.total).toBe(205);
    expect(res.body.data.order.paymentStatus).toBe('pending');
    expect(await reserved('prod_oil')).toBe(before + 2);
  });

  it('is idempotent: same key + body → the SAME order, no duplicate', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    await callRoute(clearRoute, { method: 'DELETE', cookies: session });
    await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_rice', quantity: 1 }, cookies: session });
    const body = { addressId: ADDR_ID, paymentMethod: 'cod' as const };
    const first = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'ck-idem' }, body });
    const second = await callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': 'ck-idem' }, body });
    expect(first.status).toBe(201);
    expect(second.body.data.order.id).toBe(first.body.data.order.id);
    expect(second.raw.headers.get('idempotent-replay')).toBe('true');
  });

  it('enforces ownership (IDOR/BOLA): another customer gets 404, owner gets 200', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_oil', quantity: 1 }], 'ck-idor')).body.data.order;
    const attacker = await sessionFor('01011111111', 'Customer@123');
    const denied = await callRoute(getOrderRoute, { cookies: attacker, params: { id: order.id } });
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('ORDER_NOT_FOUND');
    const owner = await callRoute(getOrderRoute, { cookies: session, params: { id: order.id } });
    expect(owner.status).toBe(200);
  });

  it('admin delivery captures COD and commits reserved stock', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_oil', quantity: 3 }], 'ck-deliver')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const beforeOnHand = await onHand('prod_oil');
    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    const res = await advance(admin, order.id, 'delivered');
    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('paid');
    expect(await onHand('prod_oil')).toBe(beforeOnHand - 3); // stock committed (sale)
  });

  it('rejects an invalid transition delivered → preparing (§6)', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_oil', quantity: 1 }], 'ck-badtrans')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    await advance(admin, order.id, 'delivered');
    const res = await advance(admin, order.id, 'preparing');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('refund: requires re-auth, restocks on full refund, cannot exceed the payment (§18)', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_oil', quantity: 2 }], 'ck-refund')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    await advance(admin, order.id, 'delivered'); // now paid (COD)

    // Wrong re-auth password → rejected.
    const wrong = await callRoute(refundRoute, { method: 'POST', cookies: admin, body: { orderId: order.id, reauthPassword: 'nope' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('REAUTH_REQUIRED');

    const before = await onHand('prod_oil');
    const ok = await callRoute(refundRoute, { method: 'POST', cookies: admin, body: { orderId: order.id, reauthPassword: 'Admin@12345' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('succeeded');
    expect(await onHand('prod_oil')).toBe(before + 2); // restocked

    const [row] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(row!.paymentStatus).toBe('refunded');
    expect(row!.status).toBe('cancelled');

    // A second refund is rejected (nothing left to refund).
    const again = await callRoute(refundRoute, { method: 'POST', cookies: admin, body: { orderId: order.id, reauthPassword: 'Admin@12345' } });
    expect(again.status).toBe(422);
  });

  it('customer cancellation settles the payment too: order + payment → cancelled, stock released, survives a reload', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const before = await reserved('prod_rice');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 2 }], 'ck-cancel')).body.data.order;
    expect(await reserved('prod_rice')).toBe(before + 2);

    const res = await callRoute(cancelRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.paymentStatus).toBe('cancelled');

    // What a page reload sees — the server, not an optimistic local copy.
    const reloaded = await callRoute(getOrderRoute, { cookies: session, params: { id: order.id } });
    expect(reloaded.body.data.status).toBe('cancelled');
    const [pay] = await db().select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    expect(pay!.status).toBe('cancelled');
    expect(await reserved('prod_rice')).toBe(before);

    // Cancelling again is refused as a business rule (422), not a permission error.
    const twice = await callRoute(cancelRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    expect(twice.status).toBe(422);
    expect(twice.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('a cancelled order can never have its payment confirmed (422 ORDER_NOT_PAYABLE, nothing changes)', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 1 }], 'ck-cancel-confirm')).body.data.order;
    await callRoute(cancelRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const res = await callRoute(confirmRoute, { method: 'POST', cookies: admin, params: { orderId: order.id } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_NOT_PAYABLE');
    const [row] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(row!.paymentStatus).toBe('cancelled');
    expect(row!.status).toBe('cancelled');
  });

  it('manual confirmation advances the order, and a paid order cannot be cancelled without a refund', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 1 }], 'ck-paid-cancel')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const confirmed = await callRoute(confirmRoute, { method: 'POST', cookies: admin, params: { orderId: order.id } });
    expect(confirmed.status).toBe(200);
    // Same fulfillment step the webhook path takes.
    const [afterConfirm] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(afterConfirm!.paymentStatus).toBe('paid');
    expect(afterConfirm!.status).toBe('preparing');

    const res = await advance(admin, order.id, 'cancelled');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REFUND_REQUIRED_BEFORE_CANCEL');
    const [row] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(row!.status).toBe('preparing');
    expect(row!.paymentStatus).toBe('paid');
  });

  it('staff can correct the delivery snapshot before dispatch, never after', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 1 }], 'ck-delivery')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const deliveryRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'orders', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: updateDeliverySchema, handler: ({ params, body, ctx }) => orderService.updateOrderDelivery(ctx, params.id, body) });
    const patch = { recipientName: 'زبون (مصحح)', phone: '01077665544', village: 'كفر العزازي', streetAddress: 'شارع 9' };

    const ok = await callRoute(deliveryRoute, { method: 'PATCH', cookies: admin, params: { id: order.id }, body: patch });
    expect(ok.status).toBe(200);
    expect(ok.body.data.deliveryAddress.village).toBe('كفر العزازي');
    expect(ok.body.data.deliveryAddress.recipientName).toBe('زبون (مصحح)');

    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    const late = await callRoute(deliveryRoute, { method: 'PATCH', cookies: admin, params: { id: order.id }, body: { ...patch, village: 'قرية الخيس' } });
    expect(late.status).toBe(422);
    expect(late.body.error.code).toBe('ORDER_NOT_EDITABLE');
    const [row] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect((row!.deliveryAddress as { village: string }).village).toBe('كفر العزازي'); // unchanged
  });

  it('initPayment is idempotent: a retried checkout leaves exactly one payment row', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 1 }], 'ck-one-payment')).body.data.order;
    await paymentService.initPayment(order.id);
    await paymentService.initPayment(order.id);
    const rows = await db().select().from(payments).where(eq(payments.orderId, order.id));
    expect(rows.length).toBe(1);
  });

  it('a capture whose amount differs from the order total is never marked paid', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, [{ productId: 'prod_rice', quantity: 1 }], 'ck-amount')).body.data.order;
    await expect(paymentService.confirmPaymentSucceeded(order.id, { amountMinor: 1 })).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    const [row] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(row!.paymentStatus).toBe('pending');
  });

  const paymentRoute = defineRoute({ method: 'GET', auth: 'required', paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => orderService.getPaymentStep(ctx, params.id) });
  const codRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => orderService.switchPaymentToCod(ctx, params.id) });
  async function onlineOrder(session: Record<string, string>, key: string): Promise<CallResult> {
    await callRoute(clearRoute, { method: 'DELETE', cookies: session });
    await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_rice', quantity: 1 }, cookies: session });
    return callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': key }, body: { addressId: ADDR_ID, paymentMethod: 'vodafone_cash' } });
  }

  it('the payment step is replayable, and an unpaid online order can fall back to cash on delivery — until money is captured', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const placed = await onlineOrder(session, 'ck-cod-switch');
    expect(placed.status).toBe(201);
    const order = placed.body.data.order;
    expect(placed.body.data.payment.instructions).toBeTruthy(); // manual transfer (Paymob not configured here)

    // Same step again after a "reload" — same instructions, no second intent/payment.
    const replay = await callRoute(paymentRoute, { cookies: session, params: { id: order.id } });
    expect(replay.status).toBe(200);
    expect(replay.body.data.paymentMethod).toBe('vodafone_cash');
    expect(replay.body.data.instructions.ar).toBe(placed.body.data.payment.instructions.ar);
    expect((await db().select().from(payments).where(eq(payments.orderId, order.id))).length).toBe(1);

    // Ownership: another customer gets 404, not a switched order.
    const attacker = await sessionFor('01011111111', 'Customer@123');
    expect((await callRoute(codRoute, { method: 'POST', cookies: attacker, params: { id: order.id } })).status).toBe(404);

    const held = await reserved('prod_rice');
    const switched = await callRoute(codRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    expect(switched.status).toBe(200);
    expect(switched.body.data.paymentMethod).toBe('cod');
    expect(switched.body.data.paymentStatus).toBe('pending');
    expect(await reserved('prod_rice')).toBe(held); // nothing was released — still held for the courier
    const [pay] = await db().select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    expect(pay!.method).toBe('cod');
    expect(pay!.provider).toBe('cod');
    const intents = await db().select().from(paymentIntents).where(eq(paymentIntents.orderId, order.id));
    expect(intents.length).toBeGreaterThan(0);
    expect(intents.every((i) => i.status === 'cancelled')).toBe(true);
    expect((await callRoute(paymentRoute, { cookies: session, params: { id: order.id } })).body.data.paymentMethod).toBe('cod');

    // Captured money locks the method and ends the payment step.
    const paidOrder = (await onlineOrder(session, 'ck-cod-locked')).body.data.order;
    const admin = await sessionFor('01000000000', 'Admin@12345');
    expect((await callRoute(confirmRoute, { method: 'POST', cookies: admin, params: { orderId: paidOrder.id } })).status).toBe(200);
    const locked = await callRoute(codRoute, { method: 'POST', cookies: session, params: { id: paidOrder.id } });
    expect(locked.status).toBe(422);
    expect(locked.body.error.code).toBe('PAYMENT_METHOD_LOCKED');
    const noStep = await callRoute(paymentRoute, { cookies: session, params: { id: paidOrder.id } });
    expect(noStep.status).toBe(422);
    expect(noStep.body.error.code).toBe('ORDER_NOT_PAYABLE');
  });

  it('after a FAILED online payment, switching to cash on delivery re-holds the stock', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await onlineOrder(session, 'ck-cod-after-fail')).body.data.order;
    const held = await reserved('prod_rice');
    await paymentService.markPaymentFailed(order.id, 'declined');
    expect(await reserved('prod_rice')).toBe(held - 1); // failure released the hold

    const switched = await callRoute(codRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    expect(switched.status).toBe(200);
    expect(switched.body.data.paymentStatus).toBe('pending');
    expect(await reserved('prod_rice')).toBe(held); // re-reserved for the courier
    const hist = await db().select().from(orderStatusHistory).where(and(eq(orderStatusHistory.orderId, order.id), eq(orderStatusHistory.kind, 'payment')));
    expect(hist.some((h) => h.fromStatus === 'failed' && h.toStatus === 'pending')).toBe(true);
  });
});

async function cleanup() {
  const rows = await db().select({ id: users.id }).from(users).where(inArray(users.phone, [PHONE]));
  const ids = rows.map((r) => r.id);
  await withTriggersDisabled(async (tx) => {
    if (ids.length) {
      const os = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
      const oids = os.map((o: { id: string }) => o.id);
      if (oids.length) {
        await tx.delete(refunds).where(inArray(refunds.orderId, oids));
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
    await tx.delete(stockMovements).where(inArray(stockMovements.productId, ['prod_oil', 'prod_rice']));
    await tx.update(inventoryItems).set({ quantityOnHand: 45, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_oil'));
    await tx.update(inventoryItems).set({ quantityOnHand: 60, quantityReserved: 0 }).where(eq(inventoryItems.productId, 'prod_rice'));
  });
}
