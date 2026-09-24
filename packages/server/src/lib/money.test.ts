import { describe, it, expect } from 'vitest';
import { Money, sumMoney } from './money';

describe('Money', () => {
  it('constructs from major units with half-up rounding', () => {
    expect(Money.ofMajor(95).minor).toBe(9500);
    expect(Money.ofMajor(95.5).minor).toBe(9550);
    expect(Money.ofMajor(0.005).minor).toBe(1); // half-up
  });

  it('adds and subtracts exactly (no float drift)', () => {
    const a = Money.ofMajor(0.1);
    const b = Money.ofMajor(0.2);
    expect(a.add(b).minor).toBe(30); // 0.1 + 0.2 == 0.30 exactly in minor units
    expect(a.add(b).toMajor()).toBe(0.3);
  });

  it('multiplies by integer quantity', () => {
    expect(Money.ofMinor(9500).multiply(3).minor).toBe(28500);
  });

  it('rejects non-integer quantities', () => {
    expect(() => Money.ofMinor(100).multiply(1.5)).toThrow();
  });

  it('computes percentage discounts with half-up rounding', () => {
    expect(Money.ofMinor(10000).percentage(15).minor).toBe(1500);
    expect(Money.ofMinor(333).percentage(10).minor).toBe(33); // 33.3 -> 33
  });

  it('clamps negative to zero and caps via min', () => {
    expect(Money.ofMinor(-50).clampNonNegative().minor).toBe(0);
    expect(Money.ofMinor(9000).min(Money.ofMinor(5000)).minor).toBe(5000);
  });

  it('rejects currency mismatch', () => {
    expect(() => Money.ofMinor(100, 'EGP').add(Money.ofMinor(100, 'USD'))).toThrow();
  });

  it('sums a list', () => {
    expect(sumMoney([Money.ofMinor(100), Money.ofMinor(250), Money.ofMinor(50)]).minor).toBe(400);
  });
});
