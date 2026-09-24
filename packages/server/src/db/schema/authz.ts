/**
 * Authorization (§11, §44). Roles hold a set of permission keys; users get a role
 * plus optional direct grants. The permission catalog is seeded from the shared
 * RESOURCES/DEFAULT_ROLES so the client UI and the server enforcement agree exactly.
 */
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { DEFAULT_STORE_ID } from './system';
import { users } from './identity';

export const roleStatusEnum = pgEnum('role_status', ['active', 'disabled']);

export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    storeId: text('store_id').notNull().default(DEFAULT_STORE_ID),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    descriptionAr: text('description_ar').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    /** '*' sentinel for Super Admin; otherwise permissions live in role_permissions. */
    isWildcard: boolean('is_wildcard').notNull().default(false),
    /** Seeded system roles cannot be deleted (§44). */
    isSystem: boolean('is_system').notNull().default(false),
    status: roleStatusEnum('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [uniqueIndex('roles_name_en_uidx').on(t.storeId, t.nameEn)],
);

/** The permission catalog rows, e.g. ('products','view'). Seeded from RESOURCES. */
export const permissions = pgTable(
  'permissions',
  {
    id: primaryId(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    /** Denormalized `${resource}:${action}` for direct lookup. */
    key: text('key').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('permissions_key_uidx').on(t.key)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('role_permissions_uidx').on(t.roleId, t.permissionKey),
    index('role_permissions_role_idx').on(t.roleId),
  ],
);

/** Staff ↔ role assignment. A user has one primary role (users.roleId) but this
 * table supports future many-to-many without a schema change. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('user_roles_uidx').on(t.userId, t.roleId)],
);

/** Direct permissions granted on top of a role (§44 optional direct permissions). */
export const userDirectPermissions = pgTable(
  'user_direct_permissions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    grantedBy: text('granted_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('user_direct_permissions_uidx').on(t.userId, t.permissionKey)],
);
