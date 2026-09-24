/**
 * Integrations admin (§43). Reads/toggles rows in the `integrations` table. Toggling is
 * audited. Read requires `integrations:view`, toggle `integrations:edit` (route-enforced).
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { integrations } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { NotFoundError } from '../../lib/errors';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';

export interface IntegrationDto {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  enabled: boolean;
  connected: boolean;
}

export async function listIntegrations(): Promise<IntegrationDto[]> {
  const rows = await db().select().from(integrations).where(eq(integrations.storeId, DEFAULT_STORE_ID)).orderBy(integrations.category, integrations.nameAr);
  return rows.map((r) => ({
    id: r.id, nameAr: r.nameAr, nameEn: r.nameEn, descriptionAr: r.descriptionAr, descriptionEn: r.descriptionEn,
    category: r.category, enabled: r.enabled, connected: r.connected,
  }));
}

export async function toggleIntegration(ctx: RequestContext, id: string, enabled: boolean): Promise<void> {
  const [existing] = await db().select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.storeId, DEFAULT_STORE_ID))).limit(1);
  if (!existing) throw new NotFoundError({ code: 'INTEGRATION_NOT_FOUND', message: { ar: 'التكامل غير موجود.', en: 'Integration not found.' } });
  await db().update(integrations).set({ enabled }).where(eq(integrations.id, id));
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'settings_changed', resource: 'integrations', resourceId: id, metadata: { enabled: String(enabled) }, requestId: ctx.requestId,
  });
}
