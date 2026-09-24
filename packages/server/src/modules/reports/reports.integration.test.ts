import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { defineRoute } from '../../http/handler';
import { callRoute, type CallResult } from '../../test/http';
import { withTriggersDisabled } from '../../test/db';
import { db, closeDb } from '../../db/client';
import { users, addresses, orders, orderItems, orderStatusHistory, stockReservations, stockMovements, inventoryItems, payments, refunds, carts, cartItems } from '../../db/schema';
import { SESSION_COOKIE } from '../../security/session';
import { authService, registerSchema, loginSchema } from '../auth';
import { cartService, addToCartSchema } from '../cart';
import { checkoutService, checkoutSchema } from '../checkout';
import { orderService } from '../orders';
import { refundService, refundSchema } from '../refunds';
import { paymentService } from '../payments';
import { reportService } from '.';

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
const refundRoute = defineRoute({ method: 'POST', csrf: false, permission: { resource: 'payments', action: 'approve' }, bodySchema: refundSchema, handler: ({ body, ctx }) => refundService.issueRefund(ctx, body) });

const PHONE = '01077665599';
const ADDR_ID = 'addr_reports_test';
let userId = '';

async function sessionFor(phone: string, password: string): Promise<Record<string, string>> {
  const res = await callRoute(loginRoute, { method: 'POST', body: { identifier: phone, password } });
  return { [SESSION_COOKIE]: res.cookies[SESSION_COOKIE]! };
}
async function freshOrder(session: Record<string, string>, productId: string, quantity: number, key: string): Promise<CallResult> {
  await callRoute(clearRoute, { method: 'DELETE', cookies: session });
  await callRoute(addRoute, { method: 'POST', body: { productId, quantity }, cookies: session });
  return callRoute(checkoutRoute, { method: 'POST', cookies: session, headers: { 'idempotency-key': key }, body: { addressId: ADDR_ID, paymentMethod: 'cod' } });
}
async function advance(admin: Record<string, string>, id: string, status: string): Promise<CallResult> {
  return callRoute(statusRoute, { method: 'PATCH', cookies: admin, params: { id }, body: { status } });
}
const oilQty = (r: Awaited<ReturnType<typeof reportService.salesReport>>) => r.topProducts.find((p) => p.productId === 'prod_oil')?.quantity ?? 0;

describe('sales report — one financial truth (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const reg = await callRoute(registerRoute, { method: 'POST', body: { name: 'تقارير', phone: PHONE, password: 'Secret@123', defaultVillage: 'عليم' } });
    userId = reg.body.data.id;
    await db().insert(addresses).values({ id: ADDR_ID, userId, title: 'المنزل', recipientName: 'تقارير', phone: PHONE, village: 'قرية عليم', streetAddress: 'شارع 2', isDefault: true }).onConflictDoNothing();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('a captured then fully refunded order: gross counts it, refunds count it, net returns to where it was — never negative', async () => {
    const before = await reportService.salesReport();
    const session = await sessionFor(PHONE, 'Secret@123');
    const admin = await sessionFor('01000000000', 'Admin@12345');
    const order = (await freshOrder(session, 'prod_oil', 2, 'rp-refund')).body.data.order; // 2×95 + 15 = 205
    await advance(admin, order.id, 'preparing');
    await advance(admin, order.id, 'on_the_way');
    await advance(admin, order.id, 'delivered'); // COD captured

    const paid = await reportService.salesReport();
    expect(paid.salesTotal).toBeCloseTo(before.salesTotal + order.total, 2);
    expect(paid.totalOrders).toBe(before.totalOrders + 1);
    expect(paid.collected.gross).toBeCloseTo(before.collected.gross + order.total, 2);
    expect(paid.collected.net).toBeCloseTo(before.collected.net + order.total, 2);
    expect(oilQty(paid)).toBe(oilQty(before) + 2);
    expect(paid.byCategory.find((c) => c.nameAr === 'الصيدلية والتموين')).toBeTruthy(); // a real name, never "—"

    const res = await callRoute(refundRoute, { method: 'POST', cookies: admin, body: { orderId: order.id, reauthPassword: 'Admin@12345' } });
    expect(res.status).toBe(200);

    const refunded = await reportService.salesReport();
    expect(refunded.collected.gross).toBeCloseTo(before.collected.gross + order.total, 2); // money WAS collected
    expect(refunded.collected.refunded).toBeCloseTo(before.collected.refunded + order.total, 2); // …and given back
    expect(refunded.collected.net).toBeCloseTo(before.collected.net, 2); // so net is unchanged, not −205
    expect(refunded.collected.net).toBeGreaterThanOrEqual(0);
    // A full refund cancels the order → it leaves booked sales and the best-sellers.
    expect(refunded.salesTotal).toBeCloseTo(before.salesTotal, 2);
    expect(refunded.totalOrders).toBe(before.totalOrders);
    expect(refunded.cancelledOrders).toBe(before.cancelledOrders + 1);
    expect(oilQty(refunded)).toBe(oilQty(before));
    expect(refunded.totalRevenue).toBe(refunded.collected.gross); // legacy alias
  });

  it('a customer-cancelled (never paid) order touches nothing financial', async () => {
    const before = await reportService.salesReport();
    const session = await sessionFor(PHONE, 'Secret@123');
    const order = (await freshOrder(session, 'prod_rice', 1, 'rp-cancel')).body.data.order;
    await callRoute(cancelRoute, { method: 'POST', cookies: session, params: { id: order.id } });
    const after = await reportService.salesReport();
    expect(after.salesTotal).toBeCloseTo(before.salesTotal, 2);
    expect(after.totalOrders).toBe(before.totalOrders);
    expect(after.collected).toEqual(before.collected);
    expect(after.cancelledOrders).toBe(before.cancelledOrders + 1);
    expect(after.byStatus.find((s) => s.status === 'cancelled')!.count).toBe(before.byStatus.find((s) => s.status === 'cancelled')!.count + 1);
  });

  it('the payments summary is the same numbers the report carries', async () => {
    const [report, summary] = await Promise.all([reportService.salesReport(), reportService.collectedTotals()]);
    expect(summary).toEqual(report.collected);
  });

  it('a date range in the future is simply empty (and from > to is the caller\'s mistake, not a crash)', async () => {
    const future = await reportService.salesReport({ from: new Date(Date.now() + 86_400_000) });
    expect(future.totalOrders).toBe(0);
    expect(future.salesTotal).toBe(0);
    expect(future.collected.net).toBe(0);
    expect(future.byStatus.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
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
