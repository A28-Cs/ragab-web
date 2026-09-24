/**
 * Customers admin service — backed by the API (`/api/v1/admin/customers`). Signatures
 * preserved; `perms` is ignored (the server enforces `customers:*`). Listing is
 * paginated server-side; the admin table walks every page (bounded) so no customer is hidden.
 */
import { Customer, CustomerStatus, PermissionKey } from '../types';
import { api } from '../lib/apiClient';
import { fetchAllPages } from '../lib/pageWalker';

export const getCustomers = async (): Promise<Customer[]> => fetchAllPages<Customer>('/admin/customers');

export const getCustomerById = async (id: string): Promise<Customer | null> => {
  const all = await getCustomers();
  return all.find((c) => c.id === id) || null;
};

export const setCustomerStatus = async (id: string, status: CustomerStatus, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.post(`/admin/customers/${encodeURIComponent(id)}/status`, { blocked: status === 'blocked' });
};

/** Lifetime-spend adjustment is now owned by the server (refunds update it); no-op client-side. */
export const adjustCustomerSpentByPhone = (_phone: string, _delta: number): void => {};
