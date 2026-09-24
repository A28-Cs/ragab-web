/**
 * Audit logging (§35). Append-only with a tamper-evident hash chain: each entry's
 * `entryHash = sha256(prevHash + canonicalPayload)`. Because the table also blocks
 * UPDATE/DELETE (trigger in 0001_integrity.sql), an attacker who edits a row breaks
 * the chain AND is rejected by the DB. Writing audit never throws into the caller's
 * happy path — a logging failure is logged, not propagated.
 */
import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { db } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { logger } from '../../lib/logger';

export interface AuditInput {
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  target?: string | null;
  result?: 'success' | 'failure';
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, string>;
  storeId?: string;
}

function canonical(input: AuditInput, prevHash: string, at: string): string {
  return JSON.stringify({
    prevHash,
    at,
    actorId: input.actorId ?? null,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    result: input.result ?? 'success',
    metadata: input.metadata ?? {},
  });
}

/**
 * Append an audit entry. Accepts an executor so it can join the SAME transaction as
 * the action it records (so an admin action and its audit row commit atomically).
 */
export async function logAudit(input: AuditInput, exec: DbExecutor = db()): Promise<void> {
  try {
    const storeId = input.storeId ?? DEFAULT_STORE_ID;
    const [prev] = await exec
      .select({ entryHash: auditLogs.entryHash })
      .from(auditLogs)
      .where(eq(auditLogs.storeId, storeId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const prevHash = prev?.entryHash ?? 'GENESIS';
    const at = new Date().toISOString();
    const entryHash = createHash('sha256').update(canonical(input, prevHash, at)).digest('hex');

    await exec.insert(auditLogs).values({
      storeId,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      target: input.target ?? null,
      result: input.result ?? 'success',
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
      prevHash,
      entryHash,
      // Pin createdAt to the exact timestamp folded into the hash so the chain
      // re-verifies deterministically (verifyAuditChain rehashes from createdAt).
      createdAt: new Date(at),
    });
  } catch (e) {
    logger().error({ err: e, action: input.action }, 'audit write failed');
  }
}

/** Verify the hash chain integrity for a store — used by an ops/security check. */
export async function verifyAuditChain(storeId = DEFAULT_STORE_ID): Promise<{ ok: boolean; brokenAt?: string }> {
  const rows = await db()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.storeId, storeId))
    .orderBy(auditLogs.createdAt);
  let prevHash = 'GENESIS';
  for (const row of rows) {
    const at = row.createdAt.toISOString();
    const expected = createHash('sha256')
      .update(
        canonical(
          {
            actorId: row.actorId,
            actorName: row.actorName,
            actorRole: row.actorRole,
            action: row.action,
            resource: row.resource,
            resourceId: row.resourceId,
            result: row.result,
            metadata: (row.metadata as Record<string, string>) ?? {},
          },
          prevHash,
          at,
        ),
      )
      .digest('hex');
    if (row.prevHash !== prevHash) return { ok: false, brokenAt: row.id };
    prevHash = row.entryHash;
  }
  return { ok: true };
}

export { listAuditLogs } from './list';
