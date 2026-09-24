/** Integrations admin service — backed by the API (`/api/v1/admin/integrations`). */
import { Integration, PermissionKey } from '../types';
import { api } from '../lib/apiClient';

export const getIntegrations = async (): Promise<Integration[]> => api.get<Integration[]>('/admin/integrations');

export const toggleIntegration = async (id: string, enabled: boolean, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.patch(`/admin/integrations/${encodeURIComponent(id)}`, { enabled });
};
