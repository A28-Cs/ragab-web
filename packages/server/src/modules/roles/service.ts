/**
 * Roles & permissions admin (§44). Reads/writes the roles + role_permissions tables.
 * System roles cannot be deleted. Changing a role's permissions takes effect on the
 * next request for affected users (permissions are loaded per-request from the DB).
 */
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { roles, rolePermissions, users } from '../../db/schema';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { toLegacyDate } from '../../lib/clock';
import type { RequestContext } from '../../http/context';
import { ALL_PERMISSIONS, type PermissionKey } from '../../security/permissions';
import { logAudit } from '../audit';
import type { Role } from '../../types';

const permissionKey = z.string().refine((v) => (ALL_PERMISSIONS as string[]).includes(v), 'unknown permission');

export const roleUpsertSchema = z.object({
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  descriptionAr: z.string().max(500).optional(),
  descriptionEn: z.string().max(500).optional(),
  permissions: z.array(permissionKey).max(ALL_PERMISSIONS.length),
  status: z.enum(['active', 'disabled']).optional(),
}).strict();

export type RoleUpsertInput = z.infer<typeof roleUpsertSchema>;

async function toDto(row: typeof roles.$inferSelect): Promise<Role> {
  const perms = row.isWildcard
    ? ('*' as const)
    : (await db().select({ key: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, row.id))).map((p) => p.key as PermissionKey);
  const [{ count }] = await db().select({ count: sql<number>`COUNT(*)::int` }).from(users).where(eq(users.roleId, row.id));
  return {
    id: row.id, nameAr: row.nameAr, nameEn: row.nameEn,
    descriptionAr: row.descriptionAr, descriptionEn: row.descriptionEn,
    permissions: perms, isSystem: row.isSystem, status: row.status,
    userCount: count, createdAt: toLegacyDate(row.createdAt),
  };
}

export async function listRoles(): Promise<Role[]> {
  const rows = await db().select().from(roles).orderBy(roles.createdAt);
  return Promise.all(rows.map(toDto));
}

export async function saveRole(ctx: RequestContext, input: RoleUpsertInput, id?: string): Promise<Role> {
  const roleId = id ?? prefixedId('role');
  await db().transaction(async (tx) => {
    if (id) {
      const [existing] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!existing) throw new NotFoundError({ code: 'ROLE_NOT_FOUND', message: { ar: 'الدور غير موجود.', en: 'Role not found.' } });
      await tx.update(roles).set({ nameAr: input.nameAr, nameEn: input.nameEn, descriptionAr: input.descriptionAr ?? '', descriptionEn: input.descriptionEn ?? '', status: input.status ?? existing.status }).where(eq(roles.id, id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    } else {
      await tx.insert(roles).values({ id: roleId, nameAr: input.nameAr, nameEn: input.nameEn, descriptionAr: input.descriptionAr ?? '', descriptionEn: input.descriptionEn ?? '', isWildcard: false, isSystem: false, status: input.status ?? 'active' });
    }
    for (const key of input.permissions) await tx.insert(rolePermissions).values({ roleId, permissionKey: key }).onConflictDoNothing();
  });
  await logAudit({ actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff', action: id ? 'role_changed' : 'role_created', resource: 'roles', resourceId: roleId, target: input.nameAr, requestId: ctx.requestId });
  const [row] = await db().select().from(roles).where(eq(roles.id, roleId)).limit(1);
  return toDto(row!);
}

export async function deleteRole(ctx: RequestContext, id: string): Promise<void> {
  const [role] = await db().select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) throw new NotFoundError({ code: 'ROLE_NOT_FOUND', message: { ar: 'الدور غير موجود.', en: 'Role not found.' } });
  if (role.isSystem) throw new BusinessRuleError({ code: 'ROLE_SYSTEM_PROTECTED', message: { ar: 'لا يمكن حذف دور نظام.', en: 'System roles cannot be deleted.' } });
  const [{ count }] = await db().select({ count: sql<number>`COUNT(*)::int` }).from(users).where(eq(users.roleId, id));
  if (count > 0) throw new BusinessRuleError({ code: 'ROLE_IN_USE', message: { ar: 'الدور مستخدم من قبل مستخدمين.', en: 'This role is assigned to users.' } });
  await db().delete(roles).where(eq(roles.id, id));
  await logAudit({ actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff', action: 'role_changed', resource: 'roles', resourceId: id, metadata: { op: 'delete' }, requestId: ctx.requestId });
}
