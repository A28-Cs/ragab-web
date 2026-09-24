'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Phone,
  CreditCard,
  Banknote,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  ShoppingBag,
  Check,
  Plus,
  Loader2,
  LogIn,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { validateEgyptianPhone, validateRecipientName, validateStreetAddress } from '@ragab/validation';
import { useLanguage } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { createOrder, newCheckoutKey } from '../../services/orderService';
import { getAddresses, saveAddress } from '../../services/addressService';
import { cartService, type CheckoutQuote } from '../../services/cartService';
import { api, ApiError } from '../../lib/apiClient';
import { Address, DeliveryZone } from '../../types';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

type Step = 1 | 2 | 3;
type PaymentMethod = 'cod' | 'vodafone_cash' | 'instapay';
type NewAddressErrors = Partial<Record<'recipientName' | 'phone' | 'village' | 'streetAddress', string>>;

interface PublicConfig {
  payments: { cod: boolean; onlinePayments: boolean };
}

const PAYMENT_KEY = (orderId: string) => `ragab_payment_${orderId}`;

const inputClasses = (hasError: boolean) =>
  cn(
    'w-full h-11 px-3 bg-ragab-ink-50 border rounded-lg text-body-sm font-semibold text-ragab-ink-800 focus:outline-none focus:ring-2 focus:bg-white transition-colors',
    hasError
      ? 'border-ragab-danger focus:ring-ragab-danger/40 focus:border-ragab-danger'
      : 'border-ragab-ink-200 focus:ring-ragab-brand-500/40 focus:border-ragab-brand-500'
  );

/**
 * Checkout over the SERVER cart. The address is a saved one (or a new one saved first),
 * the totals shown come from `/checkout/quote` for that address (zone-aware delivery,
 * server-priced coupon), payment methods reflect the store's live configuration, and
 * the order is placed once with an idempotency key so a retry can never double-order.
 */
export default function CheckoutPage() {
  const { t, isRTL } = useLanguage();
  const { cart, isLoading: cartLoading, couponCode, removeCoupon, refresh } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({ recipientName: '', phone: '', village: '', zoneId: '', streetAddress: '', landmark: '' });
  const [newErrors, setNewErrors] = useState<NewAddressErrors>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One key per checkout attempt: a retry after a dropped connection replays the same order.
  const idempotencyKey = useRef(newCheckoutKey());

  // Saved addresses, delivery zones and the store's live payment configuration.
  useEffect(() => {
    if (!user) {
      setLoadingMeta(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingMeta(true);
      try {
        const [addrs, zoneList, cfg] = await Promise.all([
          getAddresses(),
          api.get<DeliveryZone[]>('/delivery-zones').catch(() => [] as DeliveryZone[]),
          api.get<PublicConfig>('/app/config').catch(() => null),
        ]);
        if (!alive) return;
        setAddresses(addrs);
        setZones(zoneList);
        setConfig(cfg);
        const preferred = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (preferred) setSelectedAddressId(preferred.id);
        else setShowNewForm(true);
        if (cfg && !cfg.payments.cod) setPaymentMethod('vodafone_cash');
        setNewAddr((f) => ({ ...f, recipientName: f.recipientName || user.name || '', phone: f.phone || user.phone || '', village: f.village || zoneList[0]?.nameAr || '' }));
      } finally {
        if (alive) setLoadingMeta(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Authoritative totals for the chosen address (+ coupon). Re-quoted whenever either changes.
  useEffect(() => {
    if (!selectedAddressId || cart.length === 0) {
      setQuote(null);
      return;
    }
    let alive = true;
    setQuoteState('loading');
    cartService
      .quote(selectedAddressId, couponCode ?? undefined)
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setQuoteState('idle');
      })
      .catch(() => {
        if (!alive) return;
        setQuote(null);
        setQuoteState('error');
      });
    return () => {
      alive = false;
    };
  }, [selectedAddressId, couponCode, cart.length]);

  const selectedAddress = useMemo(() => addresses.find((a) => a.id === selectedAddressId) ?? null, [addresses, selectedAddressId]);

  const validateNewAddress = (): boolean => {
    const e: NewAddressErrors = {};
    if (!validateRecipientName(newAddr.recipientName)) e.recipientName = t.auth.nameTooShort;
    if (!validateEgyptianPhone(newAddr.phone)) e.phone = t.auth.invalidPhone;
    if (!newAddr.zoneId) e.village = t.auth.fieldRequired;
    if (!validateStreetAddress(newAddr.streetAddress)) e.streetAddress = t.auth.fieldRequired;
    setNewErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveNewAddress = async () => {
    if (!validateNewAddress()) return;
    setSavingAddress(true);
    try {
      const saved = await saveAddress({
        id: '',
        title: `${t.checkout.deliveryTo} ${newAddr.village}`,
        label: 'home',
        recipientName: newAddr.recipientName.trim(),
        phone: newAddr.phone.trim(),
        village: newAddr.village,
        zoneId: newAddr.zoneId,
        streetAddress: newAddr.streetAddress.trim(),
        landmark: newAddr.landmark.trim() || undefined,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [saved, ...prev]);
      setSelectedAddressId(saved.id);
      setShowNewForm(false);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? (isRTL ? e.bilingual.ar : e.bilingual.en) : t.states.error);
    } finally {
      setSavingAddress(false);
    }
  };

  const goToStep2 = () => {
    if (!selectedAddressId) return;
    setSubmitError(null);
    setStep(2);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddressId) {
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { order, payment } = await createOrder({
        addressId: selectedAddressId,
        paymentMethod,
        couponCode,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      });
      // Hand the payment step to the success page (redirect / transfer instructions).
      try {
        sessionStorage.setItem(PAYMENT_KEY(order.id), JSON.stringify(payment));
      } catch {
        /* storage unavailable — the success page falls back to the order's method */
      }
      removeCoupon();
      void refresh(); // the server converted the cart; pick up the empty one
      if (payment.redirectUrl) {
        window.location.assign(payment.redirectUrl);
        return;
      }
      router.push(`/order-success?orderId=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? (isRTL ? err.bilingual.ar : err.bilingual.en) : t.checkout.submitError);
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="py-8 font-arabic">
        <EmptyState
          icon={<LogIn className="w-8 h-8 text-ragab-brand-700" />}
          title={t.checkout.signInToCheckout}
          description={t.checkout.signInToCheckoutDesc}
          actionLabel={t.checkout.signIn}
          actionHref="/login?redirect=/checkout"
        />
      </div>
    );
  }

  if (cartLoading || loadingMeta) {
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

  const steps = [
    { n: 1 as Step, label: t.checkout.step1 },
    { n: 2 as Step, label: t.checkout.step2 },
    { n: 3 as Step, label: t.checkout.step3 },
  ];

  const paymentOptions: { value: PaymentMethod; icon: React.ReactNode; title: string; desc: string; disabled?: boolean }[] = [
    { value: 'cod', icon: <Banknote className="w-4 h-4 text-ragab-success" />, title: t.checkout.cod, desc: config && !config.payments.cod ? t.checkout.codUnavailable : t.checkout.codDesc, disabled: !!config && !config.payments.cod },
    { value: 'vodafone_cash', icon: <Phone className="w-4 h-4 text-ragab-danger" />, title: t.checkout.vodafoneCash, desc: t.checkout.vodafoneCashDesc },
    { value: 'instapay', icon: <ShieldCheck className="w-4 h-4 text-ragab-info" />, title: t.checkout.instapay, desc: t.checkout.instapayDesc },
  ];

  const paymentLabel = (m: PaymentMethod) => (m === 'cod' ? t.checkout.cod : m === 'vodafone_cash' ? t.checkout.vodafoneCash : t.checkout.instapay);
  const zoneName = (z: DeliveryZone) => (isRTL ? z.nameAr : z.nameEn);

  const summaryRows = quote
    ? { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, discount: quote.discount, total: quote.total }
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 font-arabic">
      <div className="bg-white rounded-xl p-4 sm:p-6 border border-ragab-ink-200 shadow-subtle space-y-4">
        <h1 className="text-h1 text-ragab-ink-800">{t.checkout.title}</h1>
        <ol className="flex items-center gap-1.5 sm:gap-3 pt-2 border-t border-ragab-ink-100 overflow-x-auto">
          {steps.map((s, idx) => {
            const isDone = step > s.n;
            const isActive = step === s.n;
            return (
              <li key={s.n} className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <span
                  className={cn(
                    'flex items-center gap-2 py-2 px-2.5 sm:px-3.5 rounded-lg text-caption sm:text-body-sm font-bold transition-colors',
                    isActive ? 'bg-ragab-brand-500 text-ragab-ink-800 shadow-subtle' : isDone ? 'text-ragab-success' : 'text-ragab-ink-500'
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0', isActive ? 'bg-white/70' : isDone ? 'bg-ragab-success-soft' : 'bg-ragab-ink-100')}>
                    {isDone ? <Check className="w-3 h-3" /> : s.n}
                  </span>
                  <span className="whitespace-nowrap">{s.label}</span>
                </span>
                {idx < steps.length - 1 && <span className="w-4 sm:w-8 h-px bg-ragab-ink-200 shrink-0" />}
              </li>
            );
          })}
        </ol>
      </div>

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white rounded-xl border border-ragab-ink-200 p-4 sm:p-6 shadow-subtle space-y-6">
          {/* STEP 1 — delivery address */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-h3 text-ragab-ink-800 flex items-center gap-2 pb-2 border-b border-ragab-ink-100">
                <MapPin className="w-5 h-5 text-ragab-brand-700" />
                <span>{t.checkout.step1}</span>
              </h2>

              {addresses.length > 0 && (
                <div className="space-y-2" role="radiogroup" aria-label={t.checkout.savedAddresses}>
                  <p className="text-label text-ragab-ink-700">{t.checkout.savedAddresses}</p>
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all',
                        selectedAddressId === a.id && !showNewForm ? 'bg-ragab-cream/60 border-ragab-brand-500 shadow-subtle' : 'bg-white border-ragab-ink-200 hover:bg-ragab-ink-50'
                      )}
                    >
                      <input type="radio" name="address" checked={selectedAddressId === a.id && !showNewForm} onChange={() => { setSelectedAddressId(a.id); setShowNewForm(false); }} className="mt-1 accent-ragab-brand-500" />
                      <span className="min-w-0">
                        <span className="block text-body-sm font-bold text-ragab-ink-800">{a.recipientName} <span className="text-ragab-ink-500 font-medium" dir="ltr">{a.phone}</span></span>
                        <span className="block text-caption text-ragab-ink-600 mt-0.5">{a.village} — {a.streetAddress}{a.landmark ? ` (${a.landmark})` : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {addresses.length === 0 && <p className="text-body-sm text-ragab-ink-500">{t.checkout.noAddresses}</p>}

              {!showNewForm ? (
                <Button type="button" variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowNewForm(true)}>
                  {t.checkout.newAddress}
                </Button>
              ) : (
                <div className="space-y-4 rounded-xl border border-ragab-ink-200 p-4 bg-ragab-ink-50/40">
                  <p className="text-label text-ragab-ink-700">{t.checkout.newAddress}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="co-name" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.recipientName} *</label>
                      <input id="co-name" type="text" value={newAddr.recipientName} onChange={(e) => setNewAddr({ ...newAddr, recipientName: e.target.value })} aria-invalid={!!newErrors.recipientName} className={inputClasses(!!newErrors.recipientName)} />
                      {newErrors.recipientName && <p role="alert" className="text-caption font-bold text-ragab-danger mt-1">{newErrors.recipientName}</p>}
                    </div>
                    <div>
                      <label htmlFor="co-phone" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.phone} *</label>
                      <input id="co-phone" type="tel" inputMode="tel" dir="ltr" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} aria-invalid={!!newErrors.phone} className={cn(inputClasses(!!newErrors.phone), 'text-end')} />
                      {newErrors.phone && <p role="alert" className="text-caption font-bold text-ragab-danger mt-1">{newErrors.phone}</p>}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="co-village" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.village} *</label>
                    <select
                      id="co-village"
                      value={newAddr.zoneId}
                      onChange={(e) => {
                        // The zone is the pricing key; its Arabic name stays the display village.
                        const zone = zones.find((z) => z.id === e.target.value);
                        setNewAddr({ ...newAddr, zoneId: e.target.value, village: zone?.nameAr ?? '' });
                      }}
                      className={inputClasses(!!newErrors.village)}
                    >
                      <option value="">{t.checkout.selectVillage}</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {zoneName(z)} — {z.deliveryFee === 0 ? t.cart.free : `${z.deliveryFee} ${t.common.egp}`}
                        </option>
                      ))}
                    </select>
                    {newErrors.village && <p role="alert" className="text-caption font-bold text-ragab-danger mt-1">{newErrors.village}</p>}
                  </div>
                  <div>
                    <label htmlFor="co-street" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.streetAddress} *</label>
                    <input id="co-street" type="text" value={newAddr.streetAddress} onChange={(e) => setNewAddr({ ...newAddr, streetAddress: e.target.value })} aria-invalid={!!newErrors.streetAddress} className={inputClasses(!!newErrors.streetAddress)} />
                    {newErrors.streetAddress && <p role="alert" className="text-caption font-bold text-ragab-danger mt-1">{newErrors.streetAddress}</p>}
                  </div>
                  <div>
                    <label htmlFor="co-landmark" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.landmark}</label>
                    <input id="co-landmark" type="text" value={newAddr.landmark} onChange={(e) => setNewAddr({ ...newAddr, landmark: e.target.value })} className={inputClasses(false)} />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button type="button" variant="primary" onClick={saveNewAddress} isLoading={savingAddress} leftIcon={<Check className="w-4 h-4" />}>
                      {t.checkout.useThisAddress}
                    </Button>
                    {addresses.length > 0 && (
                      <Button type="button" variant="outline" onClick={() => setShowNewForm(false)} disabled={savingAddress}>
                        {t.common.cancel}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {submitError && step === 1 && <p role="alert" className="text-body-sm font-bold text-ragab-danger">{submitError}</p>}

              <div className="pt-4 flex justify-end">
                <Button type="button" variant="primary" onClick={goToStep2} disabled={!selectedAddressId || showNewForm}>
                  <span>{t.checkout.step2}</span>
                  <ArrowLeft className="w-4 h-4 ltr:rotate-180" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 — payment */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-h3 text-ragab-ink-800 flex items-center gap-2 pb-2 border-b border-ragab-ink-100">
                <CreditCard className="w-5 h-5 text-ragab-brand-700" />
                <span>{t.checkout.paymentMethod}</span>
              </h2>
              <div className="space-y-3" role="radiogroup" aria-label={t.checkout.paymentMethod}>
                {paymentOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border transition-all',
                      opt.disabled ? 'opacity-60 cursor-not-allowed bg-ragab-ink-50 border-ragab-ink-200' : 'cursor-pointer',
                      !opt.disabled && paymentMethod === opt.value ? 'bg-ragab-cream/60 border-ragab-brand-500 shadow-subtle' : !opt.disabled ? 'bg-white border-ragab-ink-200 hover:bg-ragab-ink-50' : ''
                    )}
                  >
                    <input type="radio" name="payment" disabled={opt.disabled} checked={paymentMethod === opt.value} onChange={() => setPaymentMethod(opt.value)} className="mt-1 accent-ragab-brand-500" />
                    <span>
                      <span className="flex items-center gap-2">
                        {opt.icon}
                        <strong className="text-body-sm font-bold text-ragab-ink-800">{opt.title}</strong>
                      </span>
                      <span className="block text-caption text-ragab-ink-500 mt-1">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div>
                <label htmlFor="co-notes" className="text-label text-ragab-ink-700 block mb-1">{t.checkout.notes}</label>
                <textarea id="co-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 bg-ragab-ink-50 border border-ragab-ink-200 rounded-lg text-body-sm focus:outline-none focus:ring-2 focus:ring-ragab-brand-500/40 focus:border-ragab-brand-500 focus:bg-white transition-colors" />
              </div>
              <div className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>{t.common.edit}</Button>
                <Button type="button" variant="primary" onClick={() => setStep(3)}>
                  <span>{t.checkout.step3}</span>
                  <ArrowLeft className="w-4 h-4 ltr:rotate-180" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — review & submit */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h2 className="text-h3 text-ragab-ink-800 pb-2 border-b border-ragab-ink-100">{t.checkout.step3}</h2>
              <div className="bg-ragab-ink-50 p-4 rounded-xl space-y-2 text-body-sm">
                {selectedAddress && (
                  <>
                    <div><strong>{t.checkout.recipientName}:</strong> {selectedAddress.recipientName} (<span dir="ltr">{selectedAddress.phone}</span>)</div>
                    <div><strong>{t.checkout.village}:</strong> {selectedAddress.village} — {selectedAddress.streetAddress}{selectedAddress.landmark ? ` (${selectedAddress.landmark})` : ''}</div>
                  </>
                )}
                <div><strong>{t.checkout.paymentMethod}:</strong> {paymentLabel(paymentMethod)}</div>
              </div>
              <div className="divide-y divide-ragab-ink-100 border border-ragab-ink-100 rounded-xl p-3">
                {cart.map(({ product, quantity }) => (
                  <div key={product.id} className="py-2 flex justify-between gap-3 text-body-sm">
                    <span className="min-w-0 truncate">{product.nameAr} <span className="text-ragab-ink-500">×{quantity}</span></span>
                    <span className="font-bold shrink-0">{(product.price * quantity).toFixed(2)} {t.common.egp}</span>
                  </div>
                ))}
              </div>
              {submitError && <p role="alert" className="text-body-sm font-bold text-ragab-danger bg-ragab-danger-soft border border-red-200 rounded-lg p-3">{submitError}</p>}
              <div className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>{t.common.edit}</Button>
                <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} disabled={quoteState !== 'idle' || !quote}>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t.checkout.placeOrder}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ===== Order summary — the server's quote for the chosen address ===== */}
        <aside className="lg:col-span-4 bg-white rounded-xl border border-ragab-ink-200 p-5 sm:p-6 shadow-subtle space-y-4 lg:sticky lg:top-24">
          <h2 className="text-h3 text-ragab-ink-800 pb-2 border-b border-ragab-ink-100">{t.cart.orderSummary}</h2>
          {selectedAddress && (
            <p className="text-caption text-ragab-ink-500">
              {t.checkout.deliveryTo} <strong className="text-ragab-ink-700">{selectedAddress.village}</strong>
              {' · '}
              <Link href="#" onClick={(e) => { e.preventDefault(); setStep(1); }} className="text-ragab-brand-700 font-semibold hover:underline">{t.common.edit}</Link>
            </p>
          )}
          {quoteState === 'loading' && (
            <p className="text-body-sm text-ragab-ink-500 inline-flex items-center gap-2" aria-busy><Loader2 className="w-4 h-4 animate-spin" />{t.checkout.quoteLoading}</p>
          )}
          {quoteState === 'error' && <p role="alert" className="text-body-sm font-bold text-ragab-danger">{t.checkout.quoteError}</p>}
          {summaryRows && quoteState === 'idle' && (
            <div className="space-y-2 text-body-sm text-ragab-ink-600">
              <div className="flex justify-between"><span>{t.cart.subtotal} ({cart.length})</span><span>{summaryRows.subtotal.toFixed(2)} {t.common.egp}</span></div>
              {summaryRows.discount > 0 && (
                <div className="flex justify-between text-ragab-success font-bold"><span>{t.cart.discount}{quote?.couponCode ? ` (${quote.couponCode})` : ''}</span><span>− {summaryRows.discount.toFixed(2)} {t.common.egp}</span></div>
              )}
              <div className="flex justify-between"><span>{t.cart.deliveryFee}</span><span>{summaryRows.deliveryFee === 0 ? <span className="text-ragab-success font-bold">{t.cart.free}</span> : `${summaryRows.deliveryFee.toFixed(2)} ${t.common.egp}`}</span></div>
              <div className="flex justify-between text-body font-extrabold text-ragab-ink-800 pt-2 border-t border-ragab-ink-100"><span>{t.cart.total}</span><span>{summaryRows.total.toFixed(2)} {t.common.egp}</span></div>
            </div>
          )}
          {!selectedAddressId && <p className="text-body-sm text-ragab-ink-500">{t.checkout.noAddresses}</p>}
        </aside>
      </form>
    </div>
  );
}
