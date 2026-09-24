/**
 * Maps a users row to the frontend `User` DTO (contract-preserving). Sensitive columns
 * (passwordHash, storeId internals) are never projected. Timestamps become the legacy
 * "YYYY-MM-DD HH:mm" string plus an ISO companion.
 */
import type { users } from '../../db/schema';
import type { Language, User } from '../../types';
import type { PermissionKey } from '../../security/permissions';
import { toLegacyTimestamp } from '../../lib/clock';

type UserRow = typeof users.$inferSelect;

export function toUserDto(row: UserRow, directPermissions: PermissionKey[] = []): User {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    defaultVillage: row.defaultVillage,
    avatar: row.avatar ?? undefined,
    houseImage: row.houseImage ?? undefined,
    dateOfBirth: row.dateOfBirth ?? undefined,
    preferredLanguage: (row.preferredLanguage as Language) ?? undefined,
    status: row.status,
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    twoFactorEnabled: row.twoFactorEnabled,
    createdAt: toLegacyTimestamp(row.createdAt),
    lastLoginAt: row.lastLoginAt ? toLegacyTimestamp(row.lastLoginAt) : undefined,
    roleId: row.roleId ?? undefined,
    directPermissions: directPermissions.length ? directPermissions : undefined,
  };
}
