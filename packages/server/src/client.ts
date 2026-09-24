/**
 * Client-safe entrypoint (@ragab/server/client). Contains ONLY the permission
 * catalog and DTO types — no DB, no secrets, no Node built-ins — so the browser
 * bundle can import RBAC metadata for rendering without pulling in server internals.
 */
export {
  RESOURCES,
  ACTIONS,
  RESOURCE_META,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  permKey,
  can,
  expandPermissions,
  hasAnyAdminAccess,
} from './security/permissions';
export type { Resource, Action, PermissionKey, ResourceMeta, RoleSeed } from './security/permissions';
export type * from './types';
