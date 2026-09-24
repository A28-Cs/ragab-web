/**
 * Promotions — the one rules engine (automatic deals + codes + banners), backed by
 * `/api/v1/admin/promotions` (`promotions:*`). What is saved here is what the cart, the
 * quote and checkout charge on the next request.
 */
import { Promotion, PermissionKey } from '../types';
import { api } from '../lib/apiClient';

export const getPromotions = async (): Promise<Promotion[]> => api.get<Promotion[]>('/admin/promotions');

const day = (s?: string) => (s ? s.slice(0, 10) : undefined);

function toBody(p: Promotion) {
  return {
    kind: p.kind,
    code: p.kind === 'code' ? p.code?.trim() : undefined,
    type: p.type,
    value: Number(p.value) || 0,
    maxDiscount: p.maxDiscount || undefined,
    minOrder: Number(p.minOrder) || 0,
    scope: p.scope,
    productIds: p.scope === 'product' ? p.productIds : [],
    categoryIds: p.scope === 'category' ? p.categoryIds : [],
    giftProductId: p.type === 'free_gift' ? p.giftProductId : undefined,
    startsAt: day(p.startsAt),
    expiresAt: day(p.expiresAt),
    isActive: p.isActive,
    usageLimit: p.usageLimit || undefined,
    perUserLimit: Number(p.perUserLimit) || 0,
    showBanner: p.showBanner,
    titleAr: p.titleAr,
    titleEn: p.titleEn,
    subtitleAr: p.subtitleAr,
    subtitleEn: p.subtitleEn,
    badgeAr: p.badgeAr,
    badgeEn: p.badgeEn,
    imageUrl: p.imageUrl || undefined,
    theme: p.theme,
    sortOrder: Number(p.sortOrder) || 0,
    slug: p.slug || undefined,
  };
}

export const savePromotion = async (p: Promotion, _perms?: Set<PermissionKey>): Promise<Promotion> =>
  p.id ? api.put<Promotion>(`/admin/promotions/${encodeURIComponent(p.id)}`, toBody(p)) : api.post<Promotion>('/admin/promotions', toBody(p));

/** Deletes an unused rule; a redeemed one is deactivated server-side instead. */
export const deletePromotion = async (id: string, _perms?: Set<PermissionKey>): Promise<{ deleted: boolean }> =>
  api.del<{ deleted: boolean }>(`/admin/promotions/${encodeURIComponent(id)}`);
