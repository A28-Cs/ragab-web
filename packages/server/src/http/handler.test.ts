import { describe, it, expect } from 'vitest';
import { defaultRateRule } from './handler';
import { RATE_RULES } from '../security/rateLimit';

describe('defaultRateRule (P3-7 — nothing is unlimited by omission)', () => {
  it('staff endpoints get the admin rule', () => {
    expect(defaultRateRule({ method: 'GET', permission: { resource: 'orders', action: 'view' } })).toBe(RATE_RULES.admin);
    expect(defaultRateRule({ method: 'DELETE', permission: { resource: 'products', action: 'delete' } })).toBe(RATE_RULES.admin);
  });

  it('every mutating endpoint gets the write rule', () => {
    expect(defaultRateRule({ method: 'POST' })).toBe(RATE_RULES.writeApi);
    expect(defaultRateRule({ method: 'PATCH', auth: 'required' })).toBe(RATE_RULES.writeApi);
  });

  it('a signed-in read gets the authenticated rule; a public read stays unlimited unless it opts in', () => {
    expect(defaultRateRule({ method: 'GET', auth: 'required' })).toBe(RATE_RULES.authenticated);
    expect(defaultRateRule({ method: 'GET', auth: 'optional' })).toBeNull();
    expect(defaultRateRule({ method: 'GET' })).toBeNull();
  });
});
