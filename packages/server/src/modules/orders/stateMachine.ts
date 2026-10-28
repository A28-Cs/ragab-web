/**
 * Order state machines (§6). Explicit transition tables with a guard on every write.
 * Invalid transitions (e.g. DELIVERED → preparing) are rejected with a stable code.
 * Three independent dimensions: public order status, payment status, delivery/fulfillment.
 */
import { BusinessRuleError } from '../../lib/errors';
import type {
  OrderStatus,
  DetailedOrderStatus,
  DeliveryJobStatus,
  UnifiedPaymentStatus,
  ReasonCode,
} from '../../types';

export type PaymentState =
  | 'unpaid'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'cancelled';

/** Public order status transitions (the 5 values the wire/storefront UI knows). */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [], // terminal
  cancelled: [], // terminal
};

/** Granular Order Lifecycle transitions (Phase 2.A). */
const DETAILED_ORDER_TRANSITIONS: Record<DetailedOrderStatus, DetailedOrderStatus[]> = {
  pending_confirmation: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'delivery_exception', 'cancelled'],
  delivery_exception: ['out_for_delivery', 'ready_for_pickup', 'cancelled'],
  delivered: [], // terminal
  rejected: [],  // terminal
  cancelled: [], // terminal
};

/** Granular Delivery Job Lifecycle transitions (Phase 2.B). */
const DELIVERY_JOB_TRANSITIONS: Record<DeliveryJobStatus, DeliveryJobStatus[]> = {
  awaiting_dispatch: ['searching_driver', 'assigned', 'cancelled'],
  searching_driver: ['assigned', 'awaiting_dispatch', 'failed', 'cancelled'],
  assigned: ['accepted', 'searching_driver', 'cancelled'],
  accepted: ['heading_to_pickup', 'arrived_at_pickup', 'picked_up', 'searching_driver', 'cancelled'],
  heading_to_pickup: ['arrived_at_pickup', 'picked_up', 'searching_driver', 'cancelled'],
  arrived_at_pickup: ['picked_up', 'searching_driver', 'cancelled'],
  picked_up: ['in_transit', 'arrived_at_dropoff', 'delivered', 'failed', 'returning'],
  in_transit: ['arrived_at_dropoff', 'delivered', 'failed', 'returning'],
  arrived_at_dropoff: ['delivered', 'failed', 'returning'],
  delivered: [], // terminal
  failed: ['returning', 'searching_driver', 'cancelled'],
  returning: ['returned_to_pharmacy', 'failed'],
  returned_to_pharmacy: [], // terminal
  cancelled: [], // terminal
};

/** Payment Lifecycle transitions (Phase 2.C). */
const PAYMENT_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  unpaid: ['pending', 'paid', 'failed', 'cancelled'],
  pending: ['authorized', 'paid', 'failed', 'cancelled'],
  authorized: ['paid', 'failed', 'cancelled'],
  paid: ['refund_pending', 'refunded', 'partially_refunded'],
  refund_pending: ['refunded', 'partially_refunded', 'paid'],
  partially_refunded: ['refund_pending', 'refunded', 'partially_refunded'],
  failed: ['cancelled', 'pending', 'unpaid'], // pending/unpaid again = retry / COD fallback
  refunded: [],
  cancelled: [], // terminal
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // idempotent no-op
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new BusinessRuleError({
      code: 'INVALID_STATUS_TRANSITION',
      message: {
        ar: `لا يمكن تغيير حالة الطلب من ${from} إلى ${to}.`,
        en: `Cannot transition order from ${from} to ${to}.`,
      },
      meta: { from, to },
    });
  }
}

export function canTransitionDetailedOrder(from: DetailedOrderStatus, to: DetailedOrderStatus): boolean {
  if (from === to) return true;
  return DETAILED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertDetailedOrderTransition(from: DetailedOrderStatus, to: DetailedOrderStatus): void {
  if (!canTransitionDetailedOrder(from, to)) {
    throw new BusinessRuleError({
      code: 'INVALID_STATUS_TRANSITION',
      message: {
        ar: `لا يمكن تغيير حالة الطلب التفصيلية من ${from} إلى ${to}.`,
        en: `Cannot transition detailed order status from ${from} to ${to}.`,
      },
      meta: { from, to },
    });
  }
}

export function canTransitionDeliveryJob(from: DeliveryJobStatus, to: DeliveryJobStatus): boolean {
  if (from === to) return true;
  return DELIVERY_JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertDeliveryJobTransition(from: DeliveryJobStatus, to: DeliveryJobStatus): void {
  if (!canTransitionDeliveryJob(from, to)) {
    throw new BusinessRuleError({
      code: 'INVALID_DELIVERY_TRANSITION',
      message: {
        ar: `لا يمكن تغيير حالة التوصيل من ${from} إلى ${to}.`,
        en: `Cannot transition delivery job status from ${from} to ${to}.`,
      },
      meta: { from, to },
    });
  }
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to)) {
    throw new BusinessRuleError({
      code: 'INVALID_PAYMENT_TRANSITION',
      message: {
        ar: 'انتقال حالة الدفع غير صالح.',
        en: `Cannot transition payment from ${from} to ${to}.`,
      },
      meta: { from, to },
    });
  }
}

/**
 * Maps a detailed order status to the 5 wire status values for backward compatibility.
 */
export function detailedToWireOrderStatus(detailed: DetailedOrderStatus): OrderStatus {
  switch (detailed) {
    case 'pending_confirmation':
    case 'confirmed':
      return 'pending';
    case 'preparing':
    case 'ready_for_pickup':
      return 'preparing';
    case 'out_for_delivery':
    case 'delivery_exception':
      return 'on_the_way';
    case 'delivered':
      return 'delivered';
    case 'rejected':
    case 'cancelled':
      return 'cancelled';
  }
}

/**
 * Infers detailed order status from existing order + shipment state.
 */
export function wireToDetailedOrderStatus(
  wireStatus: OrderStatus,
  fulfillmentStatus?: string | null,
  shipmentStatus?: string | null,
  isException?: boolean
): DetailedOrderStatus {
  if (wireStatus === 'delivered') return 'delivered';
  if (wireStatus === 'cancelled') return 'cancelled';

  if (wireStatus === 'pending') {
    if (fulfillmentStatus === 'processing') return 'confirmed';
    return 'pending_confirmation';
  }

  if (wireStatus === 'preparing') {
    if (fulfillmentStatus === 'ready' || shipmentStatus === 'assigned' || shipmentStatus === 'pending') {
      return 'ready_for_pickup';
    }
    return 'preparing';
  }

  if (wireStatus === 'on_the_way') {
    if (isException || shipmentStatus === 'failed') return 'delivery_exception';
    return 'out_for_delivery';
  }

  return 'pending_confirmation';
}

/** Terminal states cannot be advanced further. */
export function isOrderTerminal(status: OrderStatus | DetailedOrderStatus): boolean {
  if (status in ORDER_TRANSITIONS) {
    return ORDER_TRANSITIONS[status as OrderStatus].length === 0;
  }
  return DETAILED_ORDER_TRANSITIONS[status as DetailedOrderStatus]?.length === 0;
}
