/**
 * Orders service (§11 ownership, §6 lifecycle). Read scoping is the IDOR/BOLA defense:
 * a customer sees ONLY their own orders (WHERE user_id = me); staff with orders:view
 * see all. getOrderById enforces the same rule — a customer requesting another user's
 * order id gets 404 (not 403, to avoid confirming existence). Status changes go through
 * the state machine and append to the append-only history.
 */
import { and, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { db } from '../../db/client';
import { orders, orderItems, orderStatusHistory, payments, paymentIntents, shipments, users } from '../../db/schema';
import { AuthenticationError, AuthorizationError, BusinessRuleError, NotFoundError } from '../../lib/errors';
import { buildPage, decodeCursor, type Page } from '../../lib/pagination';
import { prefixedId } from '../../lib/ids';
import type { RequestContext } from '../../http/context';
import { can } from '../../security/permissions';
import { logAudit } from '../audit';
import { notifyOrderEvent } from '../notifications/dispatch';
import { pushOrderToEngezny, buildEngeznyOrderText, type EngeznyOrderPayload } from './engezny';
import { logger } from '../../lib/logger';
import { assertOrderTransition, assertPaymentTransition, type PaymentState } from './stateMachine';
import { releaseReservationsForOrder, commitReservationsForOrder, reserveStock } from '../inventory/service';
import { getSettings } from '../settings/service';
import { initPayment, type InitPaymentResult } from '../payments/service';
import { toOrderDto } from './mapper';
import type { AdminOrderDetail, Order, OrderStatus } from '../../types';

async function loadOrderWithItems(orderId: string, exec: DbExecutor = db()): Promise<Order | null> {
  const [order] = await exec.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await exec.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return toOrderDto(order, items);
}

/** Customer order list — scoped to the caller. Staff use the admin list instead. */
export async function getMyOrders(ctx: RequestContext, opts: { limit: number; cursor?: string }): Promise<Page<Order>> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  const conds = [eq(orders.userId, ctx.principal.userId)];
  const cursor = decodeCursor(opts.cursor);
  if (cursor) conds.push(lt(orders.id, cursor));

  const rows = await db().select().from(orders).where(and(...conds)).orderBy(desc(orders.id)).limit(opts.limit + 1);
  const page = buildPage(rows, opts.limit, (r) => r.id);
  const dtos = await attachItems(page.items);
  return { items: dtos, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

/** Admin order list — requires orders:view; optional status filter. */
export async function listAllOrders(
  ctx: RequestContext,
  opts: { limit: number; cursor?: string; status?: OrderStatus; q?: string },
): Promise<Page<Order>> {
  requireOrdersView(ctx);
  // Filters (shared by the page and the count) vs. the cursor (page only).
  const filters: SQL[] = [];
  if (opts.status) filters.push(eq(orders.status, opts.status));
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\%_]/g, '\$&')}%`;
    filters.push(
      sql`(${orders.orderNumber} ILIKE ${like} OR ${orders.deliveryAddress}->>'recipientName' ILIKE ${like} OR ${orders.deliveryAddress}->>'phone' ILIKE ${like})`,
    );
  }
  const conds = [...filters];
  const cursor = decodeCursor(opts.cursor);
  if (cursor) conds.push(lt(orders.id, cursor));

  const [rows, counted] = await Promise.all([
    db()
      .select()
      .from(orders)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(orders.id))
      .limit(opts.limit + 1),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(filters.length ? and(...filters) : undefined),
  ]);
  const page = buildPage(rows, opts.limit, (r) => r.id);
  const dtos = await attachItems(page.items);
  return { items: dtos, nextCursor: page.nextCursor, hasMore: page.hasMore, total: counted[0]?.count ?? 0 };
}

/**
 * Fetch one order by id or order number. Ownership enforced: a non-staff caller may
 * only read their own order; anyone else gets NOT_FOUND (no existence disclosure).
 */
export async function getOrder(ctx: RequestContext, idOrNumber: string): Promise<Order> {
  let [order] = await db()
    .select()
    .from(orders)
    .where(sql`${orders.id} = ${idOrNumber} OR ${orders.orderNumber} = ${idOrNumber}`)
    .limit(1);
  const notFound = new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  if (!order) throw notFound;

  if (order.status === 'preparing' || order.status === 'on_the_way') {
    try {
      const { syncOrderWithEngezny } = await import('./engezny-sync');
      const changed = await syncOrderWithEngezny(order.id);
      if (changed) {
        const [fresh] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
        if (fresh) order = fresh;
      }
    } catch {
      // ignore sync errors during read
    }
  }

  const isOwner = ctx.principal?.userId === order.userId;
  const isStaffViewer = ctx.principal?.isStaff && can(ctx.principal.permissions, 'orders', 'view');
  if (!isOwner && !isStaffViewer) throw notFound; // 404, not 403 — do not confirm it exists

  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return toOrderDto(order, items);
}

/**
 * Full order detail for staff (admin order-detail screen): items, the customer's house
 * photo (from their profile, if they placed the order signed in and uploaded one), and
 * whichever courier is currently assigned via `shipments`. Requires orders:view.
 */
export async function getOrderDetailForStaff(ctx: RequestContext, idOrNumber: string): Promise<AdminOrderDetail> {
  requireOrdersView(ctx);
  let [order] = await db()
    .select()
    .from(orders)
    .where(sql`${orders.id} = ${idOrNumber} OR ${orders.orderNumber} = ${idOrNumber}`)
    .limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });

  if (order.status === 'preparing' || order.status === 'on_the_way') {
    try {
      const { syncOrderWithEngezny } = await import('./engezny-sync');
      const changed = await syncOrderWithEngezny(order.id);
      if (changed) {
        const [fresh] = await db().select().from(orders).where(eq(orders.id, order.id)).limit(1);
        if (fresh) order = fresh;
      }
    } catch {
      // ignore sync errors during read
    }
  }

  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const dto: AdminOrderDetail = toOrderDto(order, items);

  if (order.userId) {
    const [customer] = await db().select({ houseImage: users.houseImage }).from(users).where(eq(users.id, order.userId)).limit(1);
    dto.customerHouseImage = customer?.houseImage ?? undefined;
  }
  const [shipment] = await db().select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.createdAt)).limit(1);
  if (shipment && (shipment.driverName || shipment.driverPhone)) {
    dto.courier = { driverName: shipment.driverName ?? '', driverPhone: shipment.driverPhone ?? '', status: shipment.status };
  }
  return dto;
}

/**
 * Assign (or reassign) the courier delivering an order — upserts the `shipments` row by
 * order id. There is no driver-account system; the store owner just records who they
 * handed the order to and that person's phone number. Requires orders:edit.
 */
export async function assignCourier(
  ctx: RequestContext,
  orderId: string,
  input: { driverName: string; driverPhone: string },
): Promise<AdminOrderDetail> {
  requireOrdersPermission(ctx, 'edit');
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });

  const [existing] = await db().select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(desc(shipments.createdAt)).limit(1);
  if (existing) {
    await db()
      .update(shipments)
      .set({
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        status: existing.status === 'pending' ? 'assigned' : existing.status,
      })
      .where(eq(shipments.id, existing.id));
  } else {
    await db().insert(shipments).values({
      id: prefixedId('ship'), orderId, driverName: input.driverName, driverPhone: input.driverPhone, status: 'assigned',
    });
  }
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId,
    target: order.orderNumber, metadata: { op: 'courier_assigned', driverName: input.driverName }, requestId: ctx.requestId,
  });
  return getOrderDetailForStaff(ctx, orderId);
}

/**
 * Advance order status (admin). Guarded by the state machine + permission. Reaching
 * 'delivered' commits reservations (the sale); 'cancelled' releases them.
 */
export async function updateOrderStatus(ctx: RequestContext, orderId: string, to: OrderStatus): Promise<Order> {
  // 'delivered'/reversal is treated as approve; other transitions as edit (matches prototype).
  const action = to === 'delivered' ? 'approve' : 'edit';
  requireOrdersPermission(ctx, action);

  const { row: updated, changed } = await db().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
    assertOrderTransition(order.status, to);
    if (order.status === to) return { row: order, changed: false };

    await tx.update(orders).set({ status: to, version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: to, kind: 'order', actorId: ctx.principal?.userId });

    if (to === 'delivered') {
      await commitReservationsForOrder(tx, orderId);
      // COD is captured at delivery: mark BOTH the order and the payment row paid.
      if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
        await tx.update(orders).set({ paymentStatus: 'paid' }).where(eq(orders.id, orderId));
        await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.paymentStatus, toStatus: 'paid', kind: 'payment', actorId: ctx.principal?.userId });
        const [pay] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
        if (pay && pay.status !== 'paid') {
          await tx.update(payments).set({ status: 'paid', capturedAt: new Date() }).where(eq(payments.id, pay.id));
        }
      }
    } else if (to === 'cancelled') {
      await cancelPaymentWithinTx(tx, order, ctx.principal?.userId);
      await releaseReservationsForOrder(tx, orderId);
    }
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return { row: fresh!, changed: true };
  });

  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId,
    target: updated.orderNumber, metadata: { to }, requestId: ctx.requestId,
  });
  // Only a real transition notifies — a repeated request for the same status is a no-op.
  if (changed) {
    await notifyOrderEvent('order_status', { userId: updated.userId, orderId, orderNumber: updated.orderNumber, status: to });

    const { publishEvent } = await import('../../lib/events');
    await publishEvent('admin_orders', {
      event: 'order.status_updated',
      topic: 'admin_orders',
      eventId: prefixedId('evt'),
      timestamp: new Date().toISOString(),
      version: Date.now(),
      data: {
        orderId,
        orderNumber: updated.orderNumber,
        status: to,
        updatedBy: ctx.principal?.userId,
      }
    });

    // Sync to Engezny (only if we are moving past pending)
    if (to !== 'pending') {
      try {
        const items = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const address = updated.deliveryAddress as any;
        const addressText = `${address.village}, ${address.streetAddress}${address.landmark ? ', ' + address.landmark : ''}`;
        
        let engeznyStatus: 'pending' | 'accepted' | 'purchased' | 'delivered' | 'cancelled' = 'pending';
        if (to === 'preparing') engeznyStatus = 'pending';
        else if (to === 'on_the_way') engeznyStatus = 'accepted'; // Ragab skips 'purchased' step in Engezny
        else if (to === 'delivered') engeznyStatus = 'delivered';
        else if (to === 'cancelled') engeznyStatus = 'cancelled';

        const payload: Partial<EngeznyOrderPayload> = {
          status: engeznyStatus,
          customerId: updated.userId,
          storeId: updated.storeId,
          orderText: buildEngeznyOrderText(updated.orderNumber, items),
          deliveryAddressText: addressText,
          totalItemsPrice: updated.subtotalMinor / 100,
          deliveryFee: updated.deliveryFeeMinor / 100,
          qrCodeString: orderId,
          ragabOrderId: orderId,
          customerPhone: address.phone
        };
        // Only set workerId to null when initializing a new order, so we don't overwrite it
        if (to === 'preparing') payload.workerId = null;

        await pushOrderToEngezny(orderId, payload);
      } catch (e) {
        logger().error({ err: e, orderId }, 'Failed to trigger Engezny sync during status update');
      }
    }
  }

  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return toOrderDto(updated, items);
}

/**
 * Customer-initiated cancellation — only their own order, only while still pending.
 * The pending payment is cancelled with it so nothing downstream can "confirm" money
 * for a sale that no longer exists; a paid order must be refunded by staff instead.
 */
export async function cancelMyOrder(ctx: RequestContext, orderId: string): Promise<Order> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const notFound = new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  if (!order) throw notFound;
  if (order.userId !== ctx.principal.userId) throw notFound;
  if (order.status !== 'pending') {
    throw new BusinessRuleError({ code: 'ORDER_NOT_CANCELLABLE', message: { ar: 'لا يمكن إلغاء الطلب في حالته الحالية.', en: 'This order can no longer be cancelled.' }, meta: { status: order.status } });
  }
  const result = await db().transaction(async (tx) => {
    assertOrderTransition(order.status, 'cancelled');
    await cancelPaymentWithinTx(tx, order, ctx.principal!.userId);
    await tx.update(orders).set({ status: 'cancelled', version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: 'cancelled', kind: 'order', actorId: ctx.principal!.userId });
    await releaseReservationsForOrder(tx, orderId);
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return toOrderDto(fresh!, items);
  });
  await logAudit({
    actorId: ctx.principal.userId, actorName: ctx.principal.user.name, actorRole: 'customer',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId,
    target: order.orderNumber, metadata: { to: 'cancelled', by: 'customer' }, requestId: ctx.requestId,
  });
  await notifyOrderEvent('order_status', { userId: order.userId, orderId, orderNumber: order.orderNumber, status: 'cancelled' });
  return result;
}

/**
 * Cancelling an order settles its payment dimension in the same transaction:
 *   - nothing captured yet (pending/authorized/failed) → payment becomes `cancelled`
 *   - money captured (paid / partially refunded)       → refuse; staff must refund first
 * so an order can never be "cancelled" while the store still holds the customer's money.
 */
async function cancelPaymentWithinTx(tx: DbExecutor, order: typeof orders.$inferSelect, actorId?: string | null): Promise<void> {
  const from = order.paymentStatus as PaymentState;
  if (from === 'cancelled' || from === 'refunded') return;
  if (from === 'paid' || from === 'partially_refunded') {
    throw new BusinessRuleError({
      code: 'REFUND_REQUIRED_BEFORE_CANCEL',
      message: { ar: 'هذا الطلب مدفوع؛ يجب إصدار استرداد قبل إلغائه.', en: 'This order is paid; issue a refund before cancelling it.' },
      meta: { paymentStatus: from },
    });
  }
  assertPaymentTransition(from, 'cancelled');
  await tx.update(orders).set({ paymentStatus: 'cancelled' }).where(eq(orders.id, order.id));
  await tx.update(payments).set({ status: 'cancelled', version: sql`${payments.version} + 1` }).where(and(eq(payments.orderId, order.id), inArray(payments.status, ['pending', 'authorized', 'failed'])));
  await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: from, toStatus: 'cancelled', kind: 'payment', actorId: actorId ?? null });
}

/**
 * Staff correction of the delivery snapshot (wrong phone, typo in the street) — allowed
 * only while the order can still be redirected (pending / preparing). The snapshot is
 * replaced as a whole and the change is audited; the customer's saved address is not
 * touched (the order's address is a historical record, §28).
 */
export async function updateOrderDelivery(
  ctx: RequestContext,
  orderId: string,
  address: { recipientName: string; phone: string; village: string; streetAddress: string; landmark?: string; notes?: string },
): Promise<Order> {
  requireOrdersPermission(ctx, 'edit');
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  if (order.status !== 'pending' && order.status !== 'preparing') {
    throw new BusinessRuleError({
      code: 'ORDER_NOT_EDITABLE',
      message: { ar: 'لا يمكن تعديل عنوان طلب خرج للتوصيل أو انتهى.', en: 'The address of a dispatched or finished order cannot be changed.' },
      meta: { status: order.status },
    });
  }
  const previous = (order.deliveryAddress ?? {}) as Record<string, unknown>;
  const next = { ...previous, ...address, landmark: address.landmark ?? null, notes: address.notes ?? null };
  await db().update(orders).set({ deliveryAddress: next, version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId,
    target: order.orderNumber, metadata: { op: 'delivery_updated', village: address.village }, requestId: ctx.requestId,
  });
  const fresh = await loadOrderWithItems(orderId);
  return fresh!;
}

/**
 * What the customer must do next to pay (Paymob redirect / transfer instructions / COD
 * note) — replayable after a page reload or an app restart, so the payment step handed
 * over at checkout is never lost. Only while the order is still awaiting payment.
 */
export async function getPaymentStep(ctx: RequestContext, orderId: string): Promise<InitPaymentResult> {
  const order = await requireOwnOrder(ctx, orderId);
  if (order.status !== 'pending' || (order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed')) {
    throw new BusinessRuleError({
      code: 'ORDER_NOT_PAYABLE',
      message: { ar: 'هذا الطلب لا ينتظر دفعًا.', en: 'This order is not awaiting payment.' },
      meta: { status: order.status, paymentStatus: order.paymentStatus },
    });
  }
  return initPayment(orderId);
}

/**
 * Customer recovery after an online payment fails or never completes (§52): switch the
 * order to cash on delivery. Allowed only while the order is still pending and nothing
 * has been captured. A failed payment had its stock released, so the lines are
 * re-reserved — if stock ran out meanwhile the switch is refused (INSUFFICIENT_STOCK)
 * rather than promising goods we no longer hold. Open provider intents are cancelled so
 * the reconciliation job stops asking about them.
 */
export async function switchPaymentToCod(ctx: RequestContext, orderId: string): Promise<Order> {
  const order = await requireOwnOrder(ctx, orderId);
  if (order.paymentMethod === 'cod') return (await loadOrderWithItems(orderId))!;
  const from = order.paymentStatus as PaymentState;
  if (order.status !== 'pending' || (from !== 'pending' && from !== 'failed')) {
    throw new BusinessRuleError({
      code: 'PAYMENT_METHOD_LOCKED',
      message: { ar: 'لا يمكن تغيير طريقة الدفع لهذا الطلب.', en: 'The payment method of this order can no longer be changed.' },
      meta: { status: order.status, paymentStatus: from },
    });
  }
  const settings = await getSettings();
  if (!settings.codEnabled) {
    throw new BusinessRuleError({ code: 'COD_DISABLED', message: { ar: 'الدفع عند الاستلام غير متاح حالياً.', en: 'Cash on delivery is currently unavailable.' } });
  }

  const result = await db().transaction(async (tx) => {
    if (from === 'failed') {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      await reserveStock(
        tx,
        // '' ⇒ the product's default variant (lines older than migration 0007).
        items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, variantId: i.variantId ?? '', quantity: i.quantity })),
        { orderId },
      );
      assertPaymentTransition(from, 'pending');
      await tx.insert(orderStatusHistory).values({ orderId, fromStatus: from, toStatus: 'pending', kind: 'payment', actorId: ctx.principal!.userId });
    }
    await tx.update(orders).set({ paymentMethod: 'cod', paymentStatus: 'pending', version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
    await tx
      .update(payments)
      .set({ method: 'cod', provider: 'cod', status: 'pending', failureReason: null, providerPaymentId: null, version: sql`${payments.version} + 1` })
      .where(eq(payments.orderId, orderId));
    await tx
      .update(paymentIntents)
      .set({ status: 'cancelled', version: sql`${paymentIntents.version} + 1` })
      .where(and(eq(paymentIntents.orderId, orderId), inArray(paymentIntents.status, ['created', 'requires_action', 'processing'])));
    return (await loadOrderWithItems(orderId, tx))!;
  });

  await logAudit({
    actorId: ctx.principal!.userId, actorName: ctx.principal!.user.name, actorRole: 'customer',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId,
    target: order.orderNumber, metadata: { op: 'payment_method_changed', from: order.paymentMethod, to: 'cod', by: 'customer' }, requestId: ctx.requestId,
  });
  return result;
}

// ---- helpers ----

/** The caller's own order row, or 404 (no existence disclosure to anyone else). */
async function requireOwnOrder(ctx: RequestContext, orderId: string): Promise<typeof orders.$inferSelect> {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.userId !== ctx.principal.userId) {
    throw new NotFoundError({ code: 'ORDER_NOT_FOUND', message: { ar: 'الطلب غير موجود.', en: 'Order not found.' } });
  }
  return order;
}

async function attachItems(rows: (typeof orders.$inferSelect)[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const items = await db().select().from(orderItems).where(inArray(orderItems.orderId, ids));
  const byOrder = new Map<string, (typeof orderItems.$inferSelect)[]>();
  for (const it of items) {
    const list = byOrder.get(it.orderId) ?? [];
    list.push(it);
    byOrder.set(it.orderId, list);
  }
  return rows.map((r) => toOrderDto(r, byOrder.get(r.id) ?? []));
}

function requireOrdersView(ctx: RequestContext): void {
  requireOrdersPermission(ctx, 'view');
}

function requireOrdersPermission(ctx: RequestContext, action: 'view' | 'edit' | 'approve' | 'create'): void {
  if (!ctx.principal?.isStaff || !can(ctx.principal.permissions, 'orders', action)) {
    throw new AuthorizationError({ message: { ar: 'ليس لديك صلاحية.', en: 'You do not have permission.' }, meta: { permission: `orders:${action}` } });
  }
}

export { loadOrderWithItems };

/**
 * Admin-created manual order (§43, walk-in/phone). Server-authoritative: prices come
 * from the catalog (client prices ignored), stock is reserved atomically, and the order
 * is marked manual with no userId. Requires `orders:create` (enforced at the route).
 */
export async function createManualOrder(
  ctx: RequestContext,
  input: {
    lines: { productId: string; quantity: number }[];
    paymentMethod: 'cod' | 'vodafone_cash' | 'instapay';
    deliveryAddress: Record<string, unknown>;
    discountMinor?: number;
  },
): Promise<Order> {
  requireOrdersPermission(ctx, 'create');
  const { db: getDb } = await import('../../db/client');
  const { findProductsByIds } = await import('../catalog/repository');
  const { getSettings } = await import('../settings/service');
  const { computeTotals } = await import('../pricing/engine');
  const { reserveStock } = await import('../inventory/service');
  const { prefixedId, generateOrderNumber } = await import('../../lib/ids');
  const { BusinessRuleError } = await import('../../lib/errors');
  const { DEFAULT_STORE_ID } = await import('../../db/schema/system');

  if (!input.lines.length) throw new BusinessRuleError({ code: 'CART_EMPTY', message: { ar: 'لا توجد أصناف.', en: 'No line items.' } });
  const products = await findProductsByIds(input.lines.map((l) => l.productId));
  const byId = new Map(products.map((p) => [p.id, p]));
  const settings = await getSettings();

  const priceLines = input.lines.map((l) => {
    const row = byId.get(l.productId);
    if (!row) throw new BusinessRuleError({ code: 'PRODUCT_UNAVAILABLE', message: { ar: 'منتج غير متاح.', en: 'A product is unavailable.' }, meta: { productId: l.productId } });
    const variant = row.variants?.find((v) => v.isDefault && v.isActive) ?? row.variants?.[0];
    if (!variant) throw new BusinessRuleError({ code: 'PRODUCT_UNAVAILABLE', message: { ar: 'منتج غير متاح.', en: 'A product is unavailable.' }, meta: { productId: l.productId } });
    return { productId: row.id, variantId: variant.id, quantity: l.quantity, unitPriceMinor: variant.priceMinor, nameAr: row.nameAr, nameEn: row.nameEn, unit: variant.unitAr ?? row.unitAr, image: row.image };
  });

  const totals = computeTotals({
    lines: priceLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor })),
    deliveryFeeMinor: settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    tax: settings.tax,
  });
  const discountMinor = Math.min(input.discountMinor ?? 0, totals.subtotalMinor);
  const finalTotal = totals.subtotalMinor + totals.deliveryFeeMinor + totals.taxMinor - discountMinor;

  const orderId = prefixedId('ord');
  const created = await getDb().transaction(async (tx) => {
    await reserveStock(tx, priceLines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })), { orderId });
    await tx.insert(orders).values({
      id: orderId, storeId: DEFAULT_STORE_ID, orderNumber: generateOrderNumber(), userId: null,
      status: 'pending', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', paymentMethod: input.paymentMethod,
      currency: 'EGP', subtotalMinor: totals.subtotalMinor, deliveryFeeMinor: totals.deliveryFeeMinor, taxMinor: totals.taxMinor,
      discountMinor, totalMinor: finalTotal, deliveryAddress: input.deliveryAddress, estimatedDelivery: '30 - 45 دقيقة', manual: true,
    });
    for (const l of priceLines) {
      await tx.insert(orderItems).values({
        orderId, productId: l.productId, variantId: l.variantId, productNameAr: l.nameAr, productNameEn: l.nameEn, unit: l.unit, image: l.image,
        quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.unitPriceMinor * l.quantity,
      });
    }
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: null, toStatus: 'pending', kind: 'order', actorId: ctx.principal?.userId });
    const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return toOrderDto(row!, items);
  });

  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'order_status_changed', resource: 'orders', resourceId: orderId, target: created.orderNumber, metadata: { manual: 'true' }, requestId: ctx.requestId,
  });
  return created;
}
