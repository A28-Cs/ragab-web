/**
 * Order mapper. Projects normalized rows + item snapshots into the contract `Order`
 * shape. deliveryAddress is the immutable jsonb snapshot stored at checkout; item
 * name/unit/price are snapshots too (historical immutability, §28). Money → major units.
 */
import { Money } from '../../lib/money';
import { toLegacyTimestamp } from '../../lib/clock';
import type { orders, orderItems } from '../../db/schema';
import type { Address, Order, OrderItem, PaymentMethod, ApiPaymentStatus } from '../../types';

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

function toItemDto(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.productId ?? undefined,
    variantId: row.variantId ?? undefined,
    productNameAr: row.productNameAr,
    productNameEn: row.productNameEn ?? undefined,
    unit: row.unit,
    quantity: row.quantity,
    price: Money.ofMinor(row.unitPriceMinor).toMajor(),
    total: Money.ofMinor(row.lineTotalMinor).toMajor(),
    image: row.image,
  };
}

export function toOrderDto(order: OrderRow, items: OrderItemRow[]): Order {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: toLegacyTimestamp(order.placedAt),
    createdAtIso: order.placedAt.toISOString(),
    status: order.status,
    items: items.map(toItemDto),
    subtotal: Money.ofMinor(order.subtotalMinor).toMajor(),
    deliveryFee: Money.ofMinor(order.deliveryFeeMinor).toMajor(),
    discount: Money.ofMinor(order.discountMinor).toMajor(),
    tax: Money.ofMinor(order.taxMinor).toMajor(),
    total: Money.ofMinor(order.totalMinor).toMajor(),
    paymentMethod: order.paymentMethod as PaymentMethod,
    paymentStatus: order.paymentStatus as ApiPaymentStatus,
    deliveryAddress: order.deliveryAddress as Address,
    estimatedDelivery: order.estimatedDelivery,
    manual: order.manual || undefined,
    refunded: order.refunded || undefined,
    couponCode: order.couponCode ?? undefined,
  };
}
