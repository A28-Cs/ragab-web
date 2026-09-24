/** Audit log listing for the admin Audit module (§35). Read-only, permission-gated. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { buildPage, decodeCursor, type Page } from '../../lib/pagination';
import { toLegacyTimestamp } from '../../lib/clock';
import type { AuditLogEntry } from '../../types';

export async function listAuditLogs(opts: { limit: number; cursor?: string; resource?: string }): Promise<Page<AuditLogEntry>> {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts.resource) conds.push(eq(auditLogs.resource, opts.resource));
  const cursor = decodeCursor(opts.cursor);
  if (cursor) conds.push(sql`${auditLogs.id} < ${cursor}`);
  const rows = await db().select().from(auditLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLogs.id)).limit(opts.limit + 1);
  const page = buildPage(rows, opts.limit, (r) => r.id);
  return {
    items: page.items.map((r) => ({
      id: r.id, actorId: r.actorId ?? '', actorName: r.actorName, actorRole: r.actorRole,
      action: r.action, resource: r.resource, resourceId: r.resourceId ?? undefined, target: r.target ?? undefined,
      timestamp: toLegacyTimestamp(r.createdAt), result: r.result, metadata: (r.metadata as Record<string, string>) ?? undefined,
      requestId: r.requestId ?? undefined, ipAddress: r.ipAddress ?? undefined, userAgent: r.userAgent ?? undefined,
    })),
    nextCursor: page.nextCursor, hasMore: page.hasMore,
  };
}
