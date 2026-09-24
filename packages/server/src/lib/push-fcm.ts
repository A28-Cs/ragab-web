/**
 * Firebase Cloud Messaging (HTTP v1) push adapter — no SDK. Authenticates with a service
 * account (RS256-signed JWT → OAuth2 access token, cached until shortly before expiry)
 * and sends one message per device token. Tokens FCM reports as UNREGISTERED / invalid
 * are returned in `invalidTokens` so the caller prunes them (§26). Never throws.
 *
 * Config: FCM_SERVICE_ACCOUNT_JSON = the service-account JSON (raw or base64). The
 * project id comes from that file.
 */
import { createSign } from 'node:crypto';
import { logger } from './logger';
import type { PushMessage, PushProvider, PushResult } from './push';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(text) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FCM service account JSON is missing project_id / client_email / private_key');
  }
  return parsed as ServiceAccount;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Build the signed JWT Google exchanges for an access token (RFC 7523 flow). */
export function buildAssertion(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(sa.private_key));
  return `${header}.${claims}.${signature}`;
}

/** Errors FCM returns for tokens that will never work again. */
const DEAD_TOKEN_ERRORS = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND']);

export class FcmPushProvider implements PushProvider {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly sa: ServiceAccount,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value;
    const res = await this.fetchImpl(this.sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: buildAssertion(this.sa) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }

  async send(msg: PushMessage): Promise<PushResult> {
    const log = logger().child({ component: 'push', provider: 'fcm' });
    let bearer: string;
    try {
      bearer = await this.accessToken();
    } catch (e) {
      log.error({ err: e }, 'fcm auth failed');
      return { delivered: 0, invalidTokens: [] };
    }
    const url = `https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`;
    const invalidTokens: string[] = [];
    let delivered = 0;
    // FCM v1 has no multicast endpoint: one request per token, bounded concurrency.
    const batches = chunk(msg.tokens, 20);
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (token) => {
          try {
            const res = await this.fetchImpl(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
              body: JSON.stringify({
                message: {
                  token,
                  // Arabic-first copy; the app renders the notification body as-is.
                  notification: { title: msg.titleAr, body: msg.bodyAr },
                  data: { ...(msg.data ?? {}), titleEn: msg.titleEn, bodyEn: msg.bodyEn },
                  android: { priority: 'high', notification: { channel_id: 'orders' } },
                  apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
                },
              }),
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
              delivered += 1;
              return;
            }
            const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
            const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? '';
            if (DEAD_TOKEN_ERRORS.has(code)) invalidTokens.push(token);
            else log.warn({ status: res.status, code }, 'fcm send failed');
          } catch (e) {
            log.warn({ err: e }, 'fcm send errored');
          }
        }),
      );
    }
    return { delivered, invalidTokens };
  }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
