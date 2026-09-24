'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Phone, MessageSquare, Clock, ShoppingBag, Banknote, CreditCard, Landmark, Loader2, Bell } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getOrderById, getPaymentStep, switchToCod, type PaymentInit } from '../../services/orderService';
import { api, ApiError } from '../../lib/apiClient';
import { Order } from '../../types';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

interface PublicConfig {
  store: { phone: string; whatsapp: string };
}

const PAYMENT_KEY = (orderId: string) => `ragab_payment_${orderId}`;
const MAX_POLLS = 10;
const POLL_MS = 3000;

function readPayment(orderId: string): PaymentInit | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_KEY(orderId));
    return raw ? (JSON.parse(raw) as PaymentInit) : null;
  } catch {
    return null;
  }
}

/**
 * The payment leg as the SERVER reports it. `online` = the customer still has to open the
 * hosted page; `verifying` = they came back from it and we poll the order until the webhook
 * settles it (the provider's `success=` query flag is never read — only its presence tells
 * us we returned). `failed` / `unconfirmed` offer a real way out: retry or cash on delivery.
 */
type Phase = 'loading' | 'cod' | 'transfer' | 'online' | 'verifying' | 'paid' | 'failed' | 'unconfirmed';

function phaseFor(order: Order | null, payment: PaymentInit | null, returned: boolean): Phase {
  if (!order) return 'loading';
  if (order.paymentStatus === 'paid') return 'paid';
  if (order.paymentMethod === 'cod') return 'cod';
  if (order.paymentStatus === 'failed') return 'failed';
  if (payment?.redirectUrl) return returned ? 'verifying' : 'online';
  return 'transfer';
}

function OrderSuccessContent() {
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // Paymob's response callback lands here with its own params (merchant_order_id, success, …).
  const orderId = searchParams.get('orderId') || searchParams.get('merchant_order_id') || '';
  const returned = searchParams.has('success') || searchParams.has('txn_response_code') || searchParams.has('merchant_order_id');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<PaymentInit | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [o, cfg] = await Promise.all([
          orderId ? getOrderById(orderId) : Promise.resolve(null),
          api.get<PublicConfig>('/app/config').catch(() => null),
        ]);
        if (!alive) return;
        setOrder(o);
        setConfig(cfg);
        // The step handed over at checkout, or — after a reload — the same step from the server.
        let p = orderId ? readPayment(orderId) : null;
        const awaiting = o && o.status === 'pending' && (o.paymentStatus === 'pending' || o.paymentStatus === 'failed');
        if (!p && awaiting && o.paymentMethod !== 'cod') p = await getPaymentStep(orderId).catch(() => null);
        if (alive) setPayment(p);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [orderId]);

  const base = phaseFor(order, payment, returned);
  const phase: Phase = base === 'verifying' && timedOut ? 'unconfirmed' : base;

  // Poll the order while verifying — the webhook (not this page) decides the outcome.
  useEffect(() => {
    if (phase !== 'verifying' || !orderId) return;
    let alive = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      attempts += 1;
      const o = await getOrderById(orderId);
      if (!alive) return;
      if (o) {
        setOrder(o);
        if (o.paymentStatus === 'paid' || o.paymentStatus === 'failed') return;
      }
      if (attempts >= MAX_POLLS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase, orderId, pollKey]);

  const checkAgain = () => {
    setTimedOut(false);
    setPollKey((k) => k + 1);
  };

  const onSwitchToCod = async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      const o = await switchToCod(orderId);
      setOrder(o);
      setPayment({ status: 'created', paymentMethod: 'cod' });
      try {
        sessionStorage.removeItem(PAYMENT_KEY(orderId));
      } catch {
        /* ignore */
      }
      showToast(t.orderSuccess.switchedToCod, 'success');
    } catch (e) {
      showToast(e instanceof ApiError ? (isRTL ? e.bilingual.ar : e.bilingual.en) : t.states.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const method = order?.paymentMethod ?? payment?.paymentMethod ?? 'cod';
  const phone = config?.store.phone?.replace(/\s+/g, '') ?? '';
  const whatsapp = config?.store.whatsapp?.replace(/[^\d]/g, '') ?? '';
  const recovering = phase === 'failed' || phase === 'unconfirmed';

  const header = (() => {
    switch (phase) {
      case 'verifying':
        return { icon: <Loader2 className="w-10 h-10 animate-spin" />, tone: 'bg-ragab-info-soft text-ragab-info', title: t.orderSuccess.verifying, desc: t.orderSuccess.verifyingDesc };
      case 'failed':
        return { icon: <XCircle className="w-10 h-10" />, tone: 'bg-ragab-danger-soft text-ragab-danger', title: t.orderSuccess.failedTitle, desc: t.orderSuccess.failedDesc };
      case 'unconfirmed':
        return { icon: <Clock className="w-10 h-10" />, tone: 'bg-ragab-warning-soft text-ragab-warning', title: t.orderSuccess.pendingTitle, desc: t.orderSuccess.pendingDesc };
      case 'paid':
        return { icon: <CheckCircle2 className="w-10 h-10" />, tone: 'bg-ragab-success-soft text-ragab-success', title: t.orderSuccess.paidTitle, desc: t.orderSuccess.paidDesc };
      default:
        return { icon: <CheckCircle2 className="w-10 h-10" />, tone: 'bg-ragab-success-soft text-ragab-success', title: t.orderSuccess.title, desc: t.orderSuccess.subtitle };
    }
  })();

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6 text-center font-arabic">
      <div className="bg-white rounded-2xl border border-ragab-ink-200 p-8 shadow-card space-y-6" data-phase={phase}>
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-subtle animate-in zoom-in-75 ${header.tone}`}>{header.icon}</div>

        <div>
          <h1 className="text-h1 text-ragab-ink-800 mb-2">{header.title}</h1>
          <p className="text-body-sm text-ragab-ink-600 max-w-md mx-auto leading-relaxed">{header.desc}</p>
        </div>

        {/* Order meta */}
        <div className="grid grid-cols-2 gap-3 bg-ragab-cream/60 p-4 rounded-xl border border-ragab-brand-200 text-caption text-ragab-ink-800 font-bold">
          <div>
            <div className="text-ragab-ink-500 font-normal text-[11px] mb-0.5">{t.orderSuccess.orderNumber}</div>
            <div className="text-body text-ragab-brand-700 font-mono font-extrabold" dir="ltr">
              {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : order?.orderNumber ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-ragab-ink-500 font-normal text-[11px] mb-0.5">{t.orderSuccess.estimatedTime}</div>
            <div className="text-body-sm text-ragab-success flex items-center justify-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{order?.estimatedDelivery || t.orderSuccess.estimatedWindow}</span>
            </div>
          </div>
        </div>

        {/* Payment — what happens next, as the server sees it */}
        <div className="text-start rounded-xl border border-ragab-ink-200 p-4 space-y-3">
          <h4 className="font-bold text-ragab-ink-800 text-body-sm flex items-center gap-2">
            {method === 'cod' ? <Banknote className="w-4 h-4 text-ragab-success" /> : payment?.redirectUrl ? <CreditCard className="w-4 h-4 text-ragab-info" /> : <Landmark className="w-4 h-4 text-ragab-info" />}
            {t.orderSuccess.paymentTitle}: {method === 'cod' ? t.checkout.cod : method === 'vodafone_cash' ? t.checkout.vodafoneCash : t.checkout.instapay}
          </h4>

          {phase === 'cod' && <p className="text-body-sm text-ragab-ink-600">{t.orderSuccess.codNote}</p>}
          {phase === 'paid' && <p className="text-body-sm text-ragab-ink-600">{t.orderSuccess.paidDesc}</p>}
          {phase === 'verifying' && (
            <p className="text-body-sm text-ragab-ink-600 inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.orderSuccess.verifyingDesc}
            </p>
          )}

          {phase === 'online' && payment?.redirectUrl && (
            <>
              <p className="text-body-sm text-ragab-ink-600">{t.orderSuccess.payOnlineNote}</p>
              <a href={payment.redirectUrl} className="block">
                <Button variant="primary" fullWidth>{t.orderSuccess.payNow}</Button>
              </a>
            </>
          )}

          {phase === 'transfer' && (
            <>
              {payment?.instructions && (
                <p className="text-body-sm font-semibold text-ragab-ink-800 bg-ragab-ink-50 rounded-lg p-3 whitespace-pre-line">{isRTL ? payment.instructions.ar : payment.instructions.en}</p>
              )}
              <p className="text-body-sm text-ragab-ink-600">{t.orderSuccess.transferNote}</p>
              <Button variant="outline" size="sm" onClick={onSwitchToCod} disabled={busy} isLoading={busy}>{t.orderSuccess.switchToCod}</Button>
            </>
          )}

          {recovering && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {payment?.redirectUrl && (
                <a href={payment.redirectUrl} className="block">
                  <Button variant="primary" fullWidth>{t.orderSuccess.retryPayment}</Button>
                </a>
              )}
              <Button variant="outline" fullWidth onClick={onSwitchToCod} disabled={busy} isLoading={busy}>{t.orderSuccess.switchToCod}</Button>
              {phase === 'unconfirmed' && (
                <Button variant="secondary" fullWidth onClick={checkAgain} disabled={busy} className="sm:col-span-2">{t.orderSuccess.checkAgain}</Button>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        {order && (
          <div className="text-start text-caption space-y-2 pt-4 border-t border-ragab-ink-100">
            <h4 className="font-bold text-ragab-ink-800 text-body-sm mb-2">{t.orderSuccess.summaryTitle}</h4>
            <div className="bg-ragab-ink-50 p-3 rounded-lg space-y-1">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between py-1 border-b border-ragab-ink-200/40 last:border-none">
                  <span>{item.productNameAr} (×{item.quantity})</span>
                  <span className="font-bold">{item.total.toFixed(2)} {t.common.egp}</span>
                </div>
              ))}
              {order.deliveryFee > 0 && (
                <div className="flex justify-between py-1 text-ragab-ink-600"><span>{t.cart.deliveryFee}</span><span>{order.deliveryFee.toFixed(2)} {t.common.egp}</span></div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between py-1 text-ragab-success"><span>{t.cart.discount}</span><span>− {order.discount.toFixed(2)} {t.common.egp}</span></div>
              )}
              <div className="flex justify-between font-extrabold pt-2 text-body-sm text-ragab-ink-800">
                <span>{t.cart.total}</span>
                <span>{order.total.toFixed(2)} {t.common.egp}</span>
              </div>
            </div>
          </div>
        )}

        <p className="text-caption text-ragab-ink-500 inline-flex items-center gap-1.5 justify-center">
          <Bell className="w-3.5 h-3.5" />
          {t.orderSuccess.howUpdated}
        </p>

        {/* Support */}
        {(phone || whatsapp) && (
          <div className="pt-4 border-t border-ragab-ink-100 space-y-3">
            <p className="text-caption font-semibold text-ragab-ink-600">{t.orderSuccess.needHelp}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {phone && (
                <a href={`tel:${phone}`}>
                  <Button variant="outline" size="sm"><Phone className="w-4 h-4 text-ragab-brand-700" /><span>{t.orderSuccess.callStore}</span></Button>
                </a>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm"><MessageSquare className="w-4 h-4 text-ragab-success" /><span>{t.orderSuccess.whatsappStore}</span></Button>
                </a>
              )}
            </div>
          </div>
        )}

        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {order && (
            <Link href={`/account/orders/${encodeURIComponent(order.id)}`}>
              <Button variant="secondary" size="lg" fullWidth>{t.orderSuccess.trackOrder}</Button>
            </Link>
          )}
          <Link href="/">
            <Button variant="primary" size="lg" fullWidth>
              <ShoppingBag className="w-5 h-5" />
              <span>{t.orderSuccess.continueShopping}</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-arabic">…</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}
