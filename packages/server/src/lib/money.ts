/**
 * Money — integer minor units, never floating point (§5).
 *
 * Canonical unit is the piastre (1 EGP = 100 piastres), stored as BIGINT in the DB
 * and carried as a JS `number` here. Every value is a safe integer well under
 * Number.MAX_SAFE_INTEGER (9e15 ≈ 90 trillion EGP), so integer arithmetic is exact.
 * Division rounds half-up to the nearest minor unit and is the ONLY place rounding
 * is allowed to happen.
 */
export const DEFAULT_CURRENCY = 'EGP';
export const MINOR_UNITS_PER_MAJOR = 100;

export class MoneyError extends Error {}

/** Immutable money value in minor units. */
export class Money {
  readonly minor: number;
  readonly currency: string;

  private constructor(minor: number, currency: string) {
    if (!Number.isInteger(minor)) throw new MoneyError(`Money.minor must be an integer, got ${minor}`);
    if (!Number.isSafeInteger(minor)) throw new MoneyError('Money value exceeds safe integer range');
    this.minor = minor;
    this.currency = currency;
  }

  static ofMinor(minor: number, currency = DEFAULT_CURRENCY): Money {
    return new Money(minor, currency);
  }

  /** From a major-unit amount (e.g. 95.5 EGP). Rounds half-up to the minor unit. */
  static ofMajor(major: number, currency = DEFAULT_CURRENCY): Money {
    if (!Number.isFinite(major)) throw new MoneyError(`Invalid major amount: ${major}`);
    return new Money(Math.round(major * MINOR_UNITS_PER_MAJOR), currency);
  }

  static zero(currency = DEFAULT_CURRENCY): Money {
    return new Money(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  /** Multiply by an integer quantity (e.g. line price × qty). */
  multiply(qty: number): Money {
    if (!Number.isInteger(qty)) throw new MoneyError(`Quantity must be an integer, got ${qty}`);
    return new Money(this.minor * qty, this.currency);
  }

  /** Percentage of this amount, rounded half-up. Used for percentage discounts. */
  percentage(percent: number): Money {
    if (!Number.isFinite(percent)) throw new MoneyError(`Invalid percent: ${percent}`);
    return new Money(Math.round((this.minor * percent) / 100), this.currency);
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  gte(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor >= other.minor;
  }

  gt(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor > other.minor;
  }

  /** Clamp to >= 0. A total or discount can never render negative. */
  clampNonNegative(): Money {
    return this.minor < 0 ? Money.zero(this.currency) : this;
  }

  /** Never let a discount exceed a cap (e.g. discount cannot exceed subtotal). */
  min(other: Money): Money {
    this.assertSameCurrency(other);
    return this.minor <= other.minor ? this : other;
  }

  /** Project to major units for API responses. Exact for <=2dp values. */
  toMajor(): number {
    return this.minor / MINOR_UNITS_PER_MAJOR;
  }

  toString(): string {
    return `${this.toMajor().toFixed(2)} ${this.currency}`;
  }
}

/** Sum a list of Money, all in the same currency. */
export function sumMoney(items: Money[], currency = DEFAULT_CURRENCY): Money {
  return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
}
