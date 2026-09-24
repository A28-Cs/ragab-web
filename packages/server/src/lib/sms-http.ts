/**
 * HTTP SMS gateway adapters. Two shapes cover the Egyptian market without an SDK:
 *   - `smsmisr`: SMSMisr's documented GET API (username/password/sender/mobile/message).
 *   - `generic_json`: POST {to, message, sender} with a bearer token — for any gateway
 *     that accepts JSON (Twilio-style wrappers, Vodafone Business, etc.).
 * Both normalise Egyptian numbers to international form (01xxxxxxxxx → 201xxxxxxxxx)
 * and never throw; a failed send reports `delivered:false` and is logged.
 */
import { logger } from './logger';
import type { SmsProvider } from './sms';

export interface SmsGatewayConfig {
  kind: 'smsmisr' | 'generic_json';
  url: string;
  username?: string;
  password?: string;
  senderId: string;
  /** For generic_json: sent as `Authorization: Bearer …`. */
  token?: string;
}

/** 010… / +2010… / 2010… → 2010… (SMSMisr and most Egyptian gateways want 20 + 10 digits). */
export function normaliseEgyptianMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^01[0125]\d{8}$/.test(digits)) return `2${digits}`;
  if (/^201[0125]\d{8}$/.test(digits)) return digits;
  return null;
}

export class HttpSmsProvider implements SmsProvider {
  constructor(
    private readonly cfg: SmsGatewayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, message: string): Promise<{ delivered: boolean }> {
    const log = logger().child({ component: 'sms', provider: this.cfg.kind });
    const msisdn = normaliseEgyptianMsisdn(to);
    if (!msisdn) {
      log.warn('sms skipped: not an Egyptian mobile number');
      return { delivered: false };
    }
    try {
      const res = this.cfg.kind === 'smsmisr' ? await this.sendSmsMisr(msisdn, message) : await this.sendGenericJson(msisdn, message);
      if (!res.ok) {
        log.warn({ status: res.status }, 'sms gateway rejected the message');
        return { delivered: false };
      }
      // SMSMisr answers 200 with a JSON body whose `code` is "1901" on success.
      if (this.cfg.kind === 'smsmisr') {
        const body = (await res.json().catch(() => ({}))) as { code?: string | number };
        const ok = String(body.code ?? '') === '1901';
        if (!ok) log.warn({ code: body.code }, 'smsmisr reported a failure code');
        return { delivered: ok };
      }
      return { delivered: true };
    } catch (e) {
      log.error({ err: e }, 'sms send errored');
      return { delivered: false };
    }
  }

  private sendSmsMisr(msisdn: string, message: string): Promise<Response> {
    const params = new URLSearchParams({
      environment: '1',
      username: this.cfg.username ?? '',
      password: this.cfg.password ?? '',
      sender: this.cfg.senderId,
      mobile: msisdn,
      language: '2', // Arabic (unicode)
      message,
    });
    return this.fetchImpl(`${this.cfg.url}?${params.toString()}`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  }

  private sendGenericJson(msisdn: string, message: string): Promise<Response> {
    return this.fetchImpl(this.cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}) },
      body: JSON.stringify({ to: `+${msisdn}`, message, sender: this.cfg.senderId }),
      signal: AbortSignal.timeout(10_000),
    });
  }
}
