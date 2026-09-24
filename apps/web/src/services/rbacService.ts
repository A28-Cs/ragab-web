/**
 * Roles — read-only on the client. The three roles (owner / store manager / staff) are
 * fixed by the owner's decision; the user page assigns them, nothing authors them here.
 * Backed by `/api/v1/admin/roles` (`roles:view`).
 */
import { Role } from '../types';
import { api } from '../lib/apiClient';

export const getRoles = async (): Promise<Role[]> => api.get<Role[]>('/admin/roles');

export const getRole = async (id: string): Promise<Role | null> => {
  const all = await getRoles();
  return all.find((r) => r.id === id) ?? null;
};
