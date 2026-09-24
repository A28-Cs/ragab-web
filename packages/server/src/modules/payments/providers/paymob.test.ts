import { describe, it, expect } from 'vitest';
import { computePaymobHmac, parsePaymobTimestamp } from './paymob';
import { createHmac } from 'node:crypto';

describe('parsePaymobTimestamp (replay-window input)', () => {
  it('interprets a naive timestamp as Cairo local time, DST-aware', () => {
    // January: Egypt is UTC+2 → 10:00 Cairo == 08:00Z.
    expect(parsePaymobTimestamp('2026-01-15T10:00:00')?.toISOString()).toBe('2026-01-15T08:00:00.000Z');
    // July: Egypt observes DST (UTC+3) → 10:00 Cairo == 07:00Z.
    expect(parsePaymobTimestamp('2026-07-15T10:00:00')?.toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('respects an explicit zone and rejects garbage', () => {
    expect(parsePaymobTimestamp('2026-01-15T10:00:00Z')?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(parsePaymobTimestamp('2026-01-15T10:00:00+02:00')?.toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(parsePaymobTimestamp('nope')).toBeUndefined();
    expect(parsePaymobTimestamp(undefined)).toBeUndefined();
    expect(parsePaymobTimestamp('')).toBeUndefined();
  });
});

/**
 * The HMAC is computed over Paymob's fixed field order. This locks that ordering and
 * the boolean/empty rendering so a real Paymob callback verifies and a tampered one
 * does not. The expected value is derived independently here from the same secret.
 */
const SECRET = 'test_hmac_secret';

const TX = {
  amount_cents: 20500,
  created_at: '2026-08-30T10:00:00',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 123456789,
  integration_id: 111,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 987654321 },
  owner: 42,
  source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
  success: true,
};

function independentHmac(tx: any, secret: string): string {
  const order = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction','id',
    'integration_id','is_3d_secure','is_auth','is_capture','is_refunded','is_standalone_payment',
    'is_voided','order.id','owner','source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const get = (o: any, p: string) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
  const s = order.map((f) => {
    const v = get(tx, f);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return v == null ? '' : String(v);
  }).join('');
  return createHmac('sha512', secret).update(s).digest('hex');
}

describe('Paymob HMAC (§20)', () => {
  it('matches an independently-computed digest for a valid transaction', () => {
    expect(computePaymobHmac(TX as any, SECRET)).toBe(independentHmac(TX, SECRET));
  });

  it('changes when ANY signed field is tampered', () => {
    const good = computePaymobHmac(TX as any, SECRET);
    const tampered = computePaymobHmac({ ...TX, amount_cents: 1 } as any, SECRET);
    expect(tampered).not.toBe(good);
  });

  it('changes when success flag is flipped', () => {
    const good = computePaymobHmac(TX as any, SECRET);
    const flipped = computePaymobHmac({ ...TX, success: false } as any, SECRET);
    expect(flipped).not.toBe(good);
  });

  it('differs under a different secret (an attacker without the secret cannot forge)', () => {
    expect(computePaymobHmac(TX as any, SECRET)).not.toBe(computePaymobHmac(TX as any, 'wrong_secret'));
  });
});
