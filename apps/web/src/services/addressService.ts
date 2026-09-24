/** Address service — backed by the API (`/api/v1/addresses`), owner-scoped server-side. */
import { Address } from '../types';
import { api } from '../lib/apiClient';

export const getAddresses = async (): Promise<Address[]> => api.get<Address[]>('/addresses');

export const saveAddress = async (address: Address): Promise<Address> => {
  const body = {
    title: address.title,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    village: address.village,
    zoneId: address.zoneId || undefined,
    streetAddress: address.streetAddress,
    landmark: address.landmark,
    notes: address.notes,
    isDefault: address.isDefault,
  };
  if (address.id) return api.put<Address>(`/addresses/${encodeURIComponent(address.id)}`, body);
  return api.post<Address>('/addresses', body);
};

export const deleteAddress = async (id: string): Promise<void> => {
  await api.del(`/addresses/${encodeURIComponent(id)}`);
};

export const setDefaultAddress = async (id: string): Promise<void> => {
  const all = await getAddresses();
  const addr = all.find((a) => a.id === id);
  if (addr) await saveAddress({ ...addr, isDefault: true });
};
