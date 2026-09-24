/**
 * Order-event notifications (§23): every order/payment transition writes an in-app row and
 * hands delivery to the processor, which is idempotent per channel. Runs the inline path
 * (the queue path is the same processor behind BullMQ).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { z } from 'zod';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import {
  users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryItems,
  payments, paymentTransactions, refunds, carts, cartItems, notifications, emailEvents,
} from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema } from '../checkout';
import { orderService } from '../orders';
import { refundService, refundSchema } from '../refunds';
import { paymentService, confirmManualPayment } from '../payments';
import { processNotificationPayload, type NotificationPayload } from '../../jobs/processors/notifications';

const registerRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: registerSchema, handler: ({ body, ctx }) => authService.register(body, ctx) });
const loginRoute = defineRoute({ method: 'POST', csrf: false, bodySchema: loginSchema, handler: ({ body, ctx }) => authService.login(body, ctx) });
const addRoute = defineRoute({ method: 'POST', csrf: false, auth: 'optional', bodySchema: addToCartSchema, handler: ({ body, ctx }) => cartService.addToCart(ctx, body.productId, body.quantity ?? 1) });
const clearRoute = defineRoute({ method: 'DELETE', csrf: false, auth: 'optional', handler: ({ ctx }) => cartService.clearCart(ctx) });
const checkoutRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', idempotent: { scope: 'checkout' }, bodySchema: checkoutSchema, successStatus: 201, handler: async ({ body, ctx }) => {
  const order = await checkoutService.placeOrder(ctx, body);
  const payment = await paymentService.initPayment(order.id);
  return { order, payment };
} });
const statusRoute = defineRoute({ method: 'PATCH', csrf: false, permission: { resource: 'orders', action: 'edit' }, paramsSchema: z.object({ id: z.string() }), bodySchema: z.object({ status: z.enum(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled']) }), handler: ({ params, body, ctx }) => orderService.updateOrderStatus(ctx, params.id, body.status) });
const cancelRoute = defineRoute({ method: 'POST', csrf: false, auth: 'required', paramsSchema: z.object({ id: z.string() }), handler: ({ params, ctx }) => orderService.cancelMyOrder(ctx, params.id) });
const confirmRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, paramsSchema: z.object({ orderId: z.string() }), handler: ({ params, ctx }) => confirmManualPayment(ctx, params.orderId) });
const refundRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, bodySchema: refundSchema, handler: ({ body, ctx }) => refundService.issueRefund(ctx, body) });

const PHONE = '01077665533';
const EMAIL = 'notify-test@ragab.sa';
const ADDR_ID = 'addr_notify_test';
let userId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function freshOrder(session: Record<string, string>, key: string): Promise<CallResult> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  await callRoute(addRoute, { method: 'POST', body: { productId: 'prod_rice', quantity: 1 }, cookies: session }); // 135 + 15 delivery = 150
  return callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': key }, body: { addressId: ADDR_ID, paymentMethod: 'cod' } });
}
async function advance(admin: Record<string, string>, id: string, status: string): Promise<CallResult> {
  return callRoute(statusRoute, { method: 'PATCH', cookies: admin, params: { id }, body: { status } });
}
/** In-app rows for this user mentioning an order number, newest last. */
async function inAppRows(orderNumber: string) {
  return db().select().from(notifications).where(and(eq(notifications.userId, userId), like(notifications.bodyAr, `%${orderNumber}%`))).orderBy(notifications.createdAt);
}
async function emailCount(template: string): Promise<number> {
  const rows = await db().select({ id: emailEvents.id }).from(emailEvents).where(and(eq(emailEvents.userId, userId), eq(emailEvents.template, template)));
  return rows.length;
}

describe('order-event notifications (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'مُخطَر', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    await db().update(users).set({ email: EMAIL }).where(eq(users.id, userId));
    await db().insert(addresses).values({ id: ADDR_ID, userId, title: 'المنزل', recipientName: 'مُخطَر', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 3', isDefault: true }).onConflictDoNothing();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('placing an order writes an in-app row and an order-confirmation email event for the customer', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const before = await emailCount('order_confirmation');
    const res = await freshOrder(session, 'nt-place');
    expect(res.status).toBe(201);
    const order = res.body.data.order;

    const rows = await inAppRows(order.orderNumber);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe('order');
    expect(rows[0]!.titleAr).toBe('تم استلام طلبك');
    expect(rows[0]!.href).toBe(`/account/orders/${order.id}`);
    expect(rows[0]!.read).toBe(false);

    expect(await emailCount('order_confirmation')).toBe(before + 1);
    const [evt] = await db().select().from(emailEvents).where(and(eq(emailEvents.userId, userId), eq(emailEvents.template, 'order_confirmation'))).orderBy(emailEvents.createdAt).limit(1);
    expect(evt!.toAddress).toBe(EMAIL);
    expect(['queued', 'sent']).toContain(evt!.status); // no SMTP in tests → recorded as queued, never silently dropped
  });

  it('each status change notifies once; a customer cancellation is a status notification too', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const order = (await freshOrder(session, 'nt-status')).body.data.order;
    const statusBefore = await emailCount('order_status');

    await advance(admin, order.id, 'preparing');
    let rows = await inAppRows(order.orderNumber);
    expect(rows.map((r) => r.titleAr)).toEqual(['تم استلام طلبك', 'جاري تجهيز طلبك']);
    expect(await emailCount('order_status')).toBe(statusBefore + 1);

    await advance(admin, order.id, 'on_the_way');
    rows = await inAppRows(order.orderNumber);
    expect(rows.at(-1)!.titleAr).toBe('طلبك في الطريق');

    const cancelled = (await freshOrder(session, 'nt-cancel')).body.data.order;
    const res = await callRoute(cancelRoute, { method: 'POST', cookies: session, params: { id: cancelled.id } });
    expect(res.status).toBe(200);
    const cancelRows = await inAppRows(cancelled.orderNumber);
    expect(cancelRows.at(-1)!.titleAr).toBe('تم إلغاء طلبك');
  });

  it('a replayed manual payment confirmation notifies the customer exactly once', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const order = (await freshOrder(session, 'nt-confirm')).body.data.order;
    const before = await emailCount('payment_confirmed');

    expect((await callRoute(confirmRoute, { method: 'POST', cookies: admin, params: { orderId: order.id } })).status).toBe(200);
    expect((await callRoute(confirmRoute, { method: 'POST', cookies: admin, params: { orderId: order.id } })).status).toBe(200);

    const rows = (await inAppRows(order.orderNumber)).filter((r) => r.titleAr === 'تم تأكيد الدفع');
    expect(rows).toHaveLength(1);
    expect(await emailCount('payment_confirmed')).toBe(before + 1);
  });

  it('a refund tells the customer the amount returned', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const order = (await freshOrder(session, 'nt-refund')).body.data.order;
    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    await advance(admin, order.id, 'delivered');
    const before = await emailCount('refund_issued');

    const res = await callRoute(refundRoute, { method: 'POST', cookies: admin, body: { orderId: order.id, reauthPassword: 'Admin@12345' } });
    expect(res.status).toBe(200);
    const row = (await inAppRows(order.orderNumber)).at(-1)!;
    expect(row.titleAr).toBe('تم إصدار استرداد');
    expect(row.bodyAr).toContain('150.00');
    expect(await emailCount('refund_issued')).toBe(before + 1);
  });

  it('the processor skips channels already delivered and records progress on the job (retry-safe)', async () => {
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, 'nt-idem')).body.data.order;
    const payload: NotificationPayload = { userId, template: 'order_confirmation', data: { orderId: order.id, orderNumber: order.orderNumber } };
    class FakeJob {
      constructor(public data: NotificationPayload) {}
      updateData = vi.fn(async (next: NotificationPayload) => {
        this.data = next;
      });
    }

    // A retry that already emailed + pushed must not email again.
    const before = await emailCount('order_confirmation');
    const done = new FakeJob({ ...payload, delivered: { email: true, push: true, sms: true } });
    await processNotificationPayload(done.data, done as unknown as Job);
    expect(await emailCount('order_confirmation')).toBe(before);

    // A fresh job emails once and marks the channel on the job before moving on.
    const fresh = new FakeJob(payload);
    await processNotificationPayload(fresh.data, fresh as unknown as Job);
    expect(await emailCount('order_confirmation')).toBe(before + 1);
    expect(fresh.updateData).toHaveBeenCalled();
    expect(fresh.data.delivered?.email).toBe(true);
    expect(fresh.data.delivered?.push).toBe(true);
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
        await tx.delete(refunds).where(inArray(refunds.orderId, oids));
        await tx.delete(paymentTransactions).where(inArray(paymentTransactions.orderId, oids));
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
