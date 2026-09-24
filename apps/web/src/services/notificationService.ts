/** Notification service — backed by the API (`/api/v1/notifications`), customer-scoped. */
import { AppNotification } from '../types';
import { api } from '../lib/apiClient';

export const getNotifications = async (): Promise<AppNotification[]> => api.get<AppNotification[]>('/notifications');

export const getUnreadCount = async (): Promise<number> => {
  const list = await getNotifications();
  return list.filter((n) => !n.read).length;
};

export const markAsRead = async (id: string): Promise<void> => {
  await api.post(`/notifications/${encodeURIComponent(id)}/read`);
};

export const markAllAsRead = async (): Promise<void> => {
  await api.post('/notifications/read-all');
};

/** No-op: notifications are created server-side and dispatched via the queue. */
export const pushNotification = (..._args: unknown[]): void => {};
