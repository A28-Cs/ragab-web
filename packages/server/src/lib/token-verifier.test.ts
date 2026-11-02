import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { verifySocialToken } from './token-verifier';

describe('verifySocialToken', () => {
  it('returns null for empty or invalid token', async () => {
    expect(await verifySocialToken('', 'google')).toBeNull();
    expect(await verifySocialToken('invalid.token', 'google')).toBeNull();
    expect(await verifySocialToken('a.b.c', 'google')).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fake' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://securetoken.google.com/ragab-pharmacy',
        sub: '123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) - 100, // expired
      })
    ).toString('base64url');
    const fakeToken = `${header}.${payload}.fakesig`;
    expect(await verifySocialToken(fakeToken, 'google')).toBeNull();
  });

  it('verifies a validly signed RS256 token when matching certificate is mocked', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'test-mock-kid';

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const payloadObj = {
      iss: 'https://securetoken.google.com/ragab-pharmacy',
      aud: 'ragab-pharmacy',
      sub: 'mock-user-123',
      email: 'verified@example.com',
      name: 'Verified User',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(privateKey).toString('base64url');
    const token = `${header}.${payload}.${signature}`;

    // Export public key as PEM
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // Mock global fetch for cert retrieval
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('securetoken@system.gserviceaccount.com')) {
        return {
          ok: true,
          headers: new Headers({ 'cache-control': 'public, max-age=3600' }),
          json: async () => ({ [kid]: pem }),
        };
      }
      return originalFetch(url);
    });

    try {
      const result = await verifySocialToken(token, 'google');
      expect(result).not.toBeNull();
      expect(result?.email).toBe('verified@example.com');
      expect(result?.name).toBe('Verified User');
      expect(result?.sub).toBe('mock-user-123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
