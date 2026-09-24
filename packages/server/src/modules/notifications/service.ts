/** In-app notifications (§23). Customer-scoped list + mark-read. Dispatch is queued. */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { notifications, notificationPreferences } from '../../db/schema';
import { AuthenticationError } from '../../lib/errors';
import { toLegacyTimestamp } from '../../lib/clock';
import type { RequestContext } from '../../http/context';
import type { NotificationPreferencesInput } from './schema';

function requireUser(ctx: RequestContext): string {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  return ctx.principal.userId;
}

export async function listNotifications(ctx: RequestContext) {
  const userId = requireUser(ctx);
  const rows = await db().select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
  return rows.map((r) => ({
    id: r.id, category: r.category, titleAr: r.titleAr, titleEn: r.titleEn, bodyAr: r.bodyAr, bodyEn: r.bodyEn,
    createdAt: toLegacyTimestamp(r.createdAt), read: r.read, href: r.href ?? undefined,
  }));
}

export async function markRead(ctx: RequestContext, id: string): Promise<void> {
  const userId = requireUser(ctx);
  await db().update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllRead(ctx: RequestContext): Promise<void> {
  const userId = requireUser(ctx);
  await db().update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
}

// ---- preferences (§23/§26) ----

type NotificationPreferencesDto = {
  orderEmail: boolean; orderSms: boolean; orderPush: boolean;
  promoEmail: boolean; promoPush: boolean;
  securityEmail: boolean; securityPush: boolean;
};

function toPreferencesDto(row: typeof notificationPreferences.$inferSelect): NotificationPreferencesDto {
  return {
    orderEmail: row.orderEmail, orderSms: row.orderSms, orderPush: row.orderPush,
    promoEmail: row.promoEmail, promoPush: row.promoPush,
    securityEmail: row.securityEmail, securityPush: row.securityPush,
  };
}

/** Fetch the row, materialising defaults on first access (register seeds one, but be safe). */
async function ensurePreferences(userId: string): Promise<typeof notificationPreferences.$inferSelect> {
  await db().insert(notificationPreferences).values({ userId }).onConflictDoNothing();
  const [row] = await db().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return row!;
}

export async function getPreferences(ctx: RequestContext): Promise<NotificationPreferencesDto> {
  const userId = requireUser(ctx);
  return toPreferencesDto(await ensurePreferences(userId));
}

export async function updatePreferences(ctx: RequestContext, input: NotificationPreferencesInput): Promise<NotificationPreferencesDto> {
  const userId = requireUser(ctx);
  await ensurePreferences(userId);
  const patch: Partial<NotificationPreferencesDto> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) (patch as Record<string, boolean>)[key] = value;
  }
  if (Object.keys(patch).length > 0) {
    await db().update(notificationPreferences).set(patch).where(eq(notificationPreferences.userId, userId));
  }
  const [row] = await db().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return toPreferencesDto(row!);
}
