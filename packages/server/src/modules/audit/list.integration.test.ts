/**
 * P2-11: the audit listing carries everything the detail drawer shows — the touched row
 * id and the request forensics (request id, IP, user agent) — not just the headline.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { logAudit } from './index';
import { listAuditLogs } from './list';

const REQUEST_ID = 'req_audit_dto_test';

afterAll(async () => {
  await closeDb();
});

describe('listAuditLogs (integration)', () => {
  it('exposes resourceId, requestId, ipAddress and userAgent on every entry', async () => {
    await logAudit({
      actorId: 'user_admin',
      actorName: 'مالك المتجر',
      actorRole: 'owner',
      action: 'order_status_changed',
      resource: 'orders',
      resourceId: 'ord_audit_dto',
      target: 'طلب #MHS-AUDIT',
      requestId: REQUEST_ID,
      ipAddress: '203.0.113.7',
      userAgent: 'Ragab-E2E/1.0',
      metadata: { to: 'preparing' },
    });

    const page = await listAuditLogs({ limit: 20, resource: 'orders' });
    const entry = page.items.find((e) => e.requestId === REQUEST_ID);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      actorId: 'user_admin',
      resource: 'orders',
      resourceId: 'ord_audit_dto',
      target: 'طلب #MHS-AUDIT',
      ipAddress: '203.0.113.7',
      userAgent: 'Ragab-E2E/1.0',
      metadata: { to: 'preparing' },
      result: 'success',
    });

    // The row is real (hash-chained) — not a DTO-only artefact.
    const [row] = await db().select().from(auditLogs).where(eq(auditLogs.requestId, REQUEST_ID)).limit(1);
    expect(row?.resourceId).toBe('ord_audit_dto');
  });
});
