/** Account/profile service — backed by the API (`PATCH /api/v1/auth/profile`). */
import { User } from '../types';
import { api } from '../lib/apiClient';

export const updateProfile = async (_user: User, patch: Partial<User>): Promise<User> => {
  const body: Record<string, unknown> = {};
  for (const k of ['name', 'email', 'defaultVillage', 'avatar', 'dateOfBirth', 'preferredLanguage'] as const) {
    if (patch[k] !== undefined) body[k] = patch[k];
  }
  return api.patch<User>('/auth/profile', body);
};
