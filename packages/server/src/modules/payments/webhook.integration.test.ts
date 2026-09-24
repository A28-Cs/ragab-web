import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDb } from '../../db/client';
import { paymentWebhookEvents } from '../../db/schema';
import { handlePaymobWebhook } from './webhook';
import { computePaymobHmac } from './providers';

const SECRET = process.env.PAYMOB_HMAC_SECRET ?? 'test_hmac_secret';
process.env.PAYMOB_HMAC_SECRET = SECRET;

const EVENT_IDS = ['77001', '77002', '77003'];

/** Paymob stamps `created_at` as naive Cairo local time; render "now − ageMs" that way. */
function cairoNaive(ageMs = 0): string {
  const at = new Date(Date.now() - ageMs);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** `createdAt`: omit for "now", pass a string to control it, or `null` to leave the field out. */
function signedBody(txId: number, success: boolean, createdAt?: string | null) {
  const timestamp = createdAt === null ? undefined : (createdAt ?? cairoNaive());
  const obj = {
    amount_cents: 10000, created_at: timestamp, currency: 'EGP', error_occured: false,
    has_parent_transaction: false, id: txId, integration_id: 1, is_3d_secure: false, is_auth: false,
    is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false,
    order: { id: 5, merchant_order_id: 'nonexistent_order' }, owner: 1,
    source_data: { pan: '1111', sub_type: 'wallet', type: 'wallet' }, success,
  };
  const raw = JSON.stringify({ obj });
  const hmac = computePaymobHmac(obj as any, SECRET);
  return { raw, hmac };
}

async function stored(eventId: string) {
  return db().select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.providerEventId, eventId));
}

describe('paymob webhook pipeline (§20)', () => {
  beforeEach(async () => {
    await db().delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.providerEventId, EVENT_IDS));
  });
  afterAll(async () => {
    await db().delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.providerEventId, EVENT_IDS));
    await closeDb();
  });

  it('rejects a forged webhook (bad HMAC) and stores nothing', async () => {
    const { raw } = signedBody(77001, true);
    const res = await handlePaymobWebhook(raw, {}, { hmac: 'forged' });
    expect(res.accepted).toBe(false);
    expect((await stored('77001')).length).toBe(0);
  });

  it('accepts a valid webhook once and dedupes a replay (idempotent, §20)', async () => {
    const { raw, hmac } = signedBody(77001, true);
    const first = await handlePaymobWebhook(raw, {}, { hmac });
    expect(first.accepted).toBe(true);
    expect(first.duplicate).toBeFalsy();

    // Exact replay → deduped by the UNIQUE(provider, event_id) constraint.
    const second = await handlePaymobWebhook(raw, {}, { hmac });
    expect(second.accepted).toBe(true);
    expect(second.duplicate).toBe(true);

    expect((await stored('77001')).length).toBe(1); // exactly one row, no double-processing
  });

  it('rejects a correctly-signed callback that falls outside the replay window', async () => {
    const { raw, hmac } = signedBody(77002, true, cairoNaive(2 * 60 * 60 * 1000)); // 2h old
    const res = await handlePaymobWebhook(raw, {}, { hmac });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('stale event');
    expect((await stored('77002')).length).toBe(0); // never persisted, cannot be replayed later
  });

  it('rejects a callback with no timestamp (nothing to bound the replay window with)', async () => {
    const { raw, hmac } = signedBody(77003, true, null);
    const res = await handlePaymobWebhook(raw, {}, { hmac });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('missing timestamp');
    expect((await stored('77003')).length).toBe(0);
  });
});
