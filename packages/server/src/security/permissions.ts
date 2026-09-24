/**
 * Permission catalog — the shared source of truth for RBAC (§11, §44).
 *
 * This is the server-side home of what the prototype kept in apps/web/src/lib/rbac.ts.
 * The client re-exports it for UI gating (rendering), but ENFORCEMENT happens here,
 * server-side, on every protected request. The permission rows and default roles are
 * seeded into the DB from these constants so the two never drift.
 */

export type Resource =
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'inventory'
  | 'promotions'
  | 'payments'
  | 'reports'
  | 'users'
  | 'roles'
  | 'settings'
  | 'integrations'
  | 'audit';

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'approve' | 'manage';

/** `${resource}:${action}` — O(1) Set membership checks. */
export type PermissionKey = `${Resource}:${Action}`;

export interface ResourceMeta {
  key: Resource;
  nameAr: string;
  nameEn: string;
  group: 'catalog' | 'operations' | 'people' | 'system';
  actions: Action[];
}

export const ACTIONS: { key: Action; nameAr: string; nameEn: string }[] = [
  { key: 'view', nameAr: 'عرض', nameEn: 'View' },
  { key: 'create', nameAr: 'إنشاء', nameEn: 'Create' },
  { key: 'edit', nameAr: 'تعديل', nameEn: 'Edit' },
  { key: 'delete', nameAr: 'حذف', nameEn: 'Delete' },
  { key: 'export', nameAr: 'تصدير', nameEn: 'Export' },
  { key: 'approve', nameAr: 'اعتماد', nameEn: 'Approve' },
  { key: 'manage', nameAr: 'إدارة', nameEn: 'Manage' },
];

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
  RESOURCES.map((r) => [r.key, r]),
) as Record<Resource, ResourceMeta>;

export function permKey(resource: Resource, action: Action): PermissionKey {
  return `${resource}:${action}` as PermissionKey;
}

function grant(resource: Resource, actions: Action[]): PermissionKey[] {
  return actions.map((a) => permKey(resource, a));
}

/** Every permission the catalog can produce — used to expand Super Admin '*'. */
export const ALL_PERMISSIONS: PermissionKey[] = RESOURCES.flatMap((r) =>
  r.actions.map((a) => permKey(r.key, a)),
);

export function expandPermissions(
  rolePermissions: PermissionKey[] | '*' | undefined,
  directPermissions: PermissionKey[] = [],
): Set<PermissionKey> {
  if (rolePermissions === '*') return new Set(ALL_PERMISSIONS);
  return new Set([...(rolePermissions ?? []), ...directPermissions]);
}

export function can(permissions: Set<PermissionKey>, resource: Resource, action: Action): boolean {
  return permissions.has(permKey(resource, action));
}

export function hasAnyAdminAccess(permissions: Set<PermissionKey>): boolean {
  return permissions.size > 0;
}

/** Definition used to seed roles. `permissions: '*'` is the Super Admin wildcard. */
export interface RoleSeed {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  permissions: PermissionKey[] | '*';
  isSystem: boolean;
}

/**
 * The three roles a village grocery actually runs on (owner decision, 2026-09-02). The
 * permission CATALOG above stays complete — roles are just named bundles of it — so a
 * finer split later is data, not code. Role creation/editing is deliberately absent
 * from every UI; the server keeps the endpoints for the owner's future use.
 */
export const DEFAULT_ROLES: RoleSeed[] = [
  {
    id: 'role_owner',
    nameAr: 'المالك',
    nameEn: 'Owner',
    descriptionAr: 'صلاحيات كاملة على المتجر والنظام: الموظفون والأدوار والتكاملات والإعدادات.',
    descriptionEn: 'Full control over the store and the system: staff, roles, integrations and settings.',
    permissions: '*',
    isSystem: true,
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
  },
];

/**
 * Where each retired role's users go (migration 0009 + seed backfill). Finance joins the
 * store manager, not staff, because refunds are a manager-level power.
 */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  role_super_admin: 'role_owner',
  role_product_manager: 'role_store_manager',
  role_marketing_manager: 'role_store_manager',
  role_finance: 'role_store_manager',
  role_order_manager: 'role_staff',
  role_inventory_manager: 'role_staff',
  role_customer_support: 'role_staff',
};
