import { describe, it, expect } from 'vitest';
import {
  canTransitionOrder,
  assertOrderTransition,
  canTransitionDetailedOrder,
  assertDetailedOrderTransition,
  canTransitionDeliveryJob,
  assertDeliveryJobTransition,
  canTransitionPayment,
  isOrderTerminal,
  detailedToWireOrderStatus,
  wireToDetailedOrderStatus,
} from './stateMachine';

describe('order state machine (§6)', () => {
  it('allows the forward pipeline', () => {
    expect(canTransitionOrder('pending', 'preparing')).toBe(true);
    expect(canTransitionOrder('preparing', 'on_the_way')).toBe(true);
    expect(canTransitionOrder('on_the_way', 'delivered')).toBe(true);
  });

  it('rejects DELIVERED → preparing and other backward moves', () => {
    expect(canTransitionOrder('delivered', 'preparing')).toBe(false);
    expect(() => assertOrderTransition('delivered', 'preparing')).toThrow(/INVALID_STATUS_TRANSITION|transition/);
    expect(canTransitionOrder('on_the_way', 'pending')).toBe(false);
  });

  it('allows cancellation from any non-terminal state', () => {
    expect(canTransitionOrder('pending', 'cancelled')).toBe(true);
    expect(canTransitionOrder('preparing', 'cancelled')).toBe(true);
    expect(canTransitionOrder('on_the_way', 'cancelled')).toBe(true);
  });

  it('treats delivered and cancelled as terminal', () => {
    expect(isOrderTerminal('delivered')).toBe(true);
    expect(isOrderTerminal('cancelled')).toBe(true);
    expect(canTransitionOrder('cancelled', 'delivered')).toBe(false);
  });

  it('is idempotent for same-state transitions', () => {
    expect(canTransitionOrder('delivered', 'delivered')).toBe(true);
  });

  it('payment: pending→paid ok, paid→pending rejected, paid→refunded ok', () => {
    expect(canTransitionPayment('pending', 'paid')).toBe(true);
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
    expect(canTransitionPayment('paid', 'refunded')).toBe(true);
    expect(canTransitionPayment('failed', 'paid')).toBe(false);
  });

  it('payment: a failed attempt can go back to pending (retry / COD fallback), never straight to paid', () => {
    expect(canTransitionPayment('failed', 'pending')).toBe(true);
    expect(canTransitionPayment('failed', 'paid')).toBe(false);
    expect(canTransitionPayment('cancelled', 'pending')).toBe(false);
  });

  it('payment: an uncaptured payment can be cancelled; captured money can only be refunded', () => {
    expect(canTransitionPayment('pending', 'cancelled')).toBe(true);
    expect(canTransitionPayment('authorized', 'cancelled')).toBe(true);
    expect(canTransitionPayment('failed', 'cancelled')).toBe(true);
    expect(canTransitionPayment('paid', 'cancelled')).toBe(false);
    expect(canTransitionPayment('partially_refunded', 'cancelled')).toBe(false);
    // cancelled is terminal: nothing was collected, so nothing can be captured or refunded
    expect(canTransitionPayment('cancelled', 'paid')).toBe(false);
    expect(canTransitionPayment('cancelled', 'refunded')).toBe(false);
  });

  it('detailed order lifecycle: transitions follow phase 2 rules', () => {
    expect(canTransitionDetailedOrder('pending_confirmation', 'confirmed')).toBe(true);
    expect(canTransitionDetailedOrder('confirmed', 'preparing')).toBe(true);
    expect(canTransitionDetailedOrder('preparing', 'ready_for_pickup')).toBe(true);
    expect(canTransitionDetailedOrder('ready_for_pickup', 'out_for_delivery')).toBe(true);
    expect(canTransitionDetailedOrder('out_for_delivery', 'delivered')).toBe(true);
    expect(canTransitionDetailedOrder('out_for_delivery', 'delivery_exception')).toBe(true);
    expect(canTransitionDetailedOrder('delivery_exception', 'out_for_delivery')).toBe(true);
    expect(canTransitionDetailedOrder('delivered', 'preparing')).toBe(false);
    expect(() => assertDetailedOrderTransition('delivered', 'preparing')).toThrow(/Cannot transition|INVALID_STATUS_TRANSITION/);
  });

  it('delivery job lifecycle: enforces proper courier steps', () => {
    expect(canTransitionDeliveryJob('awaiting_dispatch', 'searching_driver')).toBe(true);
    expect(canTransitionDeliveryJob('searching_driver', 'assigned')).toBe(true);
    expect(canTransitionDeliveryJob('assigned', 'accepted')).toBe(true);
    expect(canTransitionDeliveryJob('accepted', 'heading_to_pickup')).toBe(true);
    expect(canTransitionDeliveryJob('heading_to_pickup', 'arrived_at_pickup')).toBe(true);
    expect(canTransitionDeliveryJob('arrived_at_pickup', 'picked_up')).toBe(true);
    expect(canTransitionDeliveryJob('picked_up', 'in_transit')).toBe(true);
    expect(canTransitionDeliveryJob('in_transit', 'arrived_at_dropoff')).toBe(true);
    expect(canTransitionDeliveryJob('arrived_at_dropoff', 'delivered')).toBe(true);
    expect(canTransitionDeliveryJob('delivered', 'picked_up')).toBe(false);
    expect(() => assertDeliveryJobTransition('delivered', 'picked_up')).toThrow(/Cannot transition|INVALID_DELIVERY_TRANSITION/);
  });

  it('wire mapping maintains 100% backward compatibility for mobile', () => {
    expect(detailedToWireOrderStatus('pending_confirmation')).toBe('pending');
    expect(detailedToWireOrderStatus('confirmed')).toBe('pending');
    expect(detailedToWireOrderStatus('preparing')).toBe('preparing');
    expect(detailedToWireOrderStatus('ready_for_pickup')).toBe('preparing');
    expect(detailedToWireOrderStatus('out_for_delivery')).toBe('on_the_way');
    expect(detailedToWireOrderStatus('delivery_exception')).toBe('on_the_way');
    expect(detailedToWireOrderStatus('delivered')).toBe('delivered');
    expect(detailedToWireOrderStatus('cancelled')).toBe('cancelled');
    expect(detailedToWireOrderStatus('rejected')).toBe('cancelled');
  });
});
