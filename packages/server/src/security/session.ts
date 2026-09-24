/**
 * Session lifecycle (§10). Opaque tokens, DB-authoritative (so revocation is instant),
 * sliding expiry with an absolute cap. Resolving a session also loads the user's
 * effective permission set, so authorization on every request reflects the CURRENT
 * role — a role change or logout-everywhere takes effect on the very next request.
 */
import { and, eq, gt, isNull, sql as dsql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { db } from '../db/client';
import {
  sessions,
  users,
  roles,
  rolePermissions,
  userDirectPermissions,
} from '../db/schema';
import { serverEnv } from '../config/env';
import { generateToken, hashToken } from './tokens';
import { expandPermissions, type PermissionKey } from './permissions';
import type { Clock } from '../lib/clock';
import { systemClock } from '../lib/clock';

export const SESSION_COOKIE = 'ragab_session';

export interface DeviceInfo {
  device?: string;
  deviceType?: string;
  browser?: string;
  approxLocation?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  isStaff: boolean;
  roleId: string | null;
  permissions: Set<PermissionKey>;
  user: typeof users.$inferSelect;
}

/** Create a session, returning the RAW token (shown once) and the stored row. */
export async function createSession(
  userId: string,
  device: DeviceInfo,
  exec: DbExecutor = db(),
  clock: Clock = systemClock,
  opts: { absoluteTtlSeconds?: number } = {},
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const env = serverEnv();
  const token = generateToken(32);
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000);
  // Native sessions get a longer absolute cap (§7): re-login on a phone is far costlier
  // than in a browser. The sliding window is unchanged; only the hard ceiling moves.
  const absoluteTtl = opts.absoluteTtlSeconds ?? env.SESSION_ABSOLUTE_TTL_SECONDS;
  const absoluteExpiresAt = new Date(now.getTime() + absoluteTtl * 1000);

  const [row] = await exec
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      device: device.device ?? 'Unknown',
      deviceType: device.deviceType ?? 'desktop',
      browser: device.browser ?? '',
      approxLocation: device.approxLocation,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      lastActiveAt: now,
      expiresAt,
      absoluteExpiresAt,
    })
    .returning({ id: sessions.id });

  return { token, sessionId: row!.id, expiresAt };
}

/** Load a user's effective permissions from their role + direct grants. */
export async function loadPermissions(
  userId: string,
  roleId: string | null,
  exec: DbExecutor = db(),
): Promise<Set<PermissionKey>> {
  if (!roleId) return new Set();
  const [role] = await exec.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role || role.status !== 'active') return new Set();

  if (role.isWildcard) return expandPermissions('*');

  const rolePerms = await exec
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  const directPerms = await exec
    .select({ key: userDirectPermissions.permissionKey })
    .from(userDirectPermissions)
    .where(eq(userDirectPermissions.userId, userId));

  return expandPermissions(
    rolePerms.map((r) => r.key as PermissionKey),
    directPerms.map((d) => d.key as PermissionKey),
  );
}

/**
 * Resolve a raw session token to a principal, or null if missing/expired/revoked.
 * Enforces both sliding and absolute expiry, and refreshes the sliding window.
 */
export async function resolveSession(
  rawToken: string,
  exec: DbExecutor = db(),
  clock: Clock = systemClock,
): Promise<AuthenticatedPrincipal | null> {
  const now = clock.now();
  const [session] = await exec
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .limit(1);
  if (!session) return null;

  const [user] = await exec.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;
  if (user.status === 'disabled' || user.status === 'suspended') return null;

  const permissions = await loadPermissions(user.id, user.roleId, exec);

  return {
    userId: user.id,
    sessionId: session.id,
    isStaff: user.isStaff,
    roleId: user.roleId,
    permissions,
    user,
  };
}

/** Slide the expiry forward on activity (throttled to avoid a write on every request). */
export async function touchSession(
  sessionId: string,
  exec: DbExecutor = db(),
  clock: Clock = systemClock,
): Promise<void> {
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + serverEnv().SESSION_TTL_SECONDS * 1000);
  await exec
    .update(sessions)
    .set({ lastActiveAt: now, expiresAt })
    .where(and(eq(sessions.id, sessionId), dsql`${sessions.lastActiveAt} < ${new Date(now.getTime() - 60_000)}`));
}

export async function revokeSession(sessionId: string, exec: DbExecutor = db()): Promise<void> {
  await exec.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Logout everywhere / on role change (§10). */
export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
  exec: DbExecutor = db(),
): Promise<void> {
  const cond = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), dsql`${sessions.id} <> ${exceptSessionId}`)
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  await exec.update(sessions).set({ revokedAt: new Date() }).where(cond);
}
