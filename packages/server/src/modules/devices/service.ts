/**
 * Device token registry (§26). One row per FCM registration token (globally unique).
 * Registration is an upsert on `token`, so a device handed to another user, or a token
 * rotated by FCM, moves to the current owner instead of duplicating. Logout deletes the
 * token so a signed-out device stops receiving that user's pushes. The stable per-install
 * `X-Device-Id` (ctx.deviceId) is recorded for diagnostics/dedupe.
 */
import { and, eq, ne } from 'drizzle-orm';
import type { RequestContext } from '../../http/context';
import { db } from '../../db/client';
import { deviceTokens } from '../../db/schema';
import { AuthenticationError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import type { RegisterDeviceInput } from './schema';

function requireUser(ctx: RequestContext): string {
  if (!ctx.principal) throw new AuthenticationError({ message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' } });
  return ctx.principal.userId;
}

export async function registerDevice(ctx: RequestContext, input: RegisterDeviceInput): Promise<{ ok: true }> {
  const userId = requireUser(ctx);
  const now = new Date();
  await db().transaction(async (tx) => {
    // A rotated FCM token on the same install REPLACES the previous row — one row per
    // (user, device), so a dead token never lingers next to the live one (§26).
    if (ctx.deviceId) {
      await tx.delete(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.deviceId, ctx.deviceId), ne(deviceTokens.token, input.token)));
    }
    await tx
      .insert(deviceTokens)
      .values({
        id: prefixedId('dev'),
        userId,
        token: input.token,
        platform: input.platform,
        deviceId: ctx.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: { userId, platform: input.platform, deviceId: ctx.deviceId ?? null, appVersion: input.appVersion ?? null, lastSeenAt: now, updatedAt: now },
      });
  });
  return { ok: true };
}

/** Remove a token (logout cleanup). Scoped to the caller so one user can't delete another's. */
export async function unregisterDevice(ctx: RequestContext, token: string): Promise<{ ok: true }> {
  const userId = requireUser(ctx);
  await db().delete(deviceTokens).where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)));
  return { ok: true };
}

/** Internal: active tokens for a user, used by the push delivery channel. */
export async function tokensForUser(userId: string): Promise<{ token: string; platform: string }[]> {
  return db().select({ token: deviceTokens.token, platform: deviceTokens.platform }).from(deviceTokens).where(eq(deviceTokens.userId, userId));
}

/** Internal: prune a token FCM reported as unregistered/invalid. */
export async function pruneToken(token: string): Promise<void> {
  await db().delete(deviceTokens).where(eq(deviceTokens.token, token));
}
