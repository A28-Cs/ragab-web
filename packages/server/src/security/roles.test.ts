import { describe, it, expect } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_ROLES, LEGACY_ROLE_MAP, expandPermissions, can } from './permissions';

const role = (id: string) => DEFAULT_ROLES.find((r) => r.id === id)!;
const perms = (id: string) => expandPermissions(role(id).permissions);

describe('the three roles (owner decision)', () => {
  it('ships exactly owner / store manager / staff, all system roles', () => {
    expect(DEFAULT_ROLES.map((r) => r.id)).toEqual(['role_owner', 'role_store_manager', 'role_staff']);
    expect(DEFAULT_ROLES.every((r) => r.isSystem)).toBe(true);
  });

  it('owner holds every permission in the catalog', () => {
    expect(role('role_owner').permissions).toBe('*');
    expect(perms('role_owner').size).toBe(ALL_PERMISSIONS.length);
  });

  it('store manager runs operations (incl. refunds and delivery approval) but not roles, staff creation, integrations or system settings', () => {
    const p = perms('role_store_manager');
    expect(can(p, 'payments', 'approve')).toBe(true);
    expect(can(p, 'orders', 'approve')).toBe(true);
    expect(can(p, 'users', 'edit')).toBe(true);
    expect(can(p, 'settings', 'view')).toBe(true);
    expect(can(p, 'roles', 'view')).toBe(false);
    expect(can(p, 'users', 'create')).toBe(false);
    expect(can(p, 'users', 'delete')).toBe(false);
    expect(can(p, 'integrations', 'view')).toBe(false);
    expect(can(p, 'settings', 'edit')).toBe(false);
  });

  it('staff prepares orders and adjusts stock but cannot capture money, refund, or change the catalog', () => {
    const p = perms('role_staff');
    expect(can(p, 'orders', 'edit')).toBe(true);
    expect(can(p, 'inventory', 'edit')).toBe(true);
    expect(can(p, 'products', 'view')).toBe(true);
    expect(can(p, 'customers', 'view')).toBe(true);
    expect(can(p, 'orders', 'approve')).toBe(false);
    expect(can(p, 'payments', 'view')).toBe(false);
    expect(can(p, 'products', 'edit')).toBe(false);
    expect(can(p, 'reports', 'view')).toBe(false);
  });

  it('every retired role maps onto one of the three, and finance lands on the manager (refunds)', () => {
    const ids = new Set(DEFAULT_ROLES.map((r) => r.id));
    for (const target of Object.values(LEGACY_ROLE_MAP)) expect(ids.has(target)).toBe(true);
    expect(Object.keys(LEGACY_ROLE_MAP).sort()).toEqual(
      ['role_customer_support', 'role_finance', 'role_inventory_manager', 'role_marketing_manager', 'role_order_manager', 'role_product_manager', 'role_super_admin'],
    );
    expect(LEGACY_ROLE_MAP.role_super_admin).toBe('role_owner');
    expect(LEGACY_ROLE_MAP.role_finance).toBe('role_store_manager');
  });
});
