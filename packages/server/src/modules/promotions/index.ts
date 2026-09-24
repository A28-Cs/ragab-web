export * as promotionService from './service';
/** @deprecated alias kept for older imports — the same engine. */
export * as couponService from './service';
export {
  validateCoupon,
  redeemCoupon,
  redeemPromotions,
  loadActivePromotions,
  listActiveBanners,
  listAllBanners,
  saveBanner,
  deleteBanner,
  promotionUpsertSchema,
  offerUpsertSchema,
  badgeFor,
} from './service';
export type { ValidatedCoupon, PromotionUpsertInput, OfferUpsertInput } from './service';
