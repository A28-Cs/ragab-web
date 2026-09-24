/**
 * §catalog import — id/slug safety for non-EAN skus.
 *
 * HyperOne's `sku` field is not reliably a barcode: verified live, 11 real products (Rush
 * Brush hair tools, Turkish coffee makers, an Ariston water heater, a Lavvento cable) carry
 * their full product NAME in `sku` instead. `safeIdSku` is what stops that from producing a
 * multi-word, non-ASCII, over-length id/slug that would fail products_slug_uidx hygiene.
 */
import { describe, it, expect } from 'vitest';
import { safeIdSku } from './plan';

describe('safeIdSku', () => {
  it('passes a clean 8-14 digit EAN through unchanged', () => {
    expect(safeIdSku('6224010081116')).toBe('6224010081116');
    expect(safeIdSku('12345678')).toBe('12345678');
  });

  it('replaces a non-EAN sku with a deterministic ASCII hash', () => {
    const real = 'Ariston Electric Water Heater - Titan Shield Technology - RUBIS';
    const out = safeIdSku(real);
    expect(out).toMatch(/^x[0-9a-f]{12}$/);
    expect(safeIdSku(real)).toBe(out); // deterministic — a re-run converges on the same id
  });

  it('handles an Arabic-only malformed sku the same way', () => {
    const real = 'كابل لافينتو - يو اس بي سي إلى يو اس بي سي - 60 وات';
    expect(safeIdSku(real)).toMatch(/^x[0-9a-f]{12}$/);
  });

  it('two different malformed skus never collide', () => {
    const a = safeIdSku('Rush Brush Hair Curler - C1 Cool');
    const b = safeIdSku('Rush Brush Curling Iron - M1');
    expect(a).not.toBe(b);
  });
});
