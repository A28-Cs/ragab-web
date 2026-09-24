import { describe, expect, it, vi } from 'vitest';
import { HttpSmsProvider, normaliseEgyptianMsisdn } from './sms-http';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('normaliseEgyptianMsisdn', () => {
  it('normalises local, international and formatted Egyptian mobiles', () => {
    expect(normaliseEgyptianMsisdn('01012345678')).toBe('201012345678');
    expect(normaliseEgyptianMsisdn('+20 101 234 5678')).toBe('201012345678');
    expect(normaliseEgyptianMsisdn('201512345678')).toBe('201512345678');
  });

  it('rejects non-Egyptian or malformed numbers', () => {
    expect(normaliseEgyptianMsisdn('0101234567')).toBeNull();
    expect(normaliseEgyptianMsisdn('+966501234567')).toBeNull();
    expect(normaliseEgyptianMsisdn('01312345678')).toBeNull();
  });
});

describe('HttpSmsProvider', () => {
  it('smsmisr: posts the documented params and treats code 1901 as delivered', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { code: '1901', SMSID: '1' }));
    const p = new HttpSmsProvider(
      { kind: 'smsmisr', url: 'https://smsmisr.example/api/SMS', username: 'u', password: 'p', senderId: 'Ragab' },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(p.send('01012345678', 'مرحبا')).resolves.toEqual({ delivered: true });
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get('mobile')).toBe('201012345678');
    expect(url.searchParams.get('sender')).toBe('Ragab');
    expect(url.searchParams.get('language')).toBe('2');
    expect(url.searchParams.get('message')).toBe('مرحبا');
  });

  it('smsmisr: any other code is not delivered', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { code: '1904' }));
    const p = new HttpSmsProvider({ kind: 'smsmisr', url: 'https://smsmisr.example/api/SMS', senderId: 'Ragab' }, fetchImpl as unknown as typeof fetch);
    await expect(p.send('01012345678', 'x')).resolves.toEqual({ delivered: false });
  });

  it('generic_json: sends a bearer token and an E.164 recipient', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { ok: true }));
    const p = new HttpSmsProvider({ kind: 'generic_json', url: 'https://gw.example/send', token: 'secret', senderId: 'Ragab' }, fetchImpl as unknown as typeof fetch);
    await expect(p.send('01012345678', 'x')).resolves.toEqual({ delivered: true });
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toEqual({ to: '+201012345678', message: 'x', sender: 'Ragab' });
  });

  it('skips the gateway for a non-Egyptian number and never throws on network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    });
    const p = new HttpSmsProvider({ kind: 'generic_json', url: 'https://gw.example/send', senderId: 'Ragab' }, fetchImpl as unknown as typeof fetch);
    await expect(p.send('+966501234567', 'x')).resolves.toEqual({ delivered: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(p.send('01012345678', 'x')).resolves.toEqual({ delivered: false });
  });
});
