/**
 * Public server API surface. Route handlers import from here (and from the
 * `@ragab/server/*` deep paths for module services). This barrel intentionally
 * exposes the HTTP layer, error types, and the permission catalog — NOT the DB
 * client or raw schema, which stay internal to the server package.
 */
export { defineRoute } from './http/handler';
export type { RouteConfig, RouteInput } from './http/handler';
export type { RequestContext } from './http/context';
export * from './lib/errors';
export { RATE_RULES } from './security/rateLimit';
export * from './types';

// Permission catalog re-export for the client (UI gating only; enforcement is server-side).
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
export type { Resource, Action, PermissionKey, ResourceMeta } from './security/permissions';
