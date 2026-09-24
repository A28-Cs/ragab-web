/**
 * Staff (users) admin (§43, §46). Staff are `users` with isStaff=true and a roleId.
 * Creating/updating staff is the ONLY path that can grant a role — registration never
 * can (least privilege). Role assignment revokes the target's other sessions so the new
 * (or reduced) permissions take effect immediately.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { users, roles } from '../../db/schema';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { toLegacyTimestamp } from '../../lib/clock';
import { hashPassword } from '../../security/password';
import { revokeAllSessions } from '../../security/session';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';
import type { StaffUser } from '../../types';

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().regex(/^01[0125]\d{8}$/),
  password: z.string().min(8).max(200),
  roleId: z.string().min(1).max(64),
}).strict();

export const staffUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.string().min(1).max(64).optional(),
  status: z.enum(['active', 'suspended', 'disabled']).optional(),
}).strict();

function toDto(row: typeof users.$inferSelect): StaffUser {
  return {
    id: row.id, name: row.name, email: row.email ?? '', phone: row.phone,
    avatar: row.avatar ?? undefined, roleId: row.roleId ?? '', directPermissions: [],
    status: (row.status === 'pending_verification' ? 'active' : row.status) as StaffUser['status'],
    lastLoginAt: row.lastLoginAt ? toLegacyTimestamp(row.lastLoginAt) : undefined,
    createdAt: toLegacyTimestamp(row.createdAt),
  };
}

async function assertRoleExists(roleId: string): Promise<void> {
  const [role] = await db().select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new BusinessRuleError({ code: 'ROLE_NOT_FOUND', message: { ar: 'الدور غير موجود.', en: 'Role not found.' } });
}

export async function listStaff(): Promise<StaffUser[]> {
  const rows = await db().select().from(users).where(eq(users.isStaff, true)).orderBy(desc(users.createdAt));
  return rows.map(toDto);
}

export async function createStaff(ctx: RequestContext, input: z.infer<typeof staffCreateSchema>): Promise<StaffUser> {
  await assertRoleExists(input.roleId);
  const [dupe] = await db().select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
  if (dupe) throw new BusinessRuleError({ code: 'PHONE_TAKEN', message: { ar: 'رقم الهاتف مستخدم.', en: 'Phone already in use.' } });
  const id = prefixedId('user');
  await db().insert(users).values({
    id, name: input.name, email: input.email, phone: input.phone,
    passwordHash: await hashPassword(input.password), defaultVillage: '',
    status: 'active', isStaff: true, roleId: input.roleId, emailVerified: true, phoneVerified: true,
  });
  await logAudit({ actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff', action: 'user_created', resource: 'users', resourceId: id, target: input.name, requestId: ctx.requestId });
  const [row] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return toDto(row!);
}

export async function updateStaff(ctx: RequestContext, id: string, input: z.infer<typeof staffUpdateSchema>): Promise<StaffUser> {
  const [existing] = await db().select().from(users).where(and(eq(users.id, id), eq(users.isStaff, true))).limit(1);
  if (!existing) throw new NotFoundError({ code: 'STAFF_NOT_FOUND', message: { ar: 'الموظف غير موجود.', en: 'Staff member not found.' } });
  if (input.roleId) await assertRoleExists(input.roleId);
  await db().update(users).set({
    name: input.name ?? existing.name,
    roleId: input.roleId ?? existing.roleId,
    status: input.status ?? existing.status,
  }).where(eq(users.id, id));
  // A permission-affecting change forces re-auth on the target's other sessions.
  if (input.roleId || input.status) await revokeAllSessions(id);
  await logAudit({ actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff', action: 'user_updated', resource: 'users', resourceId: id, metadata: { roleId: input.roleId ?? '', status: input.status ?? '' }, requestId: ctx.requestId });
  const [row] = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return toDto(row!);
}
