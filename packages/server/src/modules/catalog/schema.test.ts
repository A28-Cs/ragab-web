/**
 * `?offersOnly=false` / `?inStockOnly=false` — a query-string boolean whose value is the
 * literal string "false" — must parse to `false`, not `true`. `z.coerce.boolean()` runs
 * `Boolean("false")`, which is `true` (any non-empty string is truthy); that inversion
 * silently hid most of the storefront (every non-discounted, non-explicitly-toggled
 * product) behind the default `offersOnly=false` the client always sends.
 */
import { describe, it, expect } from 'vitest';
import { productFiltersSchema } from './schema';

describe('productFiltersSchema boolean query params', () => {
  it('parses the string "false" as false, not true', () => {
    const parsed = productFiltersSchema.parse({ offersOnly: 'false', inStockOnly: 'false' });
    expect(parsed.offersOnly).toBe(false);
    expect(parsed.inStockOnly).toBe(false);
  });

  it('parses the string "true" (and "1") as true', () => {
    expect(productFiltersSchema.parse({ offersOnly: 'true' }).offersOnly).toBe(true);
    expect(productFiltersSchema.parse({ offersOnly: '1' }).offersOnly).toBe(true);
  });

  it('leaves an actual boolean (e.g. a JSON body) untouched', () => {
    expect(productFiltersSchema.parse({ offersOnly: false }).offersOnly).toBe(false);
    expect(productFiltersSchema.parse({ offersOnly: true }).offersOnly).toBe(true);
  });

  it('omitted stays undefined (no filter applied)', () => {
    expect(productFiltersSchema.parse({}).offersOnly).toBeUndefined();
    expect(productFiltersSchema.parse({}).inStockOnly).toBeUndefined();
  });
});
