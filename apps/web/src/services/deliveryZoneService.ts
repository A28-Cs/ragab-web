/**
 * Delivery zones — the public picker and the admin CRUD (`/admin/delivery-zones`,
 * `settings:edit`). The zone fee is what the cart, the quote and checkout charge, so an
 * edit here is live for the next request — no deploy, no app update.
 */
import { DeliveryZone } from '../types';
import { api } from '../lib/apiClient';

export const getDeliveryZones = async (): Promise<DeliveryZone[]> => api.get<DeliveryZone[]>('/delivery-zones');

export const getDeliveryZonesAdmin = async (): Promise<DeliveryZone[]> => api.get<DeliveryZone[]>('/admin/delivery-zones');

function toBody(z: DeliveryZone) {
  return {
    nameAr: z.nameAr.trim(),
    nameEn: z.nameEn.trim(),
    deliveryFee: Number(z.deliveryFee) || 0,
    minOrder: Number(z.minOrder) || 0,
    estimatedTimeAr: z.estimatedTimeAr ?? '',
    estimatedTimeEn: z.estimatedTimeEn ?? '',
    isActive: z.isActive ?? true,
    sortOrder: Number(z.sortOrder) || 0,
  };
}

export const saveDeliveryZone = async (z: DeliveryZone): Promise<DeliveryZone> =>
  z.id ? api.patch<DeliveryZone>(`/admin/delivery-zones/${encodeURIComponent(z.id)}`, toBody(z)) : api.post<DeliveryZone>('/admin/delivery-zones', toBody(z));

export const deleteDeliveryZone = async (id: string): Promise<void> => {
  await api.del(`/admin/delivery-zones/${encodeURIComponent(id)}`);
};
