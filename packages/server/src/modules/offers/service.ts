/**
 * Offers = the banner face of promotions (migration 0008). This module is a façade so the
 * storefront (`/offers`) and the legacy offers admin (web + mobile `/admin/offers`) keep
 * working unchanged while every banner is a row of the one promotion engine.
 */
export {
  listActiveBanners as listActiveOffers,
  listAllBanners as listAllOffers,
  saveBanner as saveOffer,
  deleteBanner as deleteOffer,
  offerUpsertSchema,
} from '../promotions/service';
export type { OfferUpsertInput } from '../promotions/service';
