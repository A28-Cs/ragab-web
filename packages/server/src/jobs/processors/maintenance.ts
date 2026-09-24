/**
 * Maintenance processors: release expired stock reservations, clean up expired tokens,
 * reconcile payment intents whose webhook never arrived. Registered as repeatable jobs
 * by the worker.
 */
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { verificationTokens, idempotencyKeys, sessions, paymentIntents, orders } from '../../db/schema';
import { releaseExpiredReservations } from '../../modules/inventory/service';
import type { ParsedPaymentEvent, ProviderKey } from '../../modules/payments/provider';
import { getProvider } from '../../modules/payments/providers';
import { confirmPaymentSucceeded, markPaymentFailed } from '../../modules/payments/service';
import { logger } from '../../lib/logger';

export async function releaseExpiredReservationsJob(): Promise<void> {
  const released = await releaseExpiredReservations();
  if (released > 0) logger().info({ released }, 'released expired reservations');
}

export async function cleanupExpiredTokensJob(): Promise<void> {
  const now = new Date();
  await db().delete(verificationTokens).where(lt(verificationTokens.expiresAt, now));
  await db().delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now));
  // Hard-expire sessions past their absolute cap (keeps the table bounded).
  await db().update(sessions).set({ revokedAt: now }).where(sql`${sessions.absoluteExpiresAt} < ${now} AND ${sessions.revokedAt} IS NULL`);
}

// ---- payment reconciliation (§20, §52) ----

/** An online intent still unresolved after this long is asked about at the provider. */
export const PAYMENT_STUCK_AFTER_MS = 15 * 60_000;
const ALL_PROVIDERS: ProviderKey[] = ['cod', 'paymob', 'manual_transfer'];

export interface ReconcileDeps {
  /** Injectable for tests; defaults to the registered provider's `inquire`. */
  inquire: (provider: ProviderKey, orderId: string) => Promise<ParsedPaymentEvent | null>;
  now: Date;
}

export interface ReconcileSummary {
  checked: number;
  captured: number;
  failed: number;
  /** Intents the provider could not settle (no transaction yet, or a capture we refused). */
  unresolved: number;
}

/**
 * Sweep online payment intents that have sat unresolved for longer than the stuck window
 * while their order is still awaiting payment, and ask the provider what happened. Only a
 * definitive answer changes state — a success runs the SAME capture path as the webhook
 * (amount check, state machine, stock commit, customer notification); a failure releases
 * the held stock. Anything else is logged for a human and retried on the next sweep.
 */
export async function reconcilePaymentsJob(deps: Partial<ReconcileDeps> = {}): Promise<ReconcileSummary> {
  const now = deps.now ?? new Date();
  const inquire =
    deps.inquire ??
    (async (provider: ProviderKey, orderId: string) => {
      const p = getProvider(provider);
      return p.inquire ? p.inquire(orderId) : null;
    });
  const providers = ALL_PROVIDERS.filter((k) => Boolean(getProvider(k).inquire));
  const summary: ReconcileSummary = { checked: 0, captured: 0, failed: 0, unresolved: 0 };
  if (providers.length === 0) return summary;

  const cutoff = new Date(now.getTime() - PAYMENT_STUCK_AFTER_MS);
  const stuck = await db()
    .select({ id: paymentIntents.id, orderId: paymentIntents.orderId, provider: paymentIntents.provider, createdAt: paymentIntents.createdAt })
    .from(paymentIntents)
    .innerJoin(orders, eq(orders.id, paymentIntents.orderId))
    .where(
      and(
        inArray(paymentIntents.status, ['created', 'requires_action', 'processing']),
        inArray(paymentIntents.provider, providers),
        lt(paymentIntents.createdAt, cutoff),
        eq(orders.paymentStatus, 'pending'),
      ),
    )
    .limit(100);
  summary.checked = stuck.length;

  for (const intent of stuck) {
    const log = logger().child({ component: 'reconcile', orderId: intent.orderId, intentId: intent.id });
    const event = await inquire(intent.provider as ProviderKey, intent.orderId);
    if (event?.outcome === 'succeeded') {
      try {
        await confirmPaymentSucceeded(intent.orderId, { providerPaymentId: event.providerPaymentId, amountMinor: event.amountMinor });
        await db().update(paymentIntents).set({ status: 'succeeded', version: sql`${paymentIntents.version} + 1` }).where(eq(paymentIntents.id, intent.id));
        summary.captured += 1;
      } catch (e) {
        // e.g. PAYMENT_AMOUNT_MISMATCH — money moved but not what we charged. Never auto-apply.
        log.error({ err: e }, 'reconcile: provider reports success but capture was refused — needs a human');
        summary.unresolved += 1;
      }
    } else if (event?.outcome === 'failed') {
      await markPaymentFailed(intent.orderId, 'reconciled: provider reports failure');
      await db().update(paymentIntents).set({ status: 'failed', version: sql`${paymentIntents.version} + 1` }).where(eq(paymentIntents.id, intent.id));
      summary.failed += 1;
    } else {
      summary.unresolved += 1;
      log.warn({ ageMinutes: Math.round((now.getTime() - intent.createdAt.getTime()) / 60_000), outcome: event?.outcome ?? 'none' }, 'reconcile: payment intent still unresolved');
    }
  }

  if (summary.checked > 0) logger().info(summary, 'payment reconciliation sweep');
  return summary;
}
