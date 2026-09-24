/** Security service — sessions, login activity, password change, backed by the API. */
import { Session, LoginActivity } from '../types';
import { api } from '../lib/apiClient';

export const getSessions = async (): Promise<Session[]> => api.get<Session[]>('/auth/sessions');

export const getLoginActivity = async (): Promise<LoginActivity[]> => api.get<LoginActivity[]>('/auth/login-activity');

export const endSession = async (id: string): Promise<void> => {
  await api.del(`/auth/sessions/${encodeURIComponent(id)}`);
};

export const logoutOtherDevices = async (): Promise<void> => {
  await api.post('/auth/logout-others');
};

export const changePassword = async (current: string, next: string): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
};
