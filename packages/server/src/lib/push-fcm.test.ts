import { describe, expect, it, vi } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { buildAssertion, FcmPushProvider, parseServiceAccount } from './push-fcm';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = {
  project_id: 'ragab-test',
  client_email: 'fcm@ragab-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('parseServiceAccount', () => {
  it('accepts raw JSON and base64-encoded JSON', () => {
    expect(parseServiceAccount(JSON.stringify(SA)).project_id).toBe('ragab-test');
    expect(parseServiceAccount(Buffer.from(JSON.stringify(SA)).toString('base64')).client_email).toBe(SA.client_email);
  });

  it('rejects a document missing the required fields', () => {
    expect(() => parseServiceAccount(JSON.stringify({ project_id: 'x' }))).toThrow(/missing/);
  });
});

describe('buildAssertion', () => {
  it('produces an RS256 JWT signed by the service-account key with the messaging scope', () => {
    const jwt = buildAssertion(SA, 1_700_000_000);
    const [h, c, s] = jwt.split('.');
    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(decode(h!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = decode(c!);
    expect(claims.iss).toBe(SA.client_email);
    expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(Number(claims.exp) - Number(claims.iat)).toBe(3600);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${c}`);
    expect(verifier.verify(publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
  });
});

describe('FcmPushProvider', () => {
  const message = { tokens: ['good', 'dead', 'flaky'], titleAr: 'تحديث', titleEn: 'Update', bodyAr: 'نص', bodyEn: 'body', data: { type: 'order', orderNumber: 'MHS-1' } };

  function fakeFetch() {
    const calls: { url: string; body: any; auth?: string }[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (url.endsWith('/token')) {
        calls.push({ url, body: String(init?.body) });
        return jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body, auth: headers.authorization });
      switch (body.message.token) {
        case 'good':
          return jsonResponse(200, { name: 'projects/ragab-test/messages/1' });
        case 'dead':
          return jsonResponse(404, { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } });
        default:
          return jsonResponse(503, { error: { status: 'UNAVAILABLE' } });
      }
    });
    return { fetchImpl, calls };
  }

  it('exchanges the assertion once, sends per token, and reports only dead tokens as invalid', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const provider = new FcmPushProvider(SA, fetchImpl as unknown as typeof fetch);

    const res = await provider.send(message);
    expect(res).toEqual({ delivered: 1, invalidTokens: ['dead'] });

    const sends = calls.filter((c) => c.url.includes('/messages:send'));
    expect(sends).toHaveLength(3);
    expect(sends[0]!.url).toBe('https://fcm.googleapis.com/v1/projects/ragab-test/messages:send');
    expect(sends[0]!.auth).toBe('Bearer tok-1');
    expect(sends[0]!.body.message.notification).toEqual({ title: 'تحديث', body: 'نص' });
    expect(sends[0]!.body.message.data).toMatchObject({ type: 'order', orderNumber: 'MHS-1', titleEn: 'Update', bodyEn: 'body' });
    expect(sends[0]!.body.message.android.notification.channel_id).toBe('orders');

    // A second send within the token lifetime reuses the cached access token.
    await provider.send({ ...message, tokens: ['good'] });
    expect(calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1);
  });

  it('never throws when the token exchange fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'invalid_grant' }));
    const provider = new FcmPushProvider(SA, fetchImpl as unknown as typeof fetch);
    await expect(provider.send(message)).resolves.toEqual({ delivered: 0, invalidTokens: [] });
  });
});
