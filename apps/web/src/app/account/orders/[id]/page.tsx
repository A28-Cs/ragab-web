'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  RotateCcw,
  MapPin,
  Truck,
  FileDown,
  XCircle,
  Headset,
  Loader2,
  Undo2,
} from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { useCart } from '../../../../context/CartContext';
import { useToast } from '../../../../components/ui/Toast';
import { getOrderById, cancelMyOrder } from '../../../../services/orderService';
import { getProducts } from '../../../../services/productService';
import { ApiError } from '../../../../lib/apiClient';
import { Order } from '../../../../types';
import { Card, CardHeader } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { StatusPill } from '../../../../components/ui/StatusPill';
import { Timeline, TimelineStep } from '../../../../components/ui/Timeline';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ORDER_PIPELINE, ORDER_STATUS_TONE } from '../../../../lib/orderStatus';
import { LiveMap } from '../../../../components/ui/LiveMap';
import { EngeznyDeliveryPhoto } from '../../../../components/ui/EngeznyDeliveryPhoto';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');
  const { t, isRTL } = useLanguage();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getOrderById(id);
        if (alive) setOrder(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const buildTimeline = (o: Order): TimelineStep[] => {
    const labels = t.account.orderStatus;
    if (o.status === 'cancelled') {
      return [
        { label: labels.pending, state: 'done' },
        { label: labels.cancelled, state: 'cancelled' },
      ];
    }
    const currentIndex = ORDER_PIPELINE.indexOf(o.status);
    return ORDER_PIPELINE.map((s, i) => ({
      label: labels[s],
      state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming',
      timestamp: i === currentIndex ? o.estimatedDelivery : undefined,
    }));
  };

  const onReorder = async () => {
    if (!order) return;
    const products = await getProducts();
    let added = 0;
    order.items.forEach((it) => {
      const p = products.find((pr) => pr.id === it.id);
      if (p) {
        addToCart(p, it.quantity);
        added++;
      }
    });
    showToast(added > 0 ? t.account.reorderDone : t.states.error, added > 0 ? 'success' : 'error');
  };

  const onCancel = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      // The server is the source of truth: render the order it returns, never a local
      // optimistic copy, so the status is identical after a reload.
      const updated = await cancelMyOrder(order.id);
      setOrder(updated);
      showToast(t.account.orderCancelled, 'success');
      setCancelOpen(false);
    } catch (e) {
      const message = e instanceof ApiError ? (isRTL ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    } finally {
      setCancelling(false);
    }
  };

  const paymentLabel = (m: Order['paymentMethod']) =>
    m === 'cod' ? t.account.paymentCod : m === 'vodafone_cash' ? t.account.paymentVodafone : t.account.paymentInstapay;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <Loader2 className="w-7 h-7 animate-spin text-ragab-ink-400" />
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon={<XCircle className="w-8 h-8 text-ragab-danger" />}
        title={t.account.orderNotFound}
        description={t.account.noOrdersDesc}
        actionLabel={t.account.myOrders}
        actionHref="/account/orders"
      />
    );
  }

  // Mirrors the server rule (cancelMyOrder): a customer may only cancel while pending.
  const canCancel = order.status === 'pending';

  return (
    <div className="space-y-4 pb-8">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
        <ChevronLeft className="w-4 h-4 ltr:rotate-180" />
        {t.account.myOrders}
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-h1 text-ragab-ink-800" dir="ltr">
            {order.orderNumber}
          </h1>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{order.createdAt}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.refunded && (
            <StatusPill tone="info" dot={false}>
              <span className="inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />{t.account.refunded}</span>
            </StatusPill>
          )}
          <StatusPill tone={ORDER_STATUS_TONE[order.status]}>{t.account.orderStatus[order.status]}</StatusPill>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          {order.status === 'on_the_way' && (
            <Card>
              <CardHeader title="التتبع المباشر" />
              <div className="p-4 pt-0">
                <LiveMap orderId={order.id} />
              </div>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader title={t.account.orderTimeline} />
            <Timeline steps={buildTimeline(order)} />
          </Card>

          {/* Items */}
          <Card>
            <CardHeader title={t.account.orderDetails} />
            <ul className="divide-y divide-ragab-ink-100">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image} alt={it.productNameAr} className="w-14 h-14 rounded-lg object-cover border border-ragab-ink-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-semibold text-ragab-ink-800 truncate">{it.productNameAr}</p>
                    <p className="text-caption text-ragab-ink-500">
                      {it.unit} · {it.quantity} × {it.price} {t.common.egp}
                    </p>
                  </div>
                  <p className="text-body-sm font-bold text-ragab-ink-800 shrink-0">
                    {it.total} {t.common.egp}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Delivery Photo (shown when delivered via Engezny) */}
          {order.status === 'delivered' && (
            <Card>
              <CardHeader title="📸 صورة التوصيل" />
              <div className="p-4 pt-0">
                <EngeznyDeliveryPhoto orderId={order.id} />
              </div>
            </Card>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {/* Summary */}
          <Card>
            <CardHeader title={t.account.orderSummary} />
            <dl className="space-y-2 text-body-sm">
              <div className="flex justify-between">
                <dt className="text-ragab-ink-500">{t.account.subtotal}</dt>
                <dd className="text-ragab-ink-700 font-semibold">{order.subtotal} {t.common.egp}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ragab-ink-500">{t.account.deliveryFee}</dt>
                <dd className="text-ragab-ink-700 font-semibold">{order.deliveryFee} {t.common.egp}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-ragab-success">
                  <dt>{t.account.discount}</dt>
                  <dd className="font-semibold">-{order.discount} {t.common.egp}</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 mt-2 border-t border-ragab-ink-100">
                <dt className="text-ragab-ink-800 font-bold">{t.account.total}</dt>
                <dd className="text-price text-ragab-ink-800">{order.total} {t.common.egp}</dd>
              </div>
              {order.refunded && (
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-ragab-danger-soft text-ragab-danger">
                  <dt className="font-bold inline-flex items-center gap-1.5">
                    <Undo2 className="w-4 h-4" />
                    {t.account.refundedAmount}
                  </dt>
                  <dd className="font-bold">-{order.total} {t.common.egp}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Address & payment */}
          <Card>
            <div className="flex items-start gap-2.5">
              <MapPin className="w-5 h-5 text-ragab-success shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-caption font-bold text-ragab-ink-500">{t.account.deliveryAddress}</p>
                <p className="text-body-sm text-ragab-ink-700 mt-0.5">{order.deliveryAddress.recipientName}</p>
                <p className="text-caption text-ragab-ink-500">
                  {order.deliveryAddress.village} — {order.deliveryAddress.streetAddress}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-ragab-ink-100">
              <Truck className="w-5 h-5 text-ragab-info shrink-0" />
              <div>
                <p className="text-caption font-bold text-ragab-ink-500">{t.account.paymentMethod}</p>
                <p className="text-body-sm text-ragab-ink-700">{paymentLabel(order.paymentMethod)}</p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="primary" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={onReorder}>
              {t.account.reorder}
            </Button>
            {/* The timeline above IS the tracking; the invoice is a real printable page. */}
            <Link href={`/account/orders/${encodeURIComponent(order.id)}/invoice`} className="contents">
              <Button variant="outline" leftIcon={<FileDown className="w-4 h-4" />} fullWidth>
                {t.account.downloadInvoice}
              </Button>
            </Link>
            <Link href="/contact" className="contents">
              <Button variant="outline" leftIcon={<Headset className="w-4 h-4" />} fullWidth>
                {t.account.contactSupport}
              </Button>
            </Link>
            {canCancel && (
              <Button
                variant="ghost"
                className="col-span-2 text-ragab-danger hover:bg-ragab-danger-soft"
                leftIcon={<XCircle className="w-4 h-4" />}
                onClick={() => setCancelOpen(true)}
              >
                {t.account.cancelOrder}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={onCancel}
        title={t.account.cancelConfirmTitle}
        description={t.account.cancelConfirmDesc}
        confirmLabel={t.account.cancelOrder}
        destructive
        isLoading={cancelling}
      />
    </div>
  );
}
