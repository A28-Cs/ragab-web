/**
 * Webhook pipeline (§20). For a Paymob callback:
 *   1. verify the HMAC signature on the RAW body BEFORE parsing anything
 *   2. dedupe by inserting into payment_webhook_events with UNIQUE(provider, event_id)
 *      — the DB, not app logic, guarantees a replayed event is processed at most once
 *   3. process transactionally + idempotently (confirmPaymentSucceeded is a no-op the
 *      second time), then acknowledge with 200
 * A forged or replayed webhook can never confirm a payment or transition an order.
 */
import { eq } from 'drizzle-orm';
import { serverEnv } from '../../config/env';
import { db } from '../../db/client';
import { paymentWebhookEvents } from '../../db/schema';
import { RateLimitError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { enforceRateLimit, RATE_RULES } from '../../security/rateLimit';
import { getProvider } from './providers';
import { confirmPaymentSucceeded, markPaymentFailed } from './service';

export interface WebhookResult {
  accepted: boolean;
  duplicate?: boolean;
  reason?: string;
  /** Set when the caller should answer with a specific HTTP status (e.g. 429). */
  status?: number;
}

export async function handlePaymobWebhook(
  rawBody: string,
  headers: Record<string, string>,
  query: Record<string, string>,
  opts: { clientIp?: string } = {},
): Promise<WebhookResult> {
  const provider = getProvider('paymob');

  // 0. Bound the endpoint: HMAC verification is CPU work an attacker can trigger
  //    unauthenticated, so cap attempts per source before doing any of it.
  if (opts.clientIp) {
    try {
      await enforceRateLimit(RATE_RULES.webhook, `ip:${opts.clientIp}`);
    } catch (e) {
      if (e instanceof RateLimitError) {
        logger().warn({ ip: opts.clientIp }, 'paymob webhook rate limited');
        return { accepted: false, reason: 'rate limited', status: 429 };
      }
      throw e;
    }
  }

  // 1. Verify signature FIRST — reject forgeries before parsing/persisting business data.
  const verification = await provider.verifyWebhook(rawBody, headers, query);
  if (!verification.valid) {
    logger().warn({ reason: verification.reason }, 'paymob webhook rejected');
    return { accepted: false, reason: verification.reason };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { accepted: false, reason: 'invalid json' };
  }
  const event = provider.parseEvent(payload);
  if (!event.providerEventId) return { accepted: false, reason: 'missing event id' };

  // Replay window: a correctly-signed but old callback is rejected outright, so a
  // captured request cannot be resubmitted later if its first delivery was never stored.
  // Genuine late deliveries are covered by the reconciliation job, not by this path.
  const toleranceMs = serverEnv().PAYMOB_WEBHOOK_TOLERANCE_SECONDS * 1000;
  if (!event.occurredAt) return { accepted: false, reason: 'missing timestamp' };
  const skewMs = Math.abs(Date.now() - event.occurredAt.getTime());
  if (skewMs > toleranceMs) {
    logger().warn({ eventId: event.providerEventId, skewMs }, 'paymob webhook outside replay window');
    return { accepted: false, reason: 'stale event' };
  }

  // 2. Dedupe via the unique constraint. If the insert conflicts, we've seen this event.
  const inserted = await db()
    .insert(paymentWebhookEvents)
    .values({
      provider: 'paymob',
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      signatureVerified: 'true',
      payload: payload as object,
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhookEvents.id });

  if (inserted.length === 0) {
    logger().info({ eventId: event.providerEventId }, 'duplicate paymob webhook ignored');
    return { accepted: true, duplicate: true };
  }

  // 3. Process idempotently.
  try {
    if (event.orderId) {
      if (event.outcome === 'succeeded') {
        await confirmPaymentSucceeded(event.orderId, { providerPaymentId: event.providerPaymentId, amountMinor: event.amountMinor });
      } else if (event.outcome === 'failed') {
        await markPaymentFailed(event.orderId, 'paymob reported failure');
      } else {
        // 'refunded'/'pending' are recorded via the stored event only; refund state is
        // driven by our own refund flow to keep the ledger authoritative. Surface it so a
        // provider-side refund we did not initiate is visible for reconciliation.
        logger().warn({ eventId: event.providerEventId, orderId: event.orderId, outcome: event.outcome }, 'paymob webhook stored without state change');
      }
    }
    await db().update(paymentWebhookEvents).set({ processedAt: new Date() }).where(eq(paymentWebhookEvents.id, inserted[0]!.id));
  } catch (e) {
    // Record the failure; a reconciliation job / retry will reprocess. Still 200 so the
    // provider does not hammer us — the stored event is our durable work item.
    await db().update(paymentWebhookEvents).set({ processingError: (e as Error).message }).where(eq(paymentWebhookEvents.id, inserted[0]!.id));
    logger().error({ err: e, orderId: event.orderId }, 'webhook processing failed (will reconcile)');
  }

  return { accepted: true };
}
