/**
 * Paymob provider (§17, §18, §20). Uses the Unified Intention API. The webhook is
 * authenticated by HMAC-SHA512 over Paymob's documented, fixed-order concatenation of
 * transaction fields, compared with timingSafeEqual. We NEVER trust a status from the
 * client — only a signature-verified webhook (or a server-side inquiry) is authoritative.
 * No card data is ever received or stored (§18).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '../../../config/env';
import { getCredential } from '../../../lib/credentials';
import { ExternalServiceError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import type {
  CreateIntentInput,
  CreateIntentResult,
  ParsedPaymentEvent,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookVerification,
} from '../provider';

/**
 * The exact ordered set of fields Paymob concatenates to build the HMAC for a
 * transaction-processed callback. Order is significant and defined by Paymob.
 */
const HMAC_FIELD_ORDER = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Paymob stamps `created_at` as a naive ISO timestamp in Cairo local time (no zone
 * suffix). Interpret it as Africa/Cairo (DST-aware) unless an explicit offset/`Z` is
 * present, so the replay-window check compares like with like. Exported for tests.
 */
export function parsePaymobTimestamp(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (hasZone) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const asUtc = new Date(`${value}Z`);
  if (Number.isNaN(asUtc.getTime())) return undefined;
  // Offset Cairo was observing at that wall-clock instant (UTC+2 winter, UTC+3 summer).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'longOffset' }).formatToParts(asUtc);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(offset);
  const sign = m?.[1] === '-' ? -1 : 1;
  const offsetMs = sign * ((Number(m?.[2] ?? 2) * 60 + Number(m?.[3] ?? 0)) * 60_000);
  return new Date(asUtc.getTime() - offsetMs);
}

/** Build the HMAC-SHA512 hex digest for a Paymob transaction object. Exported for tests. */
export function computePaymobHmac(transaction: Record<string, unknown>, secret: string): string {
  const concatenated = HMAC_FIELD_ORDER.map((field) => {
    const value = getPath(transaction, field);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return value === undefined || value === null ? '' : String(value);
  }).join('');
  return createHmac('sha512', secret).update(concatenated).digest('hex');
}

export class PaymobProvider implements PaymentProvider {
  readonly key = 'paymob' as const;

  private async secretKey(): Promise<string> {
    const key = await getCredential('paymob', 'PAYMOB_SECRET_KEY');
    if (!key) throw new ExternalServiceError({ code: 'PAYMOB_NOT_CONFIGURED', message: { ar: 'مزود الدفع غير مهيأ.', en: 'Payment provider is not configured.' } });
    return key;
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const env = serverEnv();
    const [firstName, ...rest] = input.customer.name.split(' ');
    const body = {
      amount: input.amountMinor,
      currency: input.currency,
      payment_methods: [], // configured integration ids are resolved by Paymob from the secret key
      items: [{ name: `Order ${input.orderNumber}`, amount: input.amountMinor, quantity: 1 }],
      billing_data: {
        first_name: firstName || 'Customer',
        last_name: rest.join(' ') || '-',
        phone_number: input.customer.phone,
        email: input.customer.email || 'no-reply@ragab.sa',
      },
      extras: { merchant_order_id: input.orderId },
    };

    const secretKey = await this.secretKey();
    let res: Response;
    try {
      res = await fetch(`${env.PAYMOB_BASE_URL}/v1/intention/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Token ${secretKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new ExternalServiceError({ code: 'PAYMOB_UNREACHABLE', message: { ar: 'تعذر الاتصال بمزود الدفع.', en: 'Could not reach the payment provider.' }, cause: e });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger().error({ status: res.status, body: text.slice(0, 500) }, 'paymob intention failed');
      throw new ExternalServiceError({ code: 'PAYMOB_INTENT_FAILED', message: { ar: 'فشل إنشاء عملية الدفع.', en: 'Failed to create the payment.' } });
    }
    const data = (await res.json()) as { id?: string; client_secret?: string };
    const clientSecret = data.client_secret;
    const publicKey = (await getCredential('paymob', 'PAYMOB_PUBLIC_KEY')) ?? '';
    const redirectUrl = clientSecret ? `${env.PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}` : undefined;
    return { status: 'requires_action', providerIntentId: data.id, clientSecret, redirectUrl };
  }

  async verifyWebhook(_rawBody: string, _headers: Record<string, string>, query: Record<string, string>): Promise<WebhookVerification> {
    const secret = await getCredential('paymob', 'PAYMOB_HMAC_SECRET');
    if (!secret) return { valid: false, reason: 'HMAC secret not configured' };
    const presented = query.hmac;
    if (!presented) return { valid: false, reason: 'missing hmac' };

    // The transaction object is under `obj` in the callback body; parse from raw.
    let transaction: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(_rawBody) as { obj?: Record<string, unknown> };
      transaction = parsed.obj;
    } catch {
      return { valid: false, reason: 'invalid json' };
    }
    if (!transaction) return { valid: false, reason: 'missing transaction' };

    const expected = computePaymobHmac(transaction, secret);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(presented, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'hmac mismatch' };
    return { valid: true };
  }

  parseEvent(payload: unknown): ParsedPaymentEvent {
    const body = payload as { obj?: Record<string, any> };
    const tx = body.obj ?? {};
    const success = tx.success === true || tx.success === 'true';
    const refunded = tx.is_refunded === true || tx.is_refunded === 'true';
    const merchantOrderId = tx.order?.merchant_order_id ?? tx.order?.extras?.merchant_order_id;
    return {
      providerEventId: String(tx.id ?? ''),
      eventType: 'transaction_processed_callback',
      orderId: merchantOrderId ? String(merchantOrderId) : undefined,
      outcome: refunded ? 'refunded' : success ? 'succeeded' : tx.pending ? 'pending' : 'failed',
      providerPaymentId: tx.id ? String(tx.id) : undefined,
      amountMinor: typeof tx.amount_cents === 'number' ? tx.amount_cents : Number(tx.amount_cents) || undefined,
      occurredAt: parsePaymobTimestamp(tx.created_at),
      raw: payload,
    };
  }

  /**
   * Transaction inquiry by merchant order id (Paymob "Transaction Inquiry" API) for the
   * reconciliation job. Needs PAYMOB_API_KEY for the auth-token exchange; without it the
   * job skips the intent rather than guessing. The answer is fetched over TLS straight
   * from Paymob (server-side truth); the amount is still re-checked at confirmation.
   */
  async inquire(orderId: string): Promise<ParsedPaymentEvent | null> {
    const env = serverEnv();
    const apiKey = await getCredential('paymob', 'PAYMOB_API_KEY');
    if (!apiKey) return null;
    try {
      const auth = await fetch(`${env.PAYMOB_BASE_URL}/api/auth/tokens`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!auth.ok) throw new Error(`auth ${auth.status}`);
      const { token } = (await auth.json()) as { token?: string };
      if (!token) throw new Error('auth token missing');

      const res = await fetch(`${env.PAYMOB_BASE_URL}/api/ecommerce/orders/transaction_inquiry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_token: token, merchant_order_id: orderId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return null; // no transaction for this order yet
      if (!res.ok) throw new Error(`inquiry ${res.status}`);
      const tx = (await res.json()) as Record<string, unknown> | null;
      if (!tx || typeof tx !== 'object' || tx.id === undefined) return null;
      const event = this.parseEvent({ obj: tx });
      return { ...event, eventType: 'transaction_inquiry', orderId: event.orderId ?? orderId };
    } catch (e) {
      logger().warn({ err: e, orderId }, 'paymob inquiry failed');
      return null;
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const env = serverEnv();
    try {
      const secretKey = await this.secretKey();
      const res = await fetch(`${env.PAYMOB_BASE_URL}/api/acceptance/void_refund/refund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Token ${secretKey}` },
        body: JSON.stringify({ transaction_id: input.providerPaymentId, amount_cents: input.amountMinor }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { status: 'failed' };
      const data = (await res.json()) as { id?: string };
      return { status: 'succeeded', providerRefundId: data.id ? String(data.id) : undefined };
    } catch {
      return { status: 'failed' };
    }
  }
}
