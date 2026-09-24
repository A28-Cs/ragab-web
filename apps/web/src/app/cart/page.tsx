'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowLeft, Trash2, Tag, CheckCircle2, X, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CartLineItem } from '../../components/product/CartLineItem';

export default function CartPage() {
  const { t, isRTL } = useLanguage();
  const {
    cart,
    isLoading,
    isSyncing,
    clearCart,
    subtotal,
    deliveryFee,
    deliveryZone,
    appliedPromotions,
    discount,
    total,
    freeDeliveryThreshold,
    freeDeliveryProgress,
    totalItems,
    couponCode,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [couponInput, setCouponInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const remainingForFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim();
    if (!code) return;
    setApplying(true);
    try {
      // The server validates the code and prices the discount; nothing is hard-coded here.
      if (await applyCoupon(code)) setCouponInput('');
    } finally {
      setApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <Loader2 className="w-7 h-7 animate-spin text-ragab-ink-400" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="py-8 font-arabic">
        <EmptyState
          icon={<ShoppingBag className="w-8 h-8 text-ragab-brand-700" />}
          title={t.cart.emptyTitle}
          description={t.cart.emptyDesc}
          actionLabel={t.cart.startShopping}
          actionHref="/categories"
        />
      </div>
    );
  }

  const summary = (
    <>
      {/* Promo code — validated and priced by the server */}
      {couponCode ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-ragab-success-soft border border-ragab-success/30 px-3 py-2">
          <span className="text-caption font-bold text-ragab-success inline-flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            {t.cart.couponSuccess} (<span dir="ltr">{couponCode}</span>)
          </span>
          <button type="button" onClick={removeCoupon} className="inline-flex items-center gap-1 text-caption font-bold text-ragab-ink-600 hover:text-ragab-danger focus-ring rounded-md px-1" aria-label={t.cart.removeCoupon}>
            <X className="w-3.5 h-3.5" />
            {t.cart.removeCoupon}
          </button>
        </div>
      ) : (
        <form onSubmit={handleApplyCoupon} className="space-y-2">
          <label htmlFor="coupon" className="text-label text-ragab-ink-600 block">
            {t.cart.couponPlaceholder}
          </label>
          <div className="flex gap-2">
            <input
              id="coupon"
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              dir="ltr"
              autoCapitalize="characters"
              className="flex-1 min-w-0 h-10 px-3 bg-ragab-ink-50 border border-ragab-ink-200 rounded-lg text-body-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 focus:border-ragab-brand-500"
            />
            <Button type="submit" variant="secondary" size="sm" className="h-10" isLoading={applying} disabled={!couponInput.trim()}>
              {t.cart.applyCoupon}
            </Button>
          </div>
        </form>
      )}

      {/* Breakdown — every number comes from the server's priced cart */}
      <div className="space-y-2.5 text-body-sm text-ragab-ink-600 pt-3 border-t border-ragab-ink-100">
        <div className="flex justify-between">
          <span>{t.cart.subtotal}</span>
          <span>
            {subtotal.toFixed(2)} {t.common.egp}
          </span>
        </div>
        {appliedPromotions.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-ragab-success-soft/60 border border-ragab-success/20 px-3 py-2" data-testid="applied-promotions">
            {appliedPromotions.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-caption font-bold text-ragab-success">
                <span className="inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />{isRTL ? a.titleAr || a.code : a.titleEn || a.titleAr || a.code}</span>
                <span dir="ltr">{a.freeDelivery ? t.cart.free : a.giftProductId ? '🎁' : `− ${a.discount.toFixed(2)} ${t.common.egp}`}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between">
          <span>{t.cart.deliveryFee}</span>
          <span>
            {deliveryFee === 0 ? (
              <span className="text-ragab-success font-bold">{t.cart.free}</span>
            ) : (
              `${deliveryFee.toFixed(2)} ${t.common.egp}`
            )}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-ragab-success font-bold">
            <span>{t.cart.discount}</span>
            <span>
              − {discount.toFixed(2)} {t.common.egp}
            </span>
          </div>
        )}
        <div className="flex justify-between text-body font-extrabold text-ragab-ink-800 pt-3 border-t border-ragab-ink-100">
          <span>{t.cart.total}</span>
          <span>
            {total.toFixed(2)} {t.common.egp}
          </span>
        </div>
        <p className="text-caption text-ragab-ink-500">
          {deliveryZone
            ? `${t.checkout.deliveryTo} ${isRTL ? deliveryZone.nameAr : deliveryZone.nameEn}${(isRTL ? deliveryZone.estimatedTimeAr : deliveryZone.estimatedTimeEn) ? ` · ${isRTL ? deliveryZone.estimatedTimeAr : deliveryZone.estimatedTimeEn}` : ''}`
            : t.cart.deliveryByAddress}
        </p>
      </div>

      <Link href="/checkout" className="block">
        <Button variant="primary" fullWidth size="lg" disabled={isSyncing}>
          <span>{t.cart.proceedToCheckout}</span>
          <ArrowLeft className="w-5 h-5 ltr:rotate-180" />
        </Button>
      </Link>
    </>
  );

  return (
    <div className="space-y-6 pb-28 lg:pb-16 font-arabic">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 text-ragab-ink-800 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-ragab-brand-700" />
          <span>
            {t.cart.title} ({totalItems})
          </span>
          {isSyncing && <Loader2 className="w-4 h-4 animate-spin text-ragab-ink-400" aria-label={t.states.loading} />}
        </h1>
        <button
          onClick={() => setIsClearConfirmOpen(true)}
          className="text-body-sm font-bold text-ragab-danger hover:text-red-700 flex items-center gap-1 py-2 px-2 rounded-md focus-ring"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t.cart.clearCart}</span>
        </button>
      </div>

      {/* Free delivery bar */}
      <div className="bg-white border border-ragab-brand-200 p-4 rounded-xl shadow-subtle">
        <div className="text-body-sm font-bold text-ragab-ink-800 mb-2">
          {remainingForFreeDelivery === 0 ? (
            <span className="flex items-center gap-1.5 text-ragab-success">
              <CheckCircle2 className="w-5 h-5" />
              {t.cart.freeDeliveryQualified}
            </span>
          ) : (
            <span>{t.cart.remaining.replace('{amount}', remainingForFreeDelivery.toFixed(2))}</span>
          )}
        </div>
        <div
          className="w-full h-2.5 bg-ragab-ink-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(freeDeliveryProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-ragab-brand-500 transition-all duration-300 rounded-full"
            style={{ width: `${freeDeliveryProgress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Items */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-ragab-ink-200 px-4 sm:px-6 shadow-subtle divide-y divide-ragab-ink-100">
          {cart.map((item) => (
            <CartLineItem key={`${item.product.id}:${item.variantId ?? 'default'}`} item={item} variant="full" />
          ))}
        </div>

        {/* Summary — sticky on desktop */}
        <aside className="hidden lg:block lg:col-span-4 bg-white rounded-xl border border-ragab-ink-200 p-6 shadow-subtle space-y-5 sticky top-24">
          <h2 className="text-h3 text-ragab-ink-800 pb-3 border-b border-ragab-ink-100">
            {t.cart.orderSummary}
          </h2>
          {summary}
        </aside>

        {/* Mobile summary — inline card */}
        <div className="lg:hidden bg-white rounded-xl border border-ragab-ink-200 p-4 shadow-subtle space-y-4">
          <h2 className="text-h3 text-ragab-ink-800 pb-2 border-b border-ragab-ink-100">
            {t.cart.orderSummary}
          </h2>
          {summary}
        </div>
      </div>

      {/* Mobile fixed total bar */}
      <div
        className="lg:hidden fixed inset-x-0 z-30 bg-white border-t border-ragab-ink-200 p-3 shadow-sticky flex items-center justify-between gap-3"
        style={{ bottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
      >
        <div className="font-arabic">
          <div className="text-caption text-ragab-ink-500">{t.cart.total}</div>
          <div className="text-price text-ragab-ink-800">
            {total.toFixed(2)} <span className="text-caption">{t.common.egp}</span>
          </div>
        </div>
        <Link href="/checkout" className="flex-1 max-w-[220px]">
          <Button variant="primary" size="md" fullWidth disabled={isSyncing}>
            {t.cart.proceedToCheckout}
          </Button>
        </Link>
      </div>

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          void clearCart();
          setIsClearConfirmOpen(false);
        }}
        title={t.cart.clearCart}
        description={t.cart.confirmClear}
        confirmLabel={t.common.confirm}
        destructive
      />
    </div>
  );
}
