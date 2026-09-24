/**
 * Paymob webhook (§20). Standalone handler (NOT defineRoute) because HMAC verification
 * needs the RAW request body, not a parsed/validated object. No CSRF/auth — the HMAC
 * signature IS the authentication. Always returns 200 once the (verified) event is
 * durably stored, so the provider stops retrying; processing failures reconcile async.
 */
import { handlePaymobWebhook } from '@ragab/server/modules/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const clientIp = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || undefined;
  const result = await handlePaymobWebhook(raw, headers, query, { clientIp });
  if (!result.accepted) {
    // Reject forgeries with 400 (429 when rate limited) so they are visible in
    // provider dashboards/logs.
    return new Response(JSON.stringify({ success: false, error: { code: result.status === 429 ? 'RATE_LIMITED' : 'WEBHOOK_REJECTED' } }), {
      status: result.status ?? 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ success: true, duplicate: result.duplicate ?? false }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
