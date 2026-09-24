import { describe, it, expect } from 'vitest';
import { expandPermissions, can, ALL_PERMISSIONS, DEFAULT_ROLES, RESOURCES } from './permissions';

describe('permissions', () => {
  it('expands wildcard to every permission', () => {
    const set = expandPermissions('*');
    expect(set.size).toBe(ALL_PERMISSIONS.length);
    expect(can(set, 'payments', 'approve')).toBe(true);
  });

  it('merges role and direct permissions', () => {
    const set = expandPermissions(['orders:view'], ['payments:approve']);
    expect(can(set, 'orders', 'view')).toBe(true);
    expect(can(set, 'payments', 'approve')).toBe(true);
    expect(can(set, 'orders', 'delete')).toBe(false);
  });

  it('staff cannot touch roles or settings', () => {
    const role = DEFAULT_ROLES.find((r) => r.id === 'role_staff')!;
    const set = expandPermissions(role.permissions as any);
    expect(can(set, 'orders', 'edit')).toBe(true);
    expect(can(set, 'roles', 'edit')).toBe(false);
    expect(can(set, 'settings', 'edit')).toBe(false);
  });

  it('every default role references only valid permission keys', () => {
    const valid = new Set(ALL_PERMISSIONS);
    for (const role of DEFAULT_ROLES) {
      if (role.permissions === '*') continue;
      for (const key of role.permissions) expect(valid.has(key)).toBe(true);
    }
  });

  it('catalog has 13 resources', () => {
    expect(RESOURCES.length).toBe(13);
  });
});
