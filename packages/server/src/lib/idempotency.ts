/**
 * Idempotency (§19). Claim-then-execute over the `idempotency_keys` table.
 *   - First request with a key: INSERT wins, status 'in_progress', we run the handler,
 *     then persist the response.
 *   - Retry with the SAME key and SAME body: replay the stored response (no re-execution).
 *   - Same key, DIFFERENT body: reject as key reuse (a client bug or an attack).
 *   - Same key while the first is still in flight: reject as in-progress.
 * The UNIQUE(user, key, scope) constraint makes the claim atomic across instances.
 */
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { idempotencyKeys } from '../db/schema';
import { ConflictError } from './errors';

const TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyClaim {
  id: string;
  replay: boolean;
  responseStatus?: number;
  responseBody?: unknown;
}

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export async function claimIdempotencyKey(args: {
  userId: string | null;
  key: string;
  scope: string;
  body: unknown;
}): Promise<IdempotencyClaim> {
  const requestHash = hashBody(args.body);
  const expiresAt = new Date(Date.now() + TTL_MS);

  const inserted = await db()
    .insert(idempotencyKeys)
    .values({
      userId: args.userId,
      key: args.key,
      scope: args.scope,
      requestHash,
      status: 'in_progress',
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length > 0) {
    return { id: inserted[0]!.id, replay: false };
  }

  // Conflict: a row already exists for (user, key, scope).
  const [existing] = await db()
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, args.key),
        eq(idempotencyKeys.scope, args.scope),
        args.userId ? eq(idempotencyKeys.userId, args.userId) : eq(idempotencyKeys.userId, idempotencyKeys.userId),
      ),
    )
    .limit(1);

  if (!existing) {
    // Extremely unlikely race where the row vanished; treat as fresh.
    return claimIdempotencyKey(args);
  }

  if (existing.requestHash !== requestHash) {
    throw new ConflictError({
      code: 'IDEMPOTENCY_KEY_REUSE',
      message: {
        ar: 'تم استخدام مفتاح العملية بمحتوى مختلف.',
        en: 'This idempotency key was already used with a different request.',
      },
    });
  }

  if (existing.status === 'completed') {
    return {
      id: existing.id,
      replay: true,
      responseStatus: existing.responseStatus ?? 200,
      responseBody: existing.responseBody,
    };
  }

  // Still in progress → the client retried too fast.
  throw new ConflictError({
    code: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
    message: {
      ar: 'العملية قيد المعالجة بالفعل. يرجى الانتظار.',
      en: 'A request with this key is still being processed.',
    },
  });
}

export async function completeIdempotencyKey(
  claim: IdempotencyClaim,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await db()
    .update(idempotencyKeys)
    .set({ status: 'completed', responseStatus, responseBody, completedAt: new Date() })
    .where(eq(idempotencyKeys.id, claim.id));
}
