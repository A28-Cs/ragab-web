/**
 * Order state machines (§6). Explicit transition tables with a guard on every write.
 * Invalid transitions (e.g. DELIVERED → preparing) are rejected with a stable code.
 * Three independent dimensions: public order status, payment status, fulfillment.
 */
import { BusinessRuleError } from '../../lib/errors';
import type { OrderStatus } from '../../types';

export type PaymentState = 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';

/** Public order status transitions (the 5 values the storefront UI knows). */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [], // terminal (returns/refunds are a separate concern)
  cancelled: [], // terminal
};

const PAYMENT_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  pending: ['authorized', 'paid', 'failed', 'cancelled'],
  authorized: ['paid', 'failed', 'cancelled'],
  paid: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  failed: ['cancelled', 'pending'], // pending again = the customer retries / falls back to COD
  refunded: [],
  cancelled: [], // terminal: nothing was ever captured, so there is nothing to refund
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

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to)) {
    throw new BusinessRuleError({
      code: 'INVALID_PAYMENT_TRANSITION',
      message: { ar: 'انتقال حالة الدفع غير صالح.', en: `Cannot transition payment from ${from} to ${to}.` },
      meta: { from, to },
    });
  }
}

/** Terminal states cannot be advanced further. */
export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}
