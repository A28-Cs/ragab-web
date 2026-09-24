/**
 * Staff (users) admin service — backed by the API (`/api/v1/admin/staff`). Signatures
 * preserved; `perms` ignored (server enforces `users:*`). Role/status changes go through
 * PATCH; the server revokes the target's sessions so new permissions apply immediately.
 */
import { PermissionKey, StaffStatus, StaffUser } from '../types';
import { api } from '../lib/apiClient';

export const getStaff = async (): Promise<StaffUser[]> => api.get<StaffUser[]>('/admin/staff');

export const getStaffMember = async (id: string): Promise<StaffUser | null> => {
  const all = await getStaff();
  return all.find((s) => s.id === id) ?? null;
};

export const changeStaffRole = async (id: string, roleId: string, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.patch(`/admin/staff/${encodeURIComponent(id)}`, { roleId });
};

export const setStaffStatus = async (id: string, status: StaffStatus, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.patch(`/admin/staff/${encodeURIComponent(id)}`, { status });
};

/** Staff are disabled rather than hard-deleted (audit/history retention). */
export const removeStaff = async (id: string, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.patch(`/admin/staff/${encodeURIComponent(id)}`, { status: 'disabled' });
};

/** Create a staff member (used by the users/new flow). */
export const createStaff = async (input: { name: string; email: string; phone: string; password: string; roleId: string }): Promise<StaffUser> =>
  api.post<StaffUser>('/admin/staff', input);
