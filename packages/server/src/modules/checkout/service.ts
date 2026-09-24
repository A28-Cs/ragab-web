/**
 * Checkout (§21, §22, §51). Two operations:
 *
 *  quote(preview, no writes): revalidate every line against live DB (active, in stock,
 *    current price), resolve the delivery zone/fee, validate the coupon, and return the
 *    server-computed totals. Purely informational — the client shows these numbers.
 *
 *  placeOrder(the authority): ONE transaction, no external calls inside it:
 *    1. reload cart lines + products (server truth — client sends NO money)
 *    2. recompute totals from scratch via the pricing engine
 *    3. reserve stock atomically (overselling impossible)
 *    4. insert order + items (immutable snapshots) + first status-history row
 *    5. redeem the coupon (unique constraint prevents double redemption)
 *    then commit. Payment initialization happens AFTER commit (§22 — no external calls
 *    inside the tx). Guarded by an Idempotency-Key so a double-submit yields ONE order.
 */
import { and, eq } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import { orders, orderItems, orderStatusHistory, addresses } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../lib/errors';
import { Money } from '../../lib/money';
import { generateOrderNumber, prefixedId } from '../../lib/ids';
import { carts, cartItems } from '../../db/schema';
import { getCartLines } from '../cart/service';
import { findProductsByIds } from '../catalog/repository';
import { getSettings } from '../settings/service';
import { computeTotals, type AppliedPromotion, type PriceLine } from '../pricing/engine';
import { validateCoupon, redeemPromotions, loadActivePromotions } from '../promotions/service';
import { reserveStock } from '../inventory/service';
import { requireDeliverableZone, type ZoneRow } from '../shipping/service';
import { toOrderDto } from '../orders/mapper';
import { notifyOrderEvent } from '../notifications/dispatch';
import type { Address, Order, PaymentMethod } from '../../types';

export interface CheckoutInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
}

interface PreparedCheckout {
  lines: { productId: string; variantId: string; quantity: number; unitPriceMinor: number; nameAr: string; nameEn: string | null; unit: string; image: string; isGift?: boolean }[];
  priceLines: PriceLine[];
  address: Address;
  /** The zone whose fee/min-order applied; null = legacy free-text village on the store default fee. */
  zone: ZoneRow | null;
  totals: ReturnType<typeof computeTotals>;
  coupon: Awaited<ReturnType<typeof validateCoupon>> | null;
  /** Every promotion that changed the price / granted delivery or a gift (automatic + the code). */
  applied: AppliedPromotion[];
}

/**
 * Free gifts (0008): the gift product's default unit becomes a zero-priced line — reserved
 * and snapshotted like any other line. A gift that is out of stock is simply skipped.
 */
async function giftLines(productIds: string[]): Promise<PreparedCheckout['lines']> {
  if (productIds.length === 0) return [];
  const rows = await findProductsByIds(productIds, undefined, { visibleOnly: true });
  const out: PreparedCheckout['lines'] = [];
  for (const row of rows) {
    const variant = row.variants?.find((v) => v.isDefault && v.isActive) ?? row.variants?.find((v) => v.isActive);
    if (!variant || variant.available < 1) continue;
    out.push({ productId: row.id, variantId: variant.id, quantity: 1, unitPriceMinor: 0, nameAr: `${row.nameAr} (هدية)`, nameEn: row.nameEn ? `${row.nameEn} (gift)` : null, unit: variant.unitAr ?? row.unitAr, image: row.image, isGift: true });
  }
  return out;
}

/** Shared preparation used by both quote and placeOrder — the single pricing path. */
async function prepare(ctx: RequestContext, input: { addressId: string; couponCode?: string }): Promise<PreparedCheckout> {
  if (!ctx.principal) throw new ValidationError({ code: 'AUTH_REQUIRED', message: { ar: 'يجب تسجيل الدخول لإتمام الطلب.', en: 'You must be signed in to check out.' } });

  const settings = await getSettings();
  if (settings.maintenanceMode) {
    throw new BusinessRuleError({ code: 'STORE_MAINTENANCE', message: { ar: 'المتجر في وضع الصيانة حالياً.', en: 'The store is currently under maintenance.' } });
  }

  const cart = await getCartLines(ctx);
  if (!cart || cart.lines.length === 0) {
    throw new BusinessRuleError({ code: 'CART_EMPTY', message: { ar: 'سلة التسوق فارغة.', en: 'Your cart is empty.' } });
  }

  // Address must belong to the caller (§11 ownership).
  const [address] = await db().select().from(addresses).where(and(eq(addresses.id, input.addressId), eq(addresses.userId, ctx.principal.userId))).limit(1);
  if (!address) throw new NotFoundError({ code: 'ADDRESS_NOT_FOUND', message: { ar: 'العنوان غير موجود.', en: 'Delivery address not found.' } });

  // Delivery pricing comes from the address's zone (AC-14) — the same number the home
  // page advertises. A zone no longer served is refused here, never silently re-priced.
  const zone = await requireDeliverableZone(address);

  // Reprice from live product data — the client's prices are irrelevant here.
  const productRows = await findProductsByIds(cart.lines.map((l) => l.productId));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  const lines: PreparedCheckout['lines'] = [];
  const priceLines: PriceLine[] = [];
  for (const line of cart.lines) {
    const row = byId.get(line.productId);
    // The variant is the sellable unit (0007): a retired one makes the line unavailable.
    const variant = row?.variants?.find((v) => v.id === line.variantId && v.isActive);
    if (!row || !variant) throw new BusinessRuleError({ code: 'PRODUCT_UNAVAILABLE', message: { ar: 'أحد المنتجات لم يعد متاحاً.', en: 'A product in your cart is no longer available.' }, meta: { productId: line.productId, variantId: line.variantId } });
    if (line.quantity > variant.available) {
      throw new BusinessRuleError({ code: 'INSUFFICIENT_STOCK', message: { ar: 'الكمية المطلوبة غير متوفرة.', en: 'Requested quantity exceeds available stock.' }, meta: { productId: line.productId, variantId: line.variantId } });
    }
    // Snapshot names the packaging when it is not the plain default ("بيض — كرتونة 12").
    const nameAr = variant.isDefault ? row.nameAr : `${row.nameAr} — ${variant.nameAr}`;
    const nameEn = row.nameEn ? (variant.isDefault ? row.nameEn : `${row.nameEn} — ${variant.nameEn ?? variant.nameAr}`) : null;
    lines.push({ productId: row.id, variantId: variant.id, quantity: line.quantity, unitPriceMinor: variant.priceMinor, nameAr, nameEn, unit: variant.unitAr ?? row.unitAr, image: row.image });
    priceLines.push({ productId: row.id, variantId: variant.id, quantity: line.quantity, unitPriceMinor: variant.priceMinor, categoryId: row.categoryId });
  }

  const subtotalMinor = priceLines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  // (Min order check removed per user request)
  // One engine, one list: the automatic promotions in force plus the entered code (0008).
  const coupon = input.couponCode ? await validateCoupon(input.couponCode, ctx.principal.userId, subtotalMinor) : null;
  const automatic = await loadActivePromotions({ userId: ctx.principal.userId });
  const totals = computeTotals({
    lines: priceLines,
    deliveryFeeMinor: zone ? zone.deliveryFeeMinor : settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    promotions: [...automatic, ...(coupon ? [coupon] : [])],
    tax: settings.tax,
  });
  const gifts = await giftLines(totals.giftProductIds);

  return { lines: [...lines, ...gifts], priceLines, address: address as unknown as Address, zone, totals, coupon, applied: totals.applied };
}

/** Preview totals (§21 Quote). No writes. */
export async function quote(ctx: RequestContext, input: { addressId: string; couponCode?: string }) {
  const prepared = await prepare(ctx, input);
  return {
    subtotal: Money.ofMinor(prepared.totals.subtotalMinor).toMajor(),
    discount: Money.ofMinor(prepared.totals.discountMinor).toMajor(),
    deliveryFee: Money.ofMinor(prepared.totals.deliveryFeeMinor).toMajor(),
    tax: Money.ofMinor(prepared.totals.taxMinor).toMajor(),
    total: Money.ofMinor(prepared.totals.totalMinor).toMajor(),
    couponCode: prepared.coupon?.code,
    currency: 'EGP',
    itemCount: prepared.lines.reduce((n, l) => n + l.quantity, 0),
    promotions: prepared.applied.map((a) => ({
      id: a.id, code: a.code ?? null, type: a.type, titleAr: a.titleAr, titleEn: a.titleEn,
      discount: Money.ofMinor(a.discountMinor).toMajor(), freeDelivery: a.freeDelivery, giftProductId: a.giftProductId ?? null,
    })),
    gifts: prepared.lines.filter((l) => l.isGift).map((l) => ({ productId: l.productId, nameAr: l.nameAr, nameEn: l.nameEn ?? undefined })),
    zone: prepared.zone
      ? {
          id: prepared.zone.id,
          nameAr: prepared.zone.nameAr,
          nameEn: prepared.zone.nameEn,
          estimatedTimeAr: prepared.zone.estimatedTimeAr,
          estimatedTimeEn: prepared.zone.estimatedTimeEn,
          minOrder: Money.ofMinor(prepared.zone.minOrderMinor).toMajor(),
        }
      : null,
  };
}

/** Place the order (§21/§22). Authoritative, transactional, idempotent (via the route). */
export async function placeOrder(ctx: RequestContext, input: CheckoutInput): Promise<Order> {
  const prepared = await prepare(ctx, input);
  const settings = await getSettings();

  if (input.paymentMethod === 'cod' && !settings.codEnabled) {
    throw new BusinessRuleError({ code: 'COD_DISABLED', message: { ar: 'الدفع عند الاستلام غير متاح حالياً.', en: 'Cash on delivery is currently unavailable.' } });
  }

  const order = await db().transaction(async (tx) => {
    // Re-verify prices/stock did not change since prepare() by recomputing from a fresh read
    // is unnecessary here because reserveStock's guard is the authoritative check; but we
    // DO reserve inside the tx so stock and the order commit atomically.
    const orderId = prefixedId('ord');
    const orderNumber = generateOrderNumber();

    // 1. Reserve stock atomically (throws InsufficientStockError → rolls back the tx).
    await reserveStock(
      tx,
      prepared.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
      { orderId },
    );

    // 2. Create the order with server-computed money (client money never used).
    await tx.insert(orders).values({
      id: orderId,
      storeId: DEFAULT_STORE_ID,
      orderNumber,
      userId: ctx.principal!.userId,
      status: 'pending',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      paymentMethod: input.paymentMethod,
      currency: 'EGP',
      subtotalMinor: prepared.totals.subtotalMinor,
      deliveryFeeMinor: prepared.totals.deliveryFeeMinor,
      taxMinor: prepared.totals.taxMinor,
      discountMinor: prepared.totals.discountMinor,
      totalMinor: prepared.totals.totalMinor,
      couponCode: prepared.coupon?.code ?? null,
      // Immutable snapshot incl. the zone it was priced with (§28) — the fee stays explainable later.
      deliveryAddress: {
        ...prepared.address,
        zoneId: prepared.zone?.id ?? null,
        zoneNameAr: prepared.zone?.nameAr ?? null,
        zoneNameEn: prepared.zone?.nameEn ?? null,
      },
      estimatedDelivery: prepared.zone?.estimatedTimeAr || '30 - 45 دقيقة',
      notes: input.notes ?? null,
    });

    // 3. Immutable line snapshots — one multi-row INSERT, not a round trip per line.
    if (prepared.lines.length > 0) {
      await tx.insert(orderItems).values(
        prepared.lines.map((l) => ({
          orderId,
          productId: l.productId,
          variantId: l.variantId,
          productNameAr: l.nameAr,
          productNameEn: l.nameEn,
          unit: l.unit,
          image: l.image,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          lineTotalMinor: l.unitPriceMinor * l.quantity,
        })),
      );
    }

    // 4. First status-history entry (append-only).
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: null, toStatus: 'pending', kind: 'order', actorId: ctx.principal!.userId });

    // 5. Record every applied promotion (unique per order — never double-redeemed).
    await redeemPromotions(tx, prepared.applied, ctx.principal!.userId, orderId);

    // 6. Convert the cart: empty it and mark it converted (§21).
    const [activeCart] = await tx.select().from(carts).where(and(eq(carts.userId, ctx.principal!.userId), eq(carts.status, 'active'))).limit(1);
    if (activeCart) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, activeCart.id));
      await tx.update(carts).set({ status: 'converted', convertedOrderId: orderId }).where(eq(carts.id, activeCart.id));
    }

    const [created] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    return toOrderDto(created!, items);
  });

  // Order confirmation — in-app row now, email/push through the queue. Never fails checkout.
  await notifyOrderEvent('order_confirmation', { userId: ctx.principal!.userId, orderId: order.id, orderNumber: order.orderNumber });

  try {
    const { publishEvent } = await import('../../lib/events');
    await publishEvent('admin_orders', {
      event: 'order.created',
      topic: 'admin_orders',
      eventId: prefixedId('evt'),
      timestamp: new Date().toISOString(),
      version: Date.now(),
      data: {
        order: order
      }
    });
  } catch (err) {
    // Best effort broadcast
  }

  return order;
}
