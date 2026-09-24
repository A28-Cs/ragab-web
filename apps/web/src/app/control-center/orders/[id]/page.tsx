'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  MapPin,
  Truck,
  Pencil,
  XCircle,
  Undo2,
  Check,
  ArrowLeftRight,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useToast } from '../../../../components/ui/Toast';
import {
  getOrderById,
  updateOrderStatus,
  updateOrderDelivery,
} from '../../../../services/orderService';
import { issueRefund, cancelOrder } from '../../../../services/refundService';
import { getPaymentByOrderNumber } from '../../../../services/paymentService';
import { useAudit } from '../../../../lib/useAudit';
import { PermissionError } from '../../../../lib/rbac';
import { ApiError } from '../../../../lib/apiClient';
import { Address, Order, OrderStatus, PaymentStatus } from '../../../../types';
import { RequirePermission } from '../../../../components/auth/RequirePermission';
import { Can } from '../../../../components/auth/Can';
import { Card, CardHeader } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { StatusPill } from '../../../../components/ui/StatusPill';
import { Timeline, TimelineStep } from '../../../../components/ui/Timeline';
import { Select } from '../../../../components/ui/Select';
import { Drawer } from '../../../../components/ui/Drawer';
import { FormField } from '../../../../components/ui/FormField';
import { Input } from '../../../../components/ui/Input';
import { Textarea } from '../../../../components/ui/Textarea';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ORDER_PIPELINE, ORDER_STATUS_TONE } from '../../../../lib/orderStatus';
import { EngeznyDeliveryPhoto } from '../../../../components/ui/EngeznyDeliveryPhoto';

function OrderAdminDetailInner() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [order, setOrder] = useState<Order | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>('pending');
  const [savingStatus, setSavingStatus] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [addr, setAddr] = useState<Address | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOrderById(id);
      setOrder(data);
      if (data) {
        setStatusDraft(data.status);
        const pay = await getPaymentByOrderNumber(data.orderNumber);
        setPaymentStatus(pay?.status ?? null);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      // Surface the server's rule (e.g. "refund before cancelling a paid order").
      const message = e instanceof PermissionError ? t.states.forbiddenTitle : e instanceof ApiError ? (ar ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    }
  };

  const buildTimeline = (o: Order): TimelineStep[] => {
    const labels = t.account.orderStatus;
    if (o.status === 'cancelled') {
      return [
        { label: labels.pending, state: 'done' },
        { label: labels.cancelled, state: 'cancelled' },
      ];
    }
    const idx = ORDER_PIPELINE.indexOf(o.status);
    return ORDER_PIPELINE.map((s, i) => ({
      label: labels[s],
      state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
    }));
  };

  const onUpdateStatus = (nextStatus: OrderStatus) => {
    if (!order) return;
    setSavingStatus(true);
    guard(async () => {
      await updateOrderStatus(order.id, nextStatus, permissions);
      await load();
      showToast(t.adminOrders.statusUpdated, 'success');
    }).finally(() => setSavingStatus(false));
  };

  const advance = () => {
    if (!order) return;
    const idx = ORDER_PIPELINE.indexOf(order.status);
    if (idx >= 0 && idx < ORDER_PIPELINE.length - 1) onUpdateStatus(ORDER_PIPELINE[idx + 1]);
  };

  const openEdit = () => {
    if (!order) return;
    setAddr({ ...order.deliveryAddress });
    setEditOpen(true);
  };

  const onSaveAddr = () => {
    if (!order || !addr) return;
    setSavingAddr(true);
    guard(async () => {
      await updateOrderDelivery(order.id, addr, permissions);
      await load();
      showToast(t.adminOrders.deliverySaved, 'success');
      setEditOpen(false);
    }).finally(() => setSavingAddr(false));
  };

  const onCancel = () => {
    if (!order) return;
    setBusy(true);
    guard(async () => {
      const res = await cancelOrder(order.id, permissions);
      // One combined event when the cancellation also refunds a paid order.
      if (res.refunded) {
        record('order_cancelled_refunded', 'orders', order.orderNumber, { metadata: { amount: String(res.amount) } });
      } else {
        record('order_status_changed', 'orders', order.orderNumber, { metadata: { status: 'cancelled' } });
      }
      await load();
      showToast(res.refunded ? t.adminOrders.orderCancelledRefunded : t.adminOrders.orderCancelled, 'success');
    }).finally(() => {
      setBusy(false);
      setCancelOpen(false);
    });
  };

  const onRefund = (reauth?: string) => {
    if (!order) return;
    setBusy(true);
    guard(async () => {
      const res = await issueRefund(order.id, permissions, reauth);
      // A refund also cancels the order — log it as one combined event so the
      // audit log shows the cancellation and refund together.
      record(
        res.orderUpdated ? 'order_cancelled_refunded' : 'refund_issued',
        res.orderUpdated ? 'orders' : 'payments',
        order.orderNumber,
        { metadata: { amount: String(res.amount) } }
      );
      await load();
      showToast(res.paymentUpdated ? t.adminOrders.refundIssuedLinked : t.adminOrders.refundIssued, 'success');
    }).finally(() => {
      setBusy(false);
      setRefundOpen(false);
    });
  };

  const paymentLabel = (m: Order['paymentMethod']) =>
    m === 'cod' ? t.account.paymentCod : m === 'vodafone_cash' ? t.account.paymentVodafone : t.account.paymentInstapay;

  const PAY_TONE: Record<PaymentStatus, 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = { paid: 'success', pending: 'warning', refunded: 'info', failed: 'danger', cancelled: 'neutral' };
  const paymentStatusLabel = (s: PaymentStatus) =>
    ({ paid: t.adminPayments.statusPaid, pending: t.adminPayments.statusPending, refunded: t.adminPayments.statusRefunded, failed: t.adminPayments.statusFailed, cancelled: t.adminPayments.statusCancelled }[s]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
      </div>
    );
  }
  if (!order) {
    return (
      <EmptyState
        icon={<XCircle className="w-8 h-8 text-ragab-danger" />}
        title={t.account.orderNotFound}
        description={t.adminOrders.subtitle}
        actionLabel={t.adminOrders.title}
        actionHref="/control-center/orders"
      />
    );
  }

  const canEdit = hasPermission('orders', 'edit');
  const isTerminal = order.status === 'delivered' || order.status === 'cancelled';
  const statusOptions = (['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled'] as OrderStatus[]).map((s) => ({
    value: s,
    label: t.account.orderStatus[s],
  }));

  return (
    <div className="space-y-4">
      <Link href="/control-center/orders" className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
        <ChevronLeft className="w-4 h-4 ltr:rotate-180" />
        {t.adminOrders.title}
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-h2 text-ragab-ink-800" dir="ltr">{order.orderNumber}</h2>
          {order.manual && <Badge variant="neutral">{t.adminOrders.manualBadge}</Badge>}
          {order.refunded && <Badge variant="warning">{t.adminOrders.refundedBadge}</Badge>}
        </div>
        <StatusPill tone={ORDER_STATUS_TONE[order.status]}>{t.account.orderStatus[order.status]}</StatusPill>
      </div>
      <p className="text-body-sm text-ragab-ink-500 -mt-2">{order.createdAt}</p>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          {/* Status management */}
          <Card>
            <CardHeader title={t.adminOrders.changeStatus} />
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <FormField label={t.adminOrders.colStatus}>
                  <Select
                    options={statusOptions}
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value as OrderStatus)}
                    disabled={!canEdit}
                  />
                </FormField>
              </div>
              <Button
                variant="primary"
                leftIcon={<Check className="w-4 h-4" />}
                onClick={() => onUpdateStatus(statusDraft)}
                isLoading={savingStatus}
                disabled={!canEdit || statusDraft === order.status}
              >
                {t.adminOrders.updateStatus}
              </Button>
              {!isTerminal && (
                <Button variant="secondary" leftIcon={<ArrowLeftRight className="w-4 h-4" />} onClick={advance} disabled={!canEdit || savingStatus}>
                  {t.adminOrders.advanceStatus}
                </Button>
              )}
            </div>
            <div className="mt-5">
              <Timeline steps={buildTimeline(order)} />
            </div>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader title={t.adminOrders.orderDetails} />
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
        </div>

        {/* Delivery Photo (Ragab → Engezny integrated orders) */}
        {order.status === 'delivered' && (
          <Card>
            <CardHeader title="📸 صورة التوصيل" />
            <EngeznyDeliveryPhoto orderId={order.id} />
          </Card>
        )}

        {/* Side column */}
        <div className="space-y-4">
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
                    {t.admin.refundedAmount}
                  </dt>
                  <dd className="font-bold">-{order.total} {t.common.egp}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title={t.adminOrders.customerInfo}
              action={
                // Same rule as the server: the address can change only before dispatch.
                canEdit && (order.status === 'pending' || order.status === 'preparing') ? (
                  <button onClick={openEdit} className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-brand-700 hover:underline">
                    <Pencil className="w-3.5 h-3.5" />
                    {t.common.edit}
                  </button>
                ) : undefined
              }
            />
            <div className="flex items-start gap-2.5">
              <MapPin className="w-5 h-5 text-ragab-success shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-bold text-ragab-ink-800">{order.deliveryAddress.recipientName}</p>
                {/* One-tap contact for whoever is preparing or delivering the order. */}
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <a href={`tel:${order.deliveryAddress.phone}`} className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-700 hover:text-ragab-brand-700" dir="ltr">
                    <Phone className="w-3.5 h-3.5" />
                    {order.deliveryAddress.phone}
                  </a>
                  <a
                    href={`https://wa.me/20${order.deliveryAddress.phone.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-success hover:underline"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                </div>
                <p className="text-caption text-ragab-ink-500 mt-1">
                  {order.deliveryAddress.village} — {order.deliveryAddress.streetAddress}
                </p>
                {order.deliveryAddress.landmark && <p className="text-caption text-ragab-ink-400">{order.deliveryAddress.landmark}</p>}
                {order.deliveryAddress.notes && <p className="text-caption text-ragab-ink-500 italic mt-0.5">{order.deliveryAddress.notes}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-ragab-ink-100">
              <Truck className="w-5 h-5 text-ragab-info shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-caption font-bold text-ragab-ink-500">{t.account.paymentMethod}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-body-sm text-ragab-ink-700">{paymentLabel(order.paymentMethod)}</p>
                  {paymentStatus && <StatusPill tone={PAY_TONE[paymentStatus]}>{paymentStatusLabel(paymentStatus)}</StatusPill>}
                </div>
              </div>
            </div>
          </Card>

          {/* Danger / money actions */}
          <div className="flex flex-col gap-2.5">
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <Can resource="orders" action="edit">
                <Button variant="outline" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setCancelOpen(true)} fullWidth>
                  {t.adminOrders.cancelOrder}
                </Button>
              </Can>
            )}
            {/* Only captured money can be refunded — a pending/cancelled payment has nothing to return. */}
            {!order.refunded && paymentStatus === 'paid' && (
              <Can resource="payments" action="approve">
                <Button variant="outline" leftIcon={<Undo2 className="w-4 h-4" />} onClick={() => setRefundOpen(true)} fullWidth>
                  {t.adminOrders.refund}
                </Button>
              </Can>
            )}
            {/* No "delete order": financial history is never removed (cancel/refund instead). */}
          </div>
        </div>
      </div>

      {/* Edit delivery drawer */}
      <Drawer isOpen={editOpen} onClose={() => setEditOpen(false)} title={t.adminOrders.editDelivery}>
        {addr && (
          <div className="space-y-4">
            <FormField label={t.adminOrders.recipientName}>
              <Input value={addr.recipientName} onChange={(e) => setAddr({ ...addr, recipientName: e.target.value })} />
            </FormField>
            <FormField label={t.adminOrders.phone}>
              <Input dir="ltr" value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} />
            </FormField>
            <FormField label={t.adminOrders.village}>
              <Input value={addr.village} onChange={(e) => setAddr({ ...addr, village: e.target.value })} />
            </FormField>
            <FormField label={t.adminOrders.streetAddress}>
              <Textarea value={addr.streetAddress} onChange={(e) => setAddr({ ...addr, streetAddress: e.target.value })} />
            </FormField>
            <FormField label={t.adminOrders.landmark}>
              <Input value={addr.landmark ?? ''} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
            </FormField>
            <div className="flex items-center gap-2.5 pt-2">
              <Button variant="primary" fullWidth onClick={onSaveAddr} isLoading={savingAddr} leftIcon={<Check className="w-4 h-4" />}>
                {t.common.saveChanges}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingAddr}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog isOpen={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={onCancel} title={t.adminOrders.cancelConfirmTitle} description={t.adminOrders.cancelConfirmDesc} confirmLabel={t.adminOrders.cancelOrder} destructive isLoading={busy} />
      <ConfirmDialog isOpen={refundOpen} onClose={() => setRefundOpen(false)} onConfirm={onRefund} title={t.adminOrders.refundConfirmTitle} description={t.adminOrders.refundConfirmDesc} confirmLabel={t.adminOrders.refund} requireReauth reauthNote={t.admin.reauthNote} isLoading={busy} />
    </div>
  );
}

export default function OrderAdminDetailPage() {
  return (
    <RequirePermission resource="orders" action="view">
      <OrderAdminDetailInner />
    </RequirePermission>
  );
}
