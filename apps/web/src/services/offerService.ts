/**
 * Offer & delivery-zone service — backed by the API. Offers are marketing banners
 * managed via the promotions page (admin) and shown on the storefront. Delivery zones
 * come from the server (single source). `perms` is ignored (server enforces).
 */
import { Offer, DeliveryZone, PermissionKey } from '../types';
import { api } from '../lib/apiClient';

export const getOffers = async (): Promise<Offer[]> => {
  try {
    return await api.get<Offer[]>('/offers');
  } catch {
    return [];
  }
};

export const getOfferById = async (id: string): Promise<Offer | null> => {
  const list = await getOffers();
  return list.find((o) => o.id === id || o.slug === id) || null;
};

export const getDeliveryZones = async (): Promise<DeliveryZone[]> => api.get<DeliveryZone[]>('/delivery-zones');

export const saveOffer = async (offer: Offer, _perms?: Set<PermissionKey>): Promise<Offer> => {
  const body = {
    slug: offer.slug || undefined,
    titleAr: offer.titleAr,
    titleEn: offer.titleEn || undefined,
    subtitleAr: offer.subtitleAr || undefined,
    subtitleEn: offer.subtitleEn || undefined,
    discountBadgeAr: offer.discountBadgeAr || undefined,
    discountBadgeEn: offer.discountBadgeEn || undefined,
    theme: offer.theme,
    expiryDate: offer.expiryDate || undefined,
    productId: offer.productId || undefined,
    categoryId: offer.categoryId || undefined,
  };
  if (offer.id) return api.put<Offer>(`/admin/offers/${encodeURIComponent(offer.id)}`, body);
  return api.post<Offer>('/admin/offers', body);
};

export const deleteOffer = async (id: string, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.del(`/admin/offers/${encodeURIComponent(id)}`);
};
