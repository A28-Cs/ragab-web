/**
 * Store settings admin service — backed by the API (`/api/v1/admin/settings`).
 * Signatures preserved; `perms` ignored (server enforces `settings:*`). The server
 * invalidates its settings cache on save so pricing picks up new values immediately.
 */
import { PermissionKey, StoreSettings } from '../types';
import { api } from '../lib/apiClient';

export const getSettings = async (): Promise<StoreSettings> => api.get<StoreSettings>('/admin/settings');

export const saveSettings = async (next: StoreSettings, _perms?: Set<PermissionKey>): Promise<StoreSettings> =>
  api.patch<StoreSettings>('/admin/settings', next);
