import { describe, it, expect } from 'vitest';
import { canTransitionOrder, assertOrderTransition, canTransitionPayment, isOrderTerminal } from './stateMachine';

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
});
