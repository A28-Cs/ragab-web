/**
 * Provider credentials admin service — backed by the API (`/api/v1/admin/credentials`).
 * The server returns MASKED status only (never full secret values). Saving sends only
 * the keys the admin changed; testing runs a live connection check per provider.
 */
import { api } from '../lib/apiClient';

export interface CredentialKeyStatus {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  configured: boolean;
  source: 'db' | 'env' | 'none';
  masked?: string;
}

export interface ProviderStatus {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: string;
  configured: boolean;
  keys: CredentialKeyStatus[];
}

export const getProviderStatus = async (): Promise<ProviderStatus[]> => api.get<ProviderStatus[]>('/admin/credentials');

export const saveCredentials = async (provider: string, values: Record<string, string>): Promise<ProviderStatus[]> =>
  api.put<ProviderStatus[]>(`/admin/credentials/${encodeURIComponent(provider)}`, { values });

export const testProviderConnection = async (provider: string): Promise<{ ok: boolean; message: { ar: string; en: string } }> =>
  api.post<{ ok: boolean; message: { ar: string; en: string } }>(`/admin/credentials/${encodeURIComponent(provider)}/test`);
