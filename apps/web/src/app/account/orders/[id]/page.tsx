'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
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
  Phone,
  MessageCircle,
  Star,
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
import { Modal } from '../../../../components/ui/Modal';
import { StatusPill } from '../../../../components/ui/StatusPill';
import { Timeline, TimelineStep } from '../../../../components/ui/Timeline';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import {
  ORDER_PIPELINE,
  ORDER_STATUS_TONE,
  DETAILED_STATUS_TONE,
  DETAILED_STATUS_LABELS_AR,
  CUSTOMER_STATUS_MESSAGES_AR,
} from '../../../../lib/orderStatus';
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

  // Reviews state
  const [reviewsMap, setReviewsMap] = useState<Record<string, { rating: number; title?: string | null; body?: string | null }>>({});
  const [reviewingItem, setReviewingItem] = useState<{ productId: string; productName: string } | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadOrderReviews = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { rating: number; title?: string | null; body?: string | null }> = {};
        if (Array.isArray(data)) {
          for (const r of data) {
            map[r.productId] = { rating: r.rating, title: r.title, body: r.body };
          }
        }
        setReviewsMap(map);
      }
    } catch {
      // ignore
    }
  }, []);

  const lastNotifiedStateRef = useRef<{ status?: string; deliveryStatus?: string; courier?: string }>({});

  const refreshSilently = useCallback(async (targetId: string) => {
    try {
      const data = await getOrderById(targetId);
      if (!data) return;
      setOrder((prev) => {
        if (!prev) return data;
        const newCourier = data.courier?.driverName || data.deliveryJob?.driverName;
        const newStatus = data.status;
        const newDeliveryStatus = data.deliveryStatus || data.deliveryJob?.status;

        // One-time milestone toast notifications
        if (newCourier && !lastNotifiedStateRef.current.courier) {
          lastNotifiedStateRef.current.courier = newCourier;
          showToast(
            isRTL
              ? `تم إسناد الطلب للمندوب: ${newCourier}`
              : `Assigned to courier: ${newCourier}`,
            'info'
          );
        }

        if (
          (newStatus === 'on_the_way' || newDeliveryStatus === 'in_transit') &&
          lastNotifiedStateRef.current.status !== 'on_the_way'
        ) {
          lastNotifiedStateRef.current.status = 'on_the_way';
          showToast(
            isRTL
              ? 'المندوب استلم أدويتك وهو في الطريق إليك 🛵'
              : 'Courier picked up medication and is on the way',
            'info'
          );
        }

        if (
          newDeliveryStatus === 'arrived_at_dropoff' &&
          lastNotifiedStateRef.current.deliveryStatus !== 'arrived_at_dropoff'
        ) {
          lastNotifiedStateRef.current.deliveryStatus = 'arrived_at_dropoff';
          showToast(
            isRTL ? 'المندوب وصل الآن أمام موقعك! 📍' : 'Courier arrived at your location',
            'info'
          );
        }

        if (
          (newStatus === 'delivered' || newDeliveryStatus === 'delivered') &&
          lastNotifiedStateRef.current.status !== 'delivered'
        ) {
          lastNotifiedStateRef.current.status = 'delivered';
          showToast(
            isRTL ? 'تم تسليم طلبك بنجاح! بالشفاء العاجل 💊' : 'Order delivered successfully! Get well soon',
            'success'
          );
        }

        return data;
      });
    } catch {
      // ignore silent refresh errors
    }
  }, [isRTL, showToast]);

  // Initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getOrderById(id);
        if (alive) {
          setOrder(data);
          if (data) {
            lastNotifiedStateRef.current = {
              status: data.status,
              deliveryStatus: data.deliveryStatus || data.deliveryJob?.status,
              courier: data.courier?.driverName || data.deliveryJob?.driverName,
            };
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (order?.id && order.status === 'delivered') {
      loadOrderReviews(order.id);
    }
  }, [order?.id, order?.status, loadOrderReviews]);

  const handleSubmitReview = async () => {
    if (!reviewingItem || !order) return;
    setSubmittingReview(true);
    try {
      const res = await fetch('/api/v1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: reviewingItem.productId,
          orderId: order.id,
          rating: ratingScore,
          comment: reviewComment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'تعذر حفظ التقييم');
      }
      setReviewsMap((prev) => ({
        ...prev,
        [reviewingItem.productId]: { rating: ratingScore, body: reviewComment.trim() },
      }));
      showToast(isRTL ? 'شكراً لك! تم حفظ تقييمك بنجاح.' : 'Thank you! Your review was saved.', 'success');
      setReviewingItem(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'فشل حفظ التقييم';
      showToast(msg, 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Real-time Firestore sync (< 100ms updates without page refresh)
  useEffect(() => {
    const targetId = order?.id || id;
    if (!targetId || !db) return;

    let unsub: (() => void) | undefined;
    try {
      const orderRef = doc(db, 'orders', targetId);
      unsub = onSnapshot(
        orderRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();

          setOrder((prev) => {
            if (!prev) return prev;
            let changed = false;
            const next = { ...prev };

            const rawStatus = data.status;
            const deliveryStatus = data.deliveryStatus || (rawStatus === 'purchased' ? 'in_transit' : rawStatus);

            if (deliveryStatus && next.deliveryStatus !== deliveryStatus) {
              next.deliveryStatus = deliveryStatus;
              changed = true;
            }

            if (rawStatus === 'purchased' && next.status === 'preparing') {
              next.status = 'on_the_way';
              next.detailedStatus = 'out_for_delivery';
              changed = true;
            } else if (rawStatus === 'delivered' && next.status !== 'delivered') {
              next.status = 'delivered';
              next.detailedStatus = 'delivered';
              changed = true;
            }

            const driverName = data.workerName || next.courier?.driverName || next.deliveryJob?.driverName;
            const driverPhone = data.workerPhone || next.courier?.driverPhone || next.deliveryJob?.driverPhone;

            if (data.workerName || data.workerPhone) {
              if (next.courier?.driverName !== driverName || next.courier?.driverPhone !== driverPhone) {
                next.courier = {
                  driverName: driverName || '',
                  driverPhone: driverPhone || '',
                  status: (deliveryStatus as string) || 'assigned',
                };
                changed = true;
              }
              if (next.deliveryJob) {
                next.deliveryJob = {
                  ...next.deliveryJob,
                  driverName,
                  driverPhone,
                  status: deliveryStatus || next.deliveryJob.status,
                };
                changed = true;
              }
            }

            if (data.deliveryPhotoUrl && next.deliveryJob?.deliveryPhotoUrl !== data.deliveryPhotoUrl) {
              next.deliveryJob = {
                ...(next.deliveryJob || { status: 'delivered' }),
                deliveryPhotoUrl: data.deliveryPhotoUrl,
              };
              changed = true;
            }

            return changed ? next : prev;
          });

          // Reconcile Postgres & complete order DTO silently in background
          refreshSilently(targetId);
        },
        (error) => {
          console.warn('Real-time order tracking listener error:', error);
        }
      );
    } catch (e) {
      console.warn('Failed to subscribe to order changes:', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [order?.id, id, refreshSilently]);

  // Polling fallback every 4s while order is active (never requires manual refresh)
  useEffect(() => {
    if (!order || order.status === 'delivered' || order.status === 'cancelled') {
      return;
    }

    const interval = setInterval(() => {
      refreshSilently(order.id);
    }, 4000);

    return () => clearInterval(interval);
  }, [order?.id, order?.status, refreshSilently]);

  function cleanPhone(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return digits.slice(2);
    if (digits.startsWith('0')) return digits.slice(1);
    return digits;
  }

  function getCourierStageLabel(o: Order, rtl: boolean): string {
    const delivery = o.deliveryStatus || o.deliveryJob?.status;
    if (delivery === 'accepted' || delivery === 'heading_to_pickup') {
      return rtl ? 'المندوب قبل المهمة وفي طريقه للصيدلية' : 'Courier heading to pharmacy';
    }
    if (delivery === 'arrived_at_pickup') {
      return rtl ? 'المندوب وصل للصيدلية لاستلام أدويتك' : 'Courier arrived at pharmacy';
    }
    if (delivery === 'picked_up' || delivery === 'in_transit' || o.status === 'on_the_way') {
      return rtl ? 'المندوب استلم أدويتك وهو في الطريق إليك' : 'Courier picked up medication and in transit';
    }
    if (delivery === 'arrived_at_dropoff') {
      return rtl ? 'المندوب وصل الآن أمام موقعك' : 'Courier arrived at your location';
    }
    if (delivery === 'delivered' || o.status === 'delivered') {
      return rtl ? 'تم التسليم بنجاح' : 'Delivered successfully';
    }
    if (delivery === 'returning') {
      return rtl ? 'جاري إرجاع الشحنة للصيدلية' : 'Returning to pharmacy';
    }
    if (delivery === 'failed' || o.detailedStatus === 'delivery_exception') {
      return rtl ? 'يوجد تعثر جاري حله مع المندوب' : 'Delivery issue being resolved';
    }
    return rtl ? 'تم تكليف المندوب بالطلب' : 'Courier assigned';
  }

  const buildTimeline = (o: Order): TimelineStep[] => {
    // 1. Cancelled Order
    if (o.status === 'cancelled') {
      return [
        {
          label: isRTL ? 'تم استلام الطلب' : 'Order Received',
          description: isRTL ? 'تم تسجيل وتوثيق طلبك في النظام' : 'Order received and logged',
          timestamp: o.createdAt,
          state: 'done',
        },
        {
          label: isRTL ? 'تم إلغاء الطلب' : 'Order Cancelled',
          description: isRTL
            ? (o.rejectionReason || 'تم إلغاء الطلب بناءً على رغبتك أو انتهاء المهلة')
            : (o.rejectionReason || 'Order was cancelled'),
          state: 'cancelled',
        },
      ];
    }

    // 2. Rejected Order (e.g. prescription invalid or medication out of stock)
    if (o.detailedStatus === 'rejected') {
      return [
        {
          label: isRTL ? 'تم استلام الطلب' : 'Order Received',
          description: isRTL ? 'تم تسجيل وتوثيق طلبك في النظام' : 'Order received and logged',
          timestamp: o.createdAt,
          state: 'done',
        },
        {
          label: isRTL ? 'تعذر قبول الطلب من الصيدلية' : 'Order Rejected by Pharmacy',
          description: isRTL
            ? (o.rejectionReason || o.prescriptionRejectionReason || 'تعذر استكمال الطلب من قِبل الصيدلي')
            : 'Could not fulfill the order per pharmacist review',
          state: 'cancelled',
        },
      ];
    }

    const detailed = o.detailedStatus || (o.status as any);
    const delivery = o.deliveryStatus || o.deliveryJob?.status;
    const hasCourier = Boolean(o.courier?.driverName || o.deliveryJob?.driverName);
    const courierName = o.courier?.driverName || o.deliveryJob?.driverName || (isRTL ? 'المندوب' : 'Courier');

    // Milestones status calculation
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
        label: isRTL ? 'تم استلام الطلب' : 'Order Received',
        description: isRTL ? 'تم تسجيل طلبك بنجاح وبانتظار اعتماد الصيدلي' : 'Order received and logged in system',
        timestamp: o.createdAt,
        state: 'done',
      },
      {
        label: isRTL ? 'تجهيز الأدوية بالصيدلية' : 'Preparing Medications',
        description: isRTL
          ? (s2Done ? 'تم تجهيز وتغليف الأدوية والتحقق من سلامتها' : 'الصيدلي يقوم بتحضير وتغليف الأدوية والتحقق من الجرعات')
          : 'Pharmacist is preparing and packaging medications',
        state: s2Done ? 'done' : s2Current ? 'current' : 'upcoming',
        timestamp: s2Current ? '5-15 دقيقة' : undefined,
      },
      {
        label: isRTL ? 'إسناد مندوب التوصيل' : 'Courier Assigned',
        description: hasCourier
          ? (isRTL
              ? `المندوب المكلف: ${courierName}${o.courier?.driverPhone || o.deliveryJob?.driverPhone ? ` (${o.courier?.driverPhone || o.deliveryJob?.driverPhone})` : ''}`
              : `Assigned to courier (${courierName})`)
          : (isRTL
              ? 'جاري التنسيق والبحث عن أقرب مندوب توصيل متاح'
              : 'Coordinating and finding an available courier'),
        state: s3Done ? 'done' : s3Current ? 'current' : 'upcoming',
      },
      {
        label: isRTL ? 'استلام الأدوية من الصيدلية' : 'Picked up from Pharmacy',
        description: isRTL
          ? (delivery === 'arrived_at_pickup'
              ? `المندوب (${courierName}) وصل لمقر الصيدلية لاستلام وتدقيق العلاج`
              : s4Done
              ? `تم فحص الأدوية واستلمها المندوب (${courierName}) من الصيدلية`
              : 'بانتظار وصول واستلام المندوب للأدوية')
          : `Medications ready and picked up by courier from pharmacy`,
        state: s4Done ? 'done' : s4Current ? 'current' : 'upcoming',
      },
      {
        label: isRTL ? 'في الطريق إليك مع المندوب' : 'Out for Delivery',
        description: isRTL
          ? (delivery === 'arrived_at_dropoff'
              ? `🛵 المندوب (${courierName}) وصل الآن لعنوانك أمام الباب!`
              : s5Current
              ? `المندوب (${courierName}) في الطريق إلى عنوانك ومعه أدويتك`
              : 'يتم التوجه لعنوانك فور استلام الشحنة')
          : `Courier is on the way to your delivery address`,
        state: s5Done ? 'done' : s5Current ? 'current' : 'upcoming',
        timestamp: s5Current ? o.estimatedDelivery : undefined,
      },
      {
        label: isRTL ? 'تم التسليم بنجاح' : 'Delivered Successfully',
        description: isRTL ? 'تم تسليم الطلب لك بنجاح. بالشفاء العاجل!' : 'Order delivered. Get well soon!',
        state: s6Done ? 'done' : 'upcoming',
      },
    ];
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
    <div className="space-y-4 pb-8 min-w-0 max-w-full">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
        <ChevronLeft className="w-4 h-4 ltr:rotate-180" />
        {t.account.myOrders}
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap min-w-0">
        <div className="min-w-0">
          <h1 className="text-h1 text-ragab-ink-800 truncate" dir="ltr">
            {order.orderNumber}
          </h1>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{order.createdAt}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {order.refunded && (
            <StatusPill tone="info" dot={false}>
              <span className="inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />{t.account.refunded}</span>
            </StatusPill>
          )}
          <StatusPill tone={order.detailedStatus ? DETAILED_STATUS_TONE[order.detailedStatus] : ORDER_STATUS_TONE[order.status]}>
            {order.detailedStatus && isRTL
              ? DETAILED_STATUS_LABELS_AR[order.detailedStatus]
              : t.account.orderStatus[order.status]}
          </StatusPill>
        </div>
      </div>

      {/* Customer Status Reassurance Banner */}
      <div className="rounded-2xl border border-ragab-ink-100 bg-white p-4 shadow-xs flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-ragab-brand-50 flex items-center justify-center text-ragab-brand-700 shrink-0">
          <Truck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-bold text-ragab-ink-800 break-words">
            {order.detailedStatus && isRTL
              ? DETAILED_STATUS_LABELS_AR[order.detailedStatus]
              : t.account.orderStatus[order.status]}
          </p>
          <p className="text-caption text-ragab-ink-500 mt-0.5 break-words">
            {order.detailedStatus && CUSTOMER_STATUS_MESSAGES_AR[order.detailedStatus]
              ? CUSTOMER_STATUS_MESSAGES_AR[order.detailedStatus]
              : isRTL
              ? 'طلبك يمر بمراحل المراجعة والتجهيز والتوصيل خطوة بخطوة'
              : 'Your order is being processed step by step'}
          </p>
        </div>
      </div>

      {/* Pharmacist Prescription Visit Notice */}
      {order.prescriptionStatus === 'rejected_visit_required' && (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50/90 p-5 shadow-sm space-y-2 text-red-950 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white font-black text-sm shadow-xs shrink-0">
              !
            </span>
            <h3 className="text-body font-extrabold text-red-950">
              {isRTL ? 'تنبيه صيدلاني هام: يلزم الحضور شخصياً للصيدلية لاستلام العلاج' : 'Important Notice: In-Person Pharmacy Visit Required'}
            </h3>
          </div>
          <p className="text-body-sm text-red-900 leading-relaxed font-semibold">
            {isRTL
              ? 'بناءً على فحص الدكتور للروشتة، يتعذر تسليم هذا العلاج عبر خدمة التوصيل لدواعي السلامة والتحقق من الروشتة. يرجى التوجه لمقر صيدلية رجب مصطحباً أصل الروشتة الورقية المعتمدة وبطاقة إثبات الشخصية لاستلام الدواء.'
              : 'Per pharmaceutical review, this medication cannot be delivered. Please visit the pharmacy in person with the original prescription and ID.'}
          </p>
          {order.prescriptionRejectionReason && (
            <div className="text-caption text-red-900 bg-white/80 p-3 rounded-xl border border-red-200">
              <strong>{isRTL ? 'توجيهات الصيدلي: ' : 'Pharmacist note: '}</strong>
              {order.prescriptionRejectionReason}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start min-w-0">
        <div className="space-y-4 min-w-0 w-full">
          {order.status === 'on_the_way' && (
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title="التتبع المباشر" />
              <div className="p-4 pt-0">
                <LiveMap orderId={order.id} />
              </div>
            </Card>
          )}

          {/* Timeline */}
          <Card className="min-w-0 overflow-hidden">
            <CardHeader title={t.account.orderTimeline} />
            <Timeline steps={buildTimeline(order)} />
          </Card>

          {/* Items */}
          <Card className="min-w-0 overflow-hidden">
            <CardHeader title={t.account.orderDetails} />
            <ul className="divide-y divide-ragab-ink-100 min-w-0">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image} alt={it.productNameAr} className="w-14 h-14 rounded-lg object-cover border border-ragab-ink-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-body-sm font-semibold text-ragab-ink-800 truncate min-w-0 flex-1" title={it.productNameAr}>
                        {it.productNameAr}
                      </p>
                      {it.requiresPrescription && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-600 text-white font-black shrink-0">Rx</span>
                      )}
                    </div>
                    <p className="text-caption text-ragab-ink-500 mt-0.5">
                      {it.unit} · {it.quantity} × {it.price} {t.common.egp}
                    </p>
                    {order.status === 'delivered' && it.productId && (
                      <div className="mt-2 flex items-center gap-2">
                        {reviewsMap[it.productId] ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingItem({
                                productId: it.productId!,
                                productName: it.productNameAr,
                              });
                              setRatingScore(reviewsMap[it.productId!].rating);
                              setReviewComment(reviewsMap[it.productId!].body || '');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>تم تقييمك: {reviewsMap[it.productId].rating} / 5 (تعديل)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingItem({
                                productId: it.productId!,
                                productName: it.productNameAr,
                              });
                              setRatingScore(5);
                              setReviewComment('');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <Star className="w-3.5 h-3.5 text-emerald-600" />
                            <span>تقييم المنتج ⭐</span>
                          </button>
                        )}
                      </div>
                    )}
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
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title="📸 صورة التوصيل" />
              <div className="p-4 pt-0">
                <EngeznyDeliveryPhoto orderId={order.id} />
              </div>
            </Card>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-4 min-w-0 w-full">
          {/* Courier Card in Side Column (at top of side column for priority visibility) */}
          {(order.courier?.driverName || order.deliveryJob?.driverName) && (
            <Card className="min-w-0 overflow-hidden border-ragab-brand-200 bg-ragab-brand-50/20">
              <CardHeader title={isRTL ? 'مندوب التوصيل المكلف' : 'Assigned Courier'} />
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-ragab-brand-100 text-ragab-brand-800 flex items-center justify-center font-bold text-base shrink-0">
                      🛵
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-ragab-ink-800 truncate">
                        {order.courier?.driverName || order.deliveryJob?.driverName}
                      </p>
                      {(order.courier?.driverPhone || order.deliveryJob?.driverPhone) && (
                        <p className="text-caption text-ragab-ink-500 font-mono" dir="ltr">
                          {order.courier?.driverPhone || order.deliveryJob?.driverPhone}
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusPill tone="info" dot={false} className="max-w-full truncate">
                    {getCourierStageLabel(order, isRTL)}
                  </StatusPill>
                </div>

                {(order.courier?.driverPhone || order.deliveryJob?.driverPhone) && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-ragab-ink-100">
                    <a
                      href={`tel:${order.courier?.driverPhone || order.deliveryJob?.driverPhone}`}
                      className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-ragab-brand-500 hover:bg-ragab-brand-600 text-ragab-ink-900 font-bold text-caption transition-colors shadow-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{isRTL ? 'اتصال بالمندوب' : 'Call'}</span>
                    </a>
                    <a
                      href={`https://wa.me/20${cleanPhone(order.courier?.driverPhone || order.deliveryJob?.driverPhone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-ragab-ink-200 bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 font-bold text-caption transition-colors shadow-xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isRTL ? 'واتساب' : 'WhatsApp'}</span>
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Summary */}
          <Card className="min-w-0 overflow-hidden">
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
          <Card className="min-w-0 overflow-hidden">
            <div className="flex items-start gap-2.5 min-w-0">
              <MapPin className="w-5 h-5 text-ragab-success shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-caption font-bold text-ragab-ink-500">{t.account.deliveryAddress}</p>
                <p className="text-body-sm text-ragab-ink-700 mt-0.5 font-semibold truncate">{order.deliveryAddress.recipientName}</p>
                <p className="text-caption text-ragab-ink-500 break-words">
                  {order.deliveryAddress.village} — {order.deliveryAddress.streetAddress}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-ragab-ink-100 min-w-0">
              <Truck className="w-5 h-5 text-ragab-info shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-caption font-bold text-ragab-ink-500">{t.account.paymentMethod}</p>
                <p className="text-body-sm text-ragab-ink-700 truncate">{paymentLabel(order.paymentMethod)}</p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5 min-w-0">
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

      {/* Product Rating Modal */}
      {reviewingItem && (
        <Modal
          isOpen={Boolean(reviewingItem)}
          onClose={() => setReviewingItem(null)}
          title={isRTL ? `تقييم: ${reviewingItem.productName}` : `Rate: ${reviewingItem.productName}`}
          maxWidth="md"
        >
          <div className="space-y-5 font-arabic p-1">
            <p className="text-body-sm text-ragab-ink-600">
              {isRTL
                ? 'رأيك يهمنا ويساعد الآخرين على اختيار المنتج الأفضل. شاركنا تجربتك بكل أمانة.'
                : 'Your feedback helps other customers make informed choices.'}
            </p>

            {/* Stars selection */}
            <div className="space-y-2">
              <label className="block text-body-sm font-bold text-ragab-charcoal">
                {isRTL ? 'التقييم بالنجوم' : 'Rating'}
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingScore(star)}
                    className="p-1.5 rounded-lg hover:bg-amber-50 focus-ring transition-transform hover:scale-110"
                    aria-label={`${star} stars`}
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        star <= ratingScore
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="ms-2 font-bold text-sm text-ragab-charcoal">
                  {ratingScore} {isRTL ? 'من 5 نجوم' : 'of 5 stars'}
                </span>
              </div>
            </div>

            {/* Review comment */}
            <div className="space-y-2">
              <label className="block text-body-sm font-bold text-ragab-charcoal">
                {isRTL ? 'تعليقك أو ملاحظاتك (اختياري)' : 'Comment or feedback (optional)'}
              </label>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={isRTL ? 'كيف كانت جودة المنتج والتغليف؟' : 'How was the product quality and packaging?'}
                className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-body-sm focus:border-ragab-brand-500 focus:outline-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-ragab-ink-100">
              <Button
                variant="outline"
                size="md"
                onClick={() => setReviewingItem(null)}
                disabled={submittingReview}
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تأكيد التقييم' : 'Submit Review')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
