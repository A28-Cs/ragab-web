'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Sparkles, WifiOff, X, Loader2, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { getOfferProducts } from '../../services/productService';
import { getOffers, deleteOffer } from '../../services/offerService';
import { Product, Offer } from '../../types';
import { ProductGrid } from '../../components/product/ProductGrid';
import { OfferCard } from '../../components/product/OfferCard';
import { OfferBannerSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';

export default function OffersPage() {
  const { t, isRTL } = useLanguage();
  const { user, hasAnyAdminAccess, hasPermission } = useAuth();
  const { showToast } = useToast();

  const isManager =
    Boolean(hasAnyAdminAccess) &&
    (user?.roleId === 'role_owner' ||
      user?.roleId === 'role_store_manager' ||
      (hasPermission('promotions', 'delete') && hasPermission('promotions', 'edit')) ||
      (hasPermission('products', 'delete') && hasPermission('products', 'edit')));

  const [offerProducts, setOfferProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Hero offer banner cancellation state
  const [isBannerCancelled, setIsBannerCancelled] = useState(false);
  const [showCancelBannerConfirm, setShowCancelBannerConfirm] = useState(false);

  // Individual offer deletion state
  const [targetOfferToDelete, setTargetOfferToDelete] = useState<Offer | null>(null);
  const [isDeletingOffer, setIsDeletingOffer] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ragab_hero_offer_canceled');
      if (saved === 'true') {
        setIsBannerCancelled(true);
      }
    } catch {}
  }, []);

  const loadOffers = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [prods, offs] = await Promise.all([getOfferProducts(12), getOffers()]);
      setOfferProducts(prods);
      setOffers(offs);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const handleCancelBanner = () => {
    setIsBannerCancelled(true);
    try {
      localStorage.setItem('ragab_hero_offer_canceled', 'true');
    } catch {}
    setShowCancelBannerConfirm(false);
    showToast(isRTL ? 'تم إلغاء العرض بنجاح' : 'Offer cancelled successfully', 'success');
  };

  const handleRestoreBanner = () => {
    setIsBannerCancelled(false);
    try {
      localStorage.removeItem('ragab_hero_offer_canceled');
    } catch {}
    showToast(isRTL ? 'تمت إعادة تفعيل العرض بنجاح' : 'Offer re-activated successfully', 'success');
  };

  const handleDeleteOffer = async () => {
    if (!targetOfferToDelete) return;
    setIsDeletingOffer(true);
    try {
      await deleteOffer(targetOfferToDelete.id);
      setOffers((prev) => prev.filter((o) => o.id !== targetOfferToDelete.id));
      showToast(isRTL ? 'تم إلغاء العرض بنجاح' : 'Offer cancelled successfully', 'success');
      setTargetOfferToDelete(null);
    } catch (err: any) {
      showToast(err?.message || (isRTL ? 'فشل إلغاء العرض' : 'Failed to cancel offer'), 'error');
    } finally {
      setIsDeletingOffer(false);
    }
  };

  if (hasError) {
    return (
      <EmptyState
        icon={<WifiOff className="w-8 h-8 text-ragab-danger" />}
        title={t.common.errorTitle}
        description={t.common.errorDesc}
        actionLabel={t.common.tryAgain}
        onAction={loadOffers}
      />
    );
  }

  return (
    <div className="space-y-8 pb-12 font-arabic">
      {/* Header / Main Hero Offer Banner */}
      {!isBannerCancelled ? (
        <div className="bg-gradient-to-l from-ragab-brand-500 via-amber-300 to-ragab-brand-300 rounded-2xl p-6 sm:p-9 text-ragab-ink-800 shadow-card relative overflow-hidden">
          <div className="relative z-10 space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 text-caption font-bold shadow-subtle">
                <Sparkles className="w-3.5 h-3.5 text-ragab-brand-700" />
                <span>{isRTL ? 'عروض صيدلية رجب اليومية' : 'Ragab daily offers'}</span>
              </div>

              {/* Manager Red Cancel Button matching user drawing */}
              {isManager && (
                <button
                  type="button"
                  onClick={() => setShowCancelBannerConfirm(true)}
                  title={isRTL ? 'إلغاء هذا العرض' : 'Cancel this offer'}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-caption shadow-subtle transition-all focus-ring active:scale-95 border border-red-700"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isRTL ? 'إلغاء العرض' : 'Cancel offer'}</span>
                </button>
              )}
            </div>

            <h1 className="text-h1 tracking-tight">
              {isRTL ? 'العروض والتوفير الكبير' : 'Offers & Big Savings'}
            </h1>
            <p className="text-body-sm font-semibold opacity-80 leading-relaxed">
              {isRTL
                ? 'خصومات حقيقية رجبة بالمليم على جميع المنتجات الغذائية ومستلزمات البيت لأهالي قرية عليم والقرى المجاورة.'
                : 'Real, carefully calculated discounts on groceries and home essentials for Aleem and nearby villages.'}
            </p>
          </div>
        </div>
      ) : isManager ? (
        /* Manager restore bar when banner is cancelled */
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-body-sm shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="font-semibold">
              {isRTL
                ? 'تم إلغاء عرض (العروض والتوفير الكبير) وهو مخفي الآن عن العملاء.'
                : 'The main offer banner is currently cancelled and hidden from customers.'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRestoreBanner}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-caption transition-colors focus-ring shrink-0"
          >
            {isRTL ? 'إعادة تفعيل العرض' : 'Re-activate offer'}
          </button>
        </div>
      ) : null}

      {/* Featured banners — compact strips, never more than one row's worth of height */}
      {(isLoading || offers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {isLoading ? (
            <>
              <OfferBannerSkeleton />
              <OfferBannerSkeleton />
              <OfferBannerSkeleton />
            </>
          ) : (
            offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onDelete={isManager ? (off) => setTargetOfferToDelete(off) : undefined}
                isDeleting={isDeletingOffer && targetOfferToDelete?.id === offer.id}
              />
            ))
          )}
        </div>
      )}

      {/* Offer products */}
      <div className="space-y-4">
        <h2 className="text-h3 text-ragab-ink-800 flex items-center gap-2">
          <Tag className="w-5 h-5 text-ragab-brand-700" />
          <span>
            {isRTL ? 'جميع المنتجات الخاضعة للعروض' : 'All discounted products'}
            {!isLoading && ` (${offerProducts.length})`}
          </span>
        </h2>

        <ProductGrid products={offerProducts} isLoading={isLoading} />
      </div>

      {/* Cancel Hero Banner Confirmation Modal */}
      {showCancelBannerConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-arabic"
          onClick={() => setShowCancelBannerConfirm(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-ragab-ink-100 text-center space-y-4 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
              <X className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-h2 text-ragab-ink-900">
                {isRTL ? 'إلغاء هذا العرض؟' : 'Cancel this offer?'}
              </h3>
              <p className="text-body-sm text-ragab-ink-500 leading-normal">
                {isRTL
                  ? 'سيتم إخفاء وإلغاء هذا العرض الترويجي من صفحة العروض للمتجر.'
                  : 'This promotional offer banner will be cancelled and hidden from the offers page.'}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelBanner}
                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-body-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
                <span>{isRTL ? 'نعم، إلغاء العرض' : 'Yes, cancel offer'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCancelBannerConfirm(false)}
                className="flex-1 h-12 rounded-xl bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-800 font-bold text-body-sm transition-colors"
              >
                {isRTL ? 'تراجع' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Individual Offer Confirmation Modal */}
      {targetOfferToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-arabic"
          onClick={() => !isDeletingOffer && setTargetOfferToDelete(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-ragab-ink-100 text-center space-y-4 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-h2 text-ragab-ink-900">
                {isRTL
                  ? `إلغاء عرض "${targetOfferToDelete.titleAr}"؟`
                  : `Cancel "${targetOfferToDelete.titleEn || targetOfferToDelete.titleAr}"?`}
              </h3>
              <p className="text-body-sm text-ragab-ink-500 leading-normal">
                {isRTL
                  ? 'سيتم إلغاء هذا العرض الترويجي وإزالته نهائياً من المتجر.'
                  : 'This promotional offer will be cancelled and permanently removed from the store.'}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingOffer}
                onClick={handleDeleteOffer}
                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-body-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {isDeletingOffer ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>{isRTL ? 'نعم، إلغاء العرض' : 'Yes, cancel offer'}</span>
              </button>
              <button
                type="button"
                disabled={isDeletingOffer}
                onClick={() => setTargetOfferToDelete(null)}
                className="flex-1 h-12 rounded-xl bg-ragab-ink-100 hover:bg-ragab-ink-200 text-ragab-ink-800 font-bold text-body-sm transition-colors"
              >
                {isRTL ? 'تراجع' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
