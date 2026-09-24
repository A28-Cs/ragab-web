import type {
  Action,
  PermissionKey,
  Resource,
  Role,
} from '../types';

/* ============================================================
 * Permission catalog
 *
 * Single source of truth for the resources the store exposes, the
 * actions each resource supports, and their bilingual labels. The
 * Permission Matrix UI, the role wizard and every `Can` gate read
 * from here so the model stays consistent.
 * ========================================================== */

export interface ResourceMeta {
  key: Resource;
  nameAr: string;
  nameEn: string;
  /** Which admin section groups this resource under, for nav + matrix ordering */
  group: 'catalog' | 'operations' | 'people' | 'system';
  /** The subset of actions that make sense for this resource */
  actions: Action[];
}

export interface ActionMeta {
  key: Action;
  nameAr: string;
  nameEn: string;
}

export const ACTIONS: ActionMeta[] = [
  { key: 'view', nameAr: 'عرض', nameEn: 'View' },
  { key: 'create', nameAr: 'إنشاء', nameEn: 'Create' },
  { key: 'edit', nameAr: 'تعديل', nameEn: 'Edit' },
  { key: 'delete', nameAr: 'حذف', nameEn: 'Delete' },
  { key: 'export', nameAr: 'تصدير', nameEn: 'Export' },
  { key: 'approve', nameAr: 'اعتماد', nameEn: 'Approve' },
  { key: 'manage', nameAr: 'إدارة', nameEn: 'Manage' },
];

export const ACTION_LABEL: Record<Action, { ar: string; en: string }> =
  Object.fromEntries(ACTIONS.map((a) => [a.key, { ar: a.nameAr, en: a.nameEn }])) as Record<
    Action,
    { ar: string; en: string }
  >;

export const RESOURCES: ResourceMeta[] = [
  { key: 'products', nameAr: 'المنتجات', nameEn: 'Products', group: 'catalog', actions: ['view', 'create', 'edit', 'delete', 'export', 'manage'] },
  { key: 'categories', nameAr: 'الأقسام', nameEn: 'Categories', group: 'catalog', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { key: 'inventory', nameAr: 'المخزون', nameEn: 'Inventory', group: 'catalog', actions: ['view', 'edit', 'export', 'manage'] },
  { key: 'orders', nameAr: 'الطلبات', nameEn: 'Orders', group: 'operations', actions: ['view', 'create', 'edit', 'delete', 'export', 'approve', 'manage'] },
  { key: 'customers', nameAr: 'العملاء', nameEn: 'Customers', group: 'operations', actions: ['view', 'edit', 'export', 'manage'] },
  { key: 'promotions', nameAr: 'العروض', nameEn: 'Promotions', group: 'operations', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { key: 'payments', nameAr: 'المدفوعات', nameEn: 'Payments', group: 'operations', actions: ['view', 'export', 'approve', 'manage'] },
  { key: 'reports', nameAr: 'التقارير', nameEn: 'Reports', group: 'operations', actions: ['view', 'export'] },
  { key: 'users', nameAr: 'المستخدمون والموظفون', nameEn: 'Users & Staff', group: 'people', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { key: 'roles', nameAr: 'الأدوار والصلاحيات', nameEn: 'Roles & Permissions', group: 'people', actions: ['view', 'create', 'edit', 'delete', 'manage'] },
  { key: 'integrations', nameAr: 'التكاملات', nameEn: 'Integrations', group: 'system', actions: ['view', 'edit', 'manage'] },
  { key: 'audit', nameAr: 'سجل التدقيق', nameEn: 'Audit Log', group: 'system', actions: ['view', 'export'] },
  { key: 'settings', nameAr: 'الإعدادات', nameEn: 'Settings', group: 'system', actions: ['view', 'edit', 'manage'] },
];

export const RESOURCE_META: Record<Resource, ResourceMeta> = Object.fromEntries(
  RESOURCES.map((r) => [r.key, r])
) as Record<Resource, ResourceMeta>;

/* ============================================================
 * Helpers
 * ========================================================== */

export function permKey(resource: Resource, action: Action): PermissionKey {
  return `${resource}:${action}` as PermissionKey;
}

/** Build permission keys for a resource across several actions */
function grant(resource: Resource, actions: Action[]): PermissionKey[] {
  return actions.map((a) => permKey(resource, a));
}

/** Every permission key the catalog can produce (used to expand Super Admin `*`) */
export const ALL_PERMISSIONS: PermissionKey[] = RESOURCES.flatMap((r) =>
  r.actions.map((a) => permKey(r.key, a))
);

/**
 * Expand a role (+ optional direct permissions) into a flat Set for O(1) checks.
 * A role with `permissions === '*'` (Super Admin) resolves to every permission.
 */
export function expandPermissions(
  rolePermissions: PermissionKey[] | '*' | undefined,
  directPermissions: PermissionKey[] = []
): Set<PermissionKey> {
  if (rolePermissions === '*') return new Set(ALL_PERMISSIONS);
  return new Set([...(rolePermissions ?? []), ...directPermissions]);
}

export function can(
  permissions: Set<PermissionKey>,
  resource: Resource,
  action: Action
): boolean {
  return permissions.has(permKey(resource, action));
}

/** True when the permission set grants any admin-surface access at all */
export function hasAnyAdminAccess(permissions: Set<PermissionKey>): boolean {
  return permissions.size > 0;
}

/** Thrown by guarded mock service actions when the caller lacks a permission */
export class PermissionError extends Error {
  resource: Resource;
  action: Action;
  constructor(resource: Resource, action: Action) {
    super(`Permission denied: ${resource}:${action}`);
    this.name = 'PermissionError';
    this.resource = resource;
    this.action = action;
  }
}

/** Guard used inside mock service mutations to enforce at the "system" boundary */
export function assertCan(
  permissions: Set<PermissionKey>,
  resource: Resource,
  action: Action
): void {
  if (!can(permissions, resource, action)) {
    throw new PermissionError(resource, action);
  }
}

/* ============================================================
 * Default seeded roles (Part 16)
 * ========================================================== */

/**
 * The three roles (owner decision, 2026-09-02) — a client mirror of the server catalog in
 * packages/server/src/security/permissions.ts used for UI gating only; enforcement is
 * server-side. Roles are assigned on the user page, never authored in the UI.
 */
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role_owner',
    nameAr: 'المالك',
    nameEn: 'Owner',
    descriptionAr: 'صلاحيات كاملة على المتجر والنظام: الموظفون والأدوار والتكاملات والإعدادات.',
    descriptionEn: 'Full control over the store and the system: staff, roles, integrations and settings.',
    permissions: '*',
    isSystem: true,
    status: 'active',
    userCount: 1,
    createdAt: '2026-01-01',
  },
  {
    id: 'role_store_manager',
    nameAr: 'مدير المتجر',
    nameEn: 'Store Manager',
    descriptionAr: 'يدير كل العمليات اليومية — الكتالوج والطلبات والمدفوعات والاستردادات والعروض والتقارير — دون الأدوار وإنشاء/حذف الموظفين والتكاملات وإعدادات النظام.',
    descriptionEn: 'Runs every daily operation — catalog, orders, payments, refunds, promotions, reports — without roles, creating/deleting staff, integrations or system settings.',
    permissions: [
      ...grant('products', ['view', 'create', 'edit', 'delete', 'export', 'manage']),
      ...grant('categories', ['view', 'create', 'edit', 'delete', 'manage']),
      ...grant('inventory', ['view', 'edit', 'export', 'manage']),
      ...grant('orders', ['view', 'create', 'edit', 'delete', 'export', 'approve', 'manage']),
      ...grant('customers', ['view', 'edit', 'export', 'manage']),
      ...grant('promotions', ['view', 'create', 'edit', 'delete', 'manage']),
      ...grant('payments', ['view', 'export', 'approve', 'manage']),
      ...grant('reports', ['view', 'export']),
      ...grant('users', ['view', 'edit', 'manage']),
      ...grant('audit', ['view', 'export']),
      ...grant('settings', ['view']),
    ],
    isSystem: true,
    status: 'active',
    userCount: 1,
    createdAt: '2026-01-01',
  },
  {
    id: 'role_staff',
    nameAr: 'موظف',
    nameEn: 'Staff',
    descriptionAr: 'يجهّز الطلبات ويحدّث حالاتها ويضبط المخزون ويطّلع على المنتجات والعملاء. اعتماد التسليم (تحصيل النقد) والاستردادات لمدير المتجر.',
    descriptionEn: 'Prepares orders, updates their status, adjusts stock, and views products and customers. Delivery approval (cash capture) and refunds belong to the store manager.',
    permissions: [
      ...grant('orders', ['view', 'edit']),
      ...grant('inventory', ['view', 'edit']),
      ...grant('products', ['view']),
      ...grant('customers', ['view']),
    ],
    isSystem: true,
    status: 'active',
    userCount: 1,
    createdAt: '2026-01-01',
  },
];
