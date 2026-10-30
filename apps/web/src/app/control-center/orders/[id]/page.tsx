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
  Clock,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  Navigation,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useToast } from '../../../../components/ui/Toast';
import {
  getOrderById,
  updateOrderStatus,
  updateOrderDelivery,
  updatePrescriptionDecision,
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
import {
  ORDER_PIPELINE,
  ORDER_STATUS_TONE,
  DETAILED_STATUS_TONE,
  DETAILED_STATUS_LABELS_AR,
  DELIVERY_STATUS_TONE,
  DELIVERY_STATUS_LABELS_AR,
  REASON_CODE_LABELS_AR,
} from '../../../../lib/orderStatus';
import { EngeznyDeliveryPhoto } from '../../../../components/ui/EngeznyDeliveryPhoto';

function OrderAdminDetailInner() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const isRTL = ar;
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
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('شك في صحة الروشتة / دواء خاضع للرقابة المشددة - يلزم زيارة الصيدلية شخصياً بصحبة أصل الروشتة الورقية والبطاقة لاستلام العلاج');

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
    if (o.status === 'cancelled') {
      return [
        {
          label: ar ? 'تم استلام الطلب' : 'Order Received',
          description: ar ? 'تم تسجيل وتوثيق طلب العميل' : 'Order received',
          timestamp: o.createdAt,
          state: 'done',
        },
        {
          label: ar ? 'تم إلغاء الطلب' : 'Order Cancelled',
          description: ar ? (o.rejectionReason || 'تم إلغاء الطلب') : 'Order cancelled',
          state: 'cancelled',
        },
      ];
    }

    if (o.detailedStatus === 'rejected') {
      return [
        {
          label: ar ? 'تم استلام الطلب' : 'Order Received',
          timestamp: o.createdAt,
          state: 'done',
        },
        {
          label: ar ? 'تم رفض الطلب' : 'Order Rejected',
          description: ar ? (o.rejectionReason || o.prescriptionRejectionReason || 'رفض من قِبل الصيدلي') : 'Rejected by pharmacy',
          state: 'cancelled',
        },
      ];
    }

    const detailed = o.detailedStatus || (o.status as any);
    const delivery = o.deliveryStatus || o.deliveryJob?.status;
    const hasCourier = Boolean(o.courier?.driverName || o.deliveryJob?.driverName);
    const courierName = o.courier?.driverName || o.deliveryJob?.driverName || (ar ? 'المندوب' : 'Courier');

    const s6Done = o.status === 'delivered' || delivery === 'delivered';
    const s5Done = s6Done;
    const s5Current = !s6Done && (
      o.status === 'on_the_way' ||
      detailed === 'out_for_delivery' ||
      delivery === 'in_transit' ||
      delivery === 'arrived_at_dropoff' ||
      detailed === 'delivery_exception'
    );

    const s4Done = s5Done || s5Current;
    const s4Current = !s4Done && (
      detailed === 'ready_for_pickup' ||
      delivery === 'picked_up' ||
      delivery === 'arrived_at_pickup'
    );

    const s3Done = s4Done || s4Current;
    const s3Current = !s3Done && (
      hasCourier ||
      delivery === 'assigned' ||
      delivery === 'accepted' ||
      delivery === 'heading_to_pickup'
    );

    const s2Done = s3Done || s3Current || detailed === 'ready_for_pickup';
    const s2Current = !s2Done && (
      detailed === 'confirmed' ||
      detailed === 'preparing' ||
      o.status === 'preparing'
    );

    return [
      {
        label: ar ? 'تم استلام الطلب' : 'Order Received',
        description: ar ? 'طلب العميل مسجل بالكامل' : 'Order created',
        timestamp: o.createdAt,
        state: 'done',
      },
      {
        label: ar ? 'تجهيز الأدوية بالصيدلية' : 'Preparing Medications',
        description: ar
          ? (s2Done ? 'تم تحضير العلاج وتغليفه بالفرع' : 'الصيدلي يقوم بتحضير وتغليف الأدوية وفحصها')
          : 'Pharmacist preparing medications',
        state: s2Done ? 'done' : s2Current ? 'current' : 'upcoming',
      },
      {
        label: ar ? 'إسناد وتكليف المندوب' : 'Courier Assignment',
        description: hasCourier
          ? (ar ? `تم التكليف للمندوب (${courierName}) وهو متجه للصيدلية` : `Assigned to ${courierName}`)
          : (ar ? 'بانتظار إسناد وتوزيع مهمة التوصيل' : 'Awaiting courier dispatch'),
        state: s3Done ? 'done' : s3Current ? 'current' : 'upcoming',
      },
      {
        label: ar ? 'استلام المندوب للأدوية' : 'Picked up from Pharmacy',
        description: ar
          ? (delivery === 'arrived_at_pickup'
              ? `المندوب (${courierName}) وصل لمقر الصيدلية للاستلام`
              : s4Done
              ? `استلم المندوب (${courierName}) الشحنة من الصيدلية`
              : 'بانتظار وصول واستلام المندوب')
          : 'Medications picked up by courier',
        state: s4Done ? 'done' : s4Current ? 'current' : 'upcoming',
      },
      {
        label: ar ? 'في الطريق للعميل' : 'Out for Delivery',
        description: ar
          ? (delivery === 'arrived_at_dropoff'
              ? `المندوب (${courierName}) وصل لموقع العميل`
              : s5Current
              ? `المندوب (${courierName}) في الطريق إلى عنوان العميل`
              : 'في الطريق للتسليم')
          : 'Courier is in transit to customer',
        state: s5Done ? 'done' : s5Current ? 'current' : 'upcoming',
        timestamp: s5Current ? o.estimatedDelivery : undefined,
      },
      {
        label: ar ? 'تم التسليم بنجاح' : 'Delivered Successfully',
        description: ar ? 'تم تسليم الأدوية للعميل بالكامل' : 'Order delivered successfully',
        state: s6Done ? 'done' : 'upcoming',
      },
    ];
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
          {order.hasPrescriptionItems && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-bold bg-amber-600 text-white shadow-xs">
              <span className="font-black">Rx</span>
              <span>{isRTL ? 'يتطلب روشتة طبية' : 'Prescription Required'}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill tone={order.detailedStatus ? DETAILED_STATUS_TONE[order.detailedStatus] : ORDER_STATUS_TONE[order.status]}>
            {order.detailedStatus && ar ? DETAILED_STATUS_LABELS_AR[order.detailedStatus] : t.account.orderStatus[order.status]}
          </StatusPill>
          {order.deliveryStatus && (
            <StatusPill tone={DELIVERY_STATUS_TONE[order.deliveryStatus]}>
              {ar ? DELIVERY_STATUS_LABELS_AR[order.deliveryStatus] : order.deliveryStatus}
            </StatusPill>
          )}
          {paymentStatus && <StatusPill tone={PAY_TONE[paymentStatus]}>{paymentStatusLabel(paymentStatus)}</StatusPill>}
        </div>
      </div>
      <p className="text-body-sm text-ragab-ink-500 -mt-2">{order.createdAt}</p>

      {/* Stuck Order Warning Banner */}
      {order.stuckInfo?.isStuck && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs ${
          order.stuckInfo.alertLevel === 'critical'
            ? 'bg-red-50 border-red-300 text-red-950'
            : 'bg-amber-50 border-amber-300 text-amber-950'
        }`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
            order.stuckInfo.alertLevel === 'critical' ? 'text-red-600' : 'text-amber-600'
          }`} />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 font-bold text-body-sm">
              <span>{isRTL ? 'تنبيه مراقبة: هذا الطلب متوقف أطول من الحد المسموح به' : 'Alert: Stuck Order Detected'}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-200/80 font-mono text-amber-900">
                {order.stuckInfo.minutesInCurrentStatus} {isRTL ? 'دقيقة' : 'mins'}
              </span>
            </div>
            <p className="text-caption leading-relaxed font-semibold">
              {isRTL ? `الإجراء الموصى به: ${order.stuckInfo.recommendedActionAr}` : `Recommended Action: ${order.stuckInfo.recommendedAction}`}
            </p>
          </div>
        </div>
      )}

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

          {/* Prescription Information Card */}
          {order.hasPrescriptionItems && (
            <Card className="border-2 border-amber-300 bg-amber-50/50">
              <CardHeader
                title={isRTL ? 'بيانات الروشتة الطبية المطلوبة (Rx)' : 'Prescription Details (Rx)'}
              />
              <div className="space-y-3">
                {/* Decision Status Banner */}
                {order.prescriptionStatus === 'approved' ? (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 flex items-center gap-2 text-emerald-950 font-bold text-body-sm shadow-xs">
                    <Check className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>{isRTL ? '✓ تم فحص الروشتة واعتمادها من قِبل الدكتور والموافقة على التوصيل' : '✓ Prescription approved by pharmacist for delivery'}</span>
                  </div>
                ) : order.prescriptionStatus === 'rejected_visit_required' ? (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3.5 space-y-2 text-red-950 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-body text-red-950">
                      <span className="text-lg">🛑</span>
                      <span>{isRTL ? 'تم رفض التوصيل - يلزم حضور العميل شخصياً للصيدلية' : 'Delivery Refused - Pharmacy Visit Required'}</span>
                    </div>
                    <p className="text-caption text-red-900 leading-relaxed font-semibold">
                      {isRTL
                        ? 'تم تعليق توصيل الطلب بسبب شك في صحة الروشتة أو لكون الدواء خاضعاً لرقابة مشددة. تم إشعار العميل بضرورة الحضور للصيدلية مصطحباً أصل الروشتة والبطاقة.'
                        : 'Delivery suspended. Customer notified to visit pharmacy in person with original prescription and ID.'}
                    </p>
                    {order.prescriptionRejectionReason && (
                      <div className="bg-white/80 rounded-lg p-2 border border-red-200 text-caption text-red-900">
                        <strong>{isRTL ? 'سبب الرفض: ' : 'Reason: '}</strong>
                        {order.prescriptionRejectionReason}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-center gap-2 text-amber-950 font-bold text-body-sm shadow-xs">
                    <Clock className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>{isRTL ? '🟡 بانتظار فحص الدكتور للروشتة المرفقة واتخاذ قرار الصرف والتوصيل' : '🟡 Pending pharmacist verification'}</span>
                  </div>
                )}

                {/* Prescription Image */}
                {order.prescriptionUrl ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-caption font-bold text-ragab-ink-700">
                      {isRTL ? 'صورة الروشتة المرفقة من العميل:' : 'Customer attached prescription photo:'}
                    </p>
                    <div className="relative inline-block border-2 border-amber-300 rounded-xl overflow-hidden bg-white shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.prescriptionUrl}
                        alt="Prescription"
                        className="max-h-80 w-auto object-contain cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => window.open(order.prescriptionUrl, '_blank')}
                      />
                    </div>
                    <div>
                      <a
                        href={order.prescriptionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-body-sm font-bold text-amber-800 hover:text-amber-950 underline"
                      >
                        {isRTL ? 'فتح صورة الروشتة بالحجم الكامل ↗' : 'Open full image ↗'}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-xl border border-amber-200 text-body-sm text-amber-950">
                    <p className="font-bold text-ragab-danger">
                      {isRTL ? 'لم يتم إرفاق صورة روشتة بهذا الطلب.' : 'No prescription photo attached.'}
                    </p>
                  </div>
                )}

                {/* Pharmacist Action Controls */}
                {canEdit && (
                  <div className="pt-3 border-t border-amber-200 flex items-center gap-3 flex-wrap">
                    {order.prescriptionStatus !== 'approved' && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        isLoading={decisionBusy}
                        onClick={async () => {
                          setDecisionBusy(true);
                          try {
                            await updatePrescriptionDecision(order.id, 'approved');
                            await load();
                            showToast(isRTL ? 'تم اعتماد الروشتة والموافقة على التوصيل' : 'Prescription approved for delivery', 'success');
                          } catch (err: any) {
                            showToast(err?.message || (isRTL ? 'فشل اعتماد الروشتة' : 'Failed to approve'), 'error');
                          } finally {
                            setDecisionBusy(false);
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      >
                        <Check className="w-4 h-4 me-1.5" />
                        {isRTL ? 'اعتماد الروشتة والموافقة على التوصيل' : 'Approve for Delivery'}
                      </Button>
                    )}

                    {order.prescriptionStatus !== 'rejected_visit_required' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={decisionBusy}
                        onClick={() => setRejectModalOpen(true)}
                        className="border-red-400 bg-red-50 hover:bg-red-100 text-red-700 font-bold"
                      >
                        <XCircle className="w-4 h-4 me-1.5" />
                        {isRTL ? 'رفض التوصيل (شك / يلزم زيارة الصيدلية)' : 'Reject Delivery (Require Pharmacy Visit)'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Items */}
          <Card>
            <CardHeader title={t.adminOrders.orderDetails} />
            <ul className="divide-y divide-ragab-ink-100">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image} alt={it.productNameAr} className="w-14 h-14 rounded-lg object-cover border border-ragab-ink-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-body-sm font-semibold text-ragab-ink-800 truncate">{it.productNameAr}</p>
                      {it.requiresPrescription && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-600 text-white font-black">Rx</span>
                      )}
                    </div>
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

          {/* Unified Event & Audit Log */}
          <Card className="border border-ragab-ink-100">
            <CardHeader
              title={ar ? 'سجل العمليات والأحداث الفنية (Audit & Event Trail)' : 'Unified Event & Audit Trail'}
            />
            <div className="space-y-2">
              {!order.events || order.events.length === 0 ? (
                <p className="text-caption text-ragab-ink-400 py-2">{ar ? 'لا توجد أحداث مسجلة بعد لهذا الطلب.' : 'No events logged for this order yet.'}</p>
              ) : (
                <div className="divide-y divide-ragab-ink-100 max-h-80 overflow-y-auto pr-1">
                  {order.events.map((ev, i) => {
                    const isFailure = ev.outcome === 'failed' || ev.outcome === 'rejected';
                    const reason = ev.reasonCode ? (REASON_CODE_LABELS_AR[ev.reasonCode] || ev.reasonCode) : null;
                    return (
                      <div key={ev.eventId || i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-body-sm">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono text-caption font-bold ${isFailure ? 'text-red-700' : 'text-ragab-ink-800'}`}>
                              {ev.eventType}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              ev.outcome === 'success'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ev.outcome === 'rejected'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {ev.outcome === 'success' ? (ar ? 'نجاح' : 'Success') : ev.outcome === 'rejected' ? (ar ? 'انتقال مرفوض' : 'Rejected') : (ar ? 'فشل' : 'Failed')}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-ragab-ink-100 text-ragab-ink-600 font-mono">
                              {ev.sourceApp}
                            </span>
                          </div>
                          <p className="text-caption text-ragab-ink-500">
                            {ar ? 'المنفذ:' : 'Actor:'} <strong className="text-ragab-ink-700">{ev.actorName || ev.actorType}</strong>
                            {ev.fromStatus && ev.toStatus && (
                              <span> ({ev.fromStatus} → {ev.toStatus})</span>
                            )}
                          </p>
                          {reason && (
                            <p className="text-caption text-red-600 font-semibold">
                              {ar ? 'سبب التعثر:' : 'Reason:'} {reason}
                            </p>
                          )}
                        </div>
                        <span className="text-caption text-ragab-ink-400 font-mono shrink-0" dir="ltr">
                          {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

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

          {/* Delivery Job & Courier Operations Card */}
          <Card className="border border-ragab-ink-100">
            <CardHeader
              title={ar ? 'مهمة التوصيل وتتبع المندوب (إنجزني)' : 'Delivery Job & Courier Tracking (Engezny)'}
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-ragab-ink-50/50 rounded-xl">
                <div>
                  <span className="text-caption text-ragab-ink-400 block mb-0.5">{ar ? 'حالة التوصيل الحالية' : 'Current Delivery Stage'}</span>
                  <StatusPill tone={DELIVERY_STATUS_TONE[order.deliveryJob?.status || order.deliveryStatus || 'awaiting_dispatch']}>
                    {ar ? DELIVERY_STATUS_LABELS_AR[order.deliveryJob?.status || order.deliveryStatus || 'awaiting_dispatch'] : (order.deliveryJob?.status || order.deliveryStatus || 'awaiting_dispatch')}
                  </StatusPill>
                </div>
                {(order.courier?.driverName || order.deliveryJob?.driverName) && (
                  <div className="text-start">
                    <span className="text-caption text-ragab-ink-400 block mb-0.5">{ar ? 'المندوب المكلف' : 'Assigned Courier'}</span>
                    <div className="font-bold text-body-sm text-ragab-ink-800 flex items-center gap-2 flex-wrap">
                      <span>🛵 {order.courier?.driverName || order.deliveryJob?.driverName}</span>
                      {(order.courier?.driverPhone || order.deliveryJob?.driverPhone) && (
                        <a
                          href={`tel:${order.courier?.driverPhone || order.deliveryJob?.driverPhone}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ragab-brand-50 text-ragab-brand-700 hover:bg-ragab-brand-100 text-caption font-bold"
                          dir="ltr"
                        >
                          <Phone className="w-3 h-3" />
                          {order.courier?.driverPhone || order.deliveryJob?.driverPhone}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Delivery Photo (Proof of Delivery at door) */}
              {(order.status === 'delivered' || order.deliveryPhotoUrl || order.deliveryJob?.deliveryPhotoUrl) && (
                <div className="pt-2 border-t border-ragab-ink-100">
                  <EngeznyDeliveryPhoto
                    orderId={order.id}
                    initialUrl={order.deliveryPhotoUrl || order.deliveryJob?.deliveryPhotoUrl}
                  />
                </div>
              )}

              {/* Courier Rating by Customer */}
              {order.courierRating && (
                <div className="pt-2 border-t border-ragab-ink-100">
                  <span className="text-caption font-bold text-ragab-ink-700 block mb-1">
                    ⭐ {ar ? 'تقييم العميل للمندوب:' : 'Customer Courier Rating:'}
                  </span>
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 text-caption space-y-1">
                    <div className="flex items-center gap-1 font-bold text-amber-900">
                      <span>{order.courierRating.rating} / 5 نجوم</span>
                    </div>
                    {order.courierRating.comment && (
                      <p className="text-ragab-ink-700 italic">"{order.courierRating.comment}"</p>
                    )}
                  </div>
                </div>
              )}
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

      <Drawer isOpen={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title={isRTL ? 'رفض التوصيل - إلزام العميل بزيارة الصيدلية' : 'Require Pharmacy Visit'}>
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-body-sm text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>🛑</span>
              <span>{isRTL ? 'إيقاف توصيل الدواء وإلزام الحضور للصيدلية' : 'Suspend delivery & require in-person visit'}</span>
            </p>
            <p className="text-caption text-red-900 leading-relaxed">
              {isRTL
                ? 'في حال الشك في صحة الروشتة أو لكون الدواء خاضعاً لرقابة وجداول مشددة، سيتم تعليق التوصيل فوراً وإبلاغ العميل بضرورة التوجه لمقر الصيدلية مصطحباً أصل الروشتة الورقية والبطاقة الشخصية لاستلام العلاج بعد الفحص.'
                : 'Delivery will be suspended. Customer will be notified to visit the pharmacy with original prescription and ID.'}
            </p>
          </div>

          <FormField label={isRTL ? 'سبب رفض التوصيل أو توجيهات الصيدلي:' : 'Reason / Pharmacist Notes:'}>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={isRTL ? 'اكتب سبب الرفض هنا ليظهر للعميل...' : 'Write reason here...'}
            />
          </FormField>

          <div className="flex items-center gap-2.5 pt-2">
            <Button
              variant="primary"
              fullWidth
              isLoading={decisionBusy}
              onClick={async () => {
                setDecisionBusy(true);
                try {
                  await updatePrescriptionDecision(order.id, 'rejected_visit_required', rejectReason.trim());
                  await load();
                  showToast(isRTL ? 'تم رفض التوصيل وإلزام العميل بالحضور للصيدلية' : 'Delivery rejected, pharmacy visit required', 'success');
                  setRejectModalOpen(false);
                } catch (err: any) {
                  showToast(err?.message || (isRTL ? 'فشل تحديث القرار' : 'Failed to update decision'), 'error');
                } finally {
                  setDecisionBusy(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {isRTL ? 'تأكيد الرفض وإلزام الزيارة' : 'Confirm & Require Visit'}
            </Button>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)} disabled={decisionBusy}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
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
