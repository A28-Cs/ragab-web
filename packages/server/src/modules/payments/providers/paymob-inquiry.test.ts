import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../config/env', () => ({
  serverEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'silent', PAYMOB_BASE_URL: 'https://accept.paymob.test' }),
  isTest: () => true,
  isProd: () => false,
}));
vi.mock('../../../lib/credentials', () => ({
  getCredential: vi.fn(async (_provider: string, key: string) => (key === 'PAYMOB_API_KEY' ? 'api-key' : undefined)),
}));

import { getCredential } from '../../../lib/credentials';
import { PaymobProvider } from './paymob';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PaymobProvider.inquire (reconciliation)', () => {
  it('exchanges the API key for an auth token and maps the transaction like a webhook event', async () => {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body));
        calls.push({ url, body });
        if (url.endsWith('/api/auth/tokens')) return json(201, { token: 'auth-1' });
        return json(200, { id: 777, success: true, pending: false, is_refunded: false, amount_cents: 15000, created_at: '2026-09-02T10:00:00', order: { merchant_order_id: 'ord_1' } });
      }),
    );

    const event = await new PaymobProvider().inquire('ord_1');
    expect(event).toMatchObject({ eventType: 'transaction_inquiry', outcome: 'succeeded', providerPaymentId: '777', amountMinor: 15000, orderId: 'ord_1' });
    expect(calls[0]).toMatchObject({ url: 'https://accept.paymob.test/api/auth/tokens', body: { api_key: 'api-key' } });
    expect(calls[1]).toMatchObject({ url: 'https://accept.paymob.test/api/ecommerce/orders/transaction_inquiry', body: { auth_token: 'auth-1', merchant_order_id: 'ord_1' } });
  });

  it('reports a declined transaction as failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith('/api/auth/tokens') ? json(201, { token: 'auth-1' }) : json(200, { id: 778, success: false, pending: false, amount_cents: 15000 }),
      ),
    );
    expect((await new PaymobProvider().inquire('ord_2'))?.outcome).toBe('failed');
  });

  it('returns null when Paymob knows no transaction, when the API key is absent, or on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => (String(input).endsWith('/api/auth/tokens') ? json(201, { token: 'auth-1' }) : json(404, { detail: 'Not found.' }))));
    expect(await new PaymobProvider().inquire('ord_3')).toBeNull();

    const fetchSpy = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', fetchSpy);
    vi.mocked(getCredential).mockResolvedValueOnce(undefined);
    expect(await new PaymobProvider().inquire('ord_4')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );
    await expect(new PaymobProvider().inquire('ord_5')).resolves.toBeNull();
  });
});
