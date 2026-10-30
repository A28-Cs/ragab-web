'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useOrderEvents } from '../../context/OrderEventsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Order } from '../../types';
import { updateOrderStatus, updatePrescriptionDecision } from '../../services/orderService';
import { useToast } from '../ui/Toast';
import { cn } from '@ragab/utils';
import {
  ShoppingCart,
  Clock,
  User,
  Phone,
  MapPin,
  ArrowRight,
  Loader2,
  CheckCircle2,
  ChefHat,
  FileText,
  Eye,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Price } from '../ui/Price';

export function OrdersQuickAccessTrigger({ children }: { children: (props: { onClick: () => void, unreadCount: number, pendingOrders: Order[] }) => React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { hasPermission } = useAuth();
  const canManageOrders = hasPermission('orders', 'view');
  const { unreadCount, pendingOrders } = useOrderEvents();

  if (!canManageOrders) return null;

  return (
    <>
      {children({ onClick: () => setIsOpen(true), unreadCount, pendingOrders })}
      <OrdersQuickAccessPopup isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export function OrdersQuickAccessPopup({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { pendingOrders, removeOrder } = useOrderEvents();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // If closed or no orders, reset selected order; auto-select if exactly 1 order
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedOrder(null);
    } else if (pendingOrders.length === 1 && !selectedOrder) {
      setSelectedOrder(pendingOrders[0]);
    }
  }, [isOpen, pendingOrders, selectedOrder]);

  // If the selected order is removed (accepted by someone else), close detail view
  React.useEffect(() => {
    if (selectedOrder && !pendingOrders.some(o => o.id === selectedOrder.id)) {
      setSelectedOrder(null);
      if (pendingOrders.length === 0) {
        onClose();
      }
    }
  }, [pendingOrders, selectedOrder, onClose]);

  const handleBack = () => setSelectedOrder(null);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={selectedOrder ? `طلب جديد #${selectedOrder.orderNumber}` : `الطلبات الواردة الجديدة (${pendingOrders.length})`} 
      maxWidth="lg"
    >
      <div className="flex flex-col min-h-0">
        {selectedOrder ? (
          <OrderQuickDetail order={selectedOrder} onBack={handleBack} onAccepted={() => removeOrder(selectedOrder.id)} />
        ) : (
          <PendingOrdersList orders={pendingOrders} onSelect={setSelectedOrder} />
        )}
      </div>
    </Modal>
  );
}

function PendingOrdersList({ orders, onSelect }: { orders: Order[], onSelect: (o: Order) => void }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ragab-ink-400">
        <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-body font-bold text-ragab-ink-600">لا توجد طلبات جديدة حالياً</p>
        <p className="text-caption text-ragab-ink-400">ستظهر أي طلبات جديدة هنا فور تسجيلها من العملاء</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
      {orders.map(order => {
        const hasPrescription = order.hasPrescriptionItems || Boolean(order.prescriptionUrl);
        return (
          <button
            key={order.id}
            onClick={() => onSelect(order)}
            className={cn(
              "w-full text-start bg-white border rounded-xl p-3.5 transition-all flex flex-col gap-2 hover:shadow-md hover:border-ragab-brand-400 group",
              hasPrescription
                ? "border-amber-300 bg-amber-50/20 hover:border-amber-400 hover:bg-amber-50/40"
                : "border-ragab-ink-150"
            )}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-body text-ragab-ink-800">#{order.orderNumber}</span>
                {hasPrescription && (
                  order.prescriptionStatus === 'rejected_visit_required' ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                      <span>🛑</span>
                      <span>استلام بالصيدلية</span>
                    </span>
                  ) : order.prescriptionStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <span>✓</span>
                      <span>روشتة معتمدة</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-500 text-white shadow-xs animate-pulse">
                      <FileText className="w-3.5 h-3.5" />
                      <span>📜 روشتة مرفقة</span>
                    </span>
                  )
                )}
              </div>
              <span className="text-caption font-semibold text-ragab-brand-700 bg-ragab-brand-50 px-2 py-0.5 rounded-full shrink-0">
                {order.items?.length || 0} منتجات
              </span>
            </div>
            
            <div className="flex items-center justify-between text-body-sm text-ragab-ink-700">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-ragab-ink-400 shrink-0" />
                <span className="font-semibold">{order.deliveryAddress?.recipientName}</span>
              </div>
              <Price price={order.total} className="font-bold text-ragab-ink-900 text-body" />
            </div>
            
            <div className="flex items-center justify-between text-caption pt-1.5 border-t border-ragab-ink-100">
              <div className="flex items-center gap-2 text-ragab-ink-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                {order.deliveryAddress?.village && (
                  <>
                    <span className="mx-1">•</span>
                    <span>{order.deliveryAddress.village}</span>
                  </>
                )}
              </div>
              <span className="text-ragab-brand-600 font-bold group-hover:translate-x-[-2px] transition-transform flex items-center gap-1">
                <span>مراجعة وقبول</span>
                <span>←</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OrderQuickDetail({ order: initialOrder, onBack, onAccepted }: { order: Order, onBack: () => void, onAccepted: () => void }) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('يرجى الحضور لمقر الصيدلية مع أصل الروشتة وبطاقة الرقم القومي.');
  const { showToast } = useToast();

  const hasPrescription = order.hasPrescriptionItems || Boolean(order.prescriptionUrl);

  const handleDecision = async (decision: 'approved' | 'rejected_visit_required', reason?: string) => {
    setIsUpdatingDecision(true);
    try {
      const updated = await updatePrescriptionDecision(order.id, decision, reason);
      setOrder(prev => ({
        ...prev,
        prescriptionStatus: updated.prescriptionStatus,
        prescriptionRejectionReason: updated.prescriptionRejectionReason
      }));
      showToast(decision === 'approved' ? 'تم اعتماد الروشتة وتأكيد التوصيل ✓' : 'تم رفض التوصيل - استلام من الصيدلية فقط 🛑', 'success');
      setShowRejectModal(false);
    } catch (err: any) {
      showToast(err.bilingual?.ar || err.message || 'فشل تحديث قرار الروشتة', 'error');
    } finally {
      setIsUpdatingDecision(false);
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      if (hasPrescription && order.prescriptionStatus === 'pending') {
        await updatePrescriptionDecision(order.id, 'approved');
      }
      await updateOrderStatus(order.id, 'preparing');
      showToast('تم قبول الطلب وبدء التحضير بنجاح ✅', 'success');
      setAccepted(true);
      setIsAccepting(false);

      // Countdown 3 → 0, then close
      let count = 3;
      setCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          onAccepted();
        }
      }, 1000);
    } catch (err: any) {
      showToast(err.bilingual?.ar || 'حدث خطأ أثناء قبول الطلب', 'error');
      setIsAccepting(false);
    }
  };

  // ======= SUCCESS SCREEN =======
  if (accepted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 py-10 text-center px-4">
        <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <p className="text-h3 font-bold text-ragab-ink-800 mb-1">تم القبول بنجاح!</p>
          <p className="text-body-sm text-ragab-ink-500 font-arabic">
            طلب <span className="font-bold text-ragab-ink-700">#{order.orderNumber}</span> جاري تحضيره الآن
          </p>
        </div>

        {/* Preparing status badge */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 font-semibold text-body-sm">
          <ChefHat className="w-5 h-5 text-amber-500 shrink-0" />
          <span>
            {order.prescriptionStatus === 'rejected_visit_required'
              ? 'جاري التحضير – استلام بالصيدلية (لا يُسلّم للمندوب)'
              : 'جاري التحضير – في انتظار المندوب'}
          </span>
        </div>

        {/* Countdown */}
        <p className="text-caption text-ragab-ink-400">
          سيُغلق هذا الطلب خلال{' '}
          <span className="font-bold text-ragab-ink-600">{countdown}</span>{' '}
          {countdown === 1 ? 'ثانية' : 'ثوانٍ'}...
        </p>
      </div>
    );
  }

  // ======= DETAIL SCREEN =======
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-ragab-ink-100">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-body-sm font-bold text-ragab-brand-700 hover:underline w-fit touch-target"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الطلبات</span>
        </button>
        <Link
          href={`/control-center/orders/${order.id}`}
          className="text-caption font-bold text-ragab-ink-500 hover:text-ragab-brand-700 flex items-center gap-1"
        >
          <span>صفحة الطلب الكاملة</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
        {/* Prescription Highlight Box */}
        {hasPrescription && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xl">📜</span>
                <div>
                  <h4 className="font-bold text-body-sm text-amber-950">روشتة طبية مرفقة بالطلب</h4>
                  <p className="text-caption text-amber-800">
                    {order.prescriptionStatus === 'approved'
                      ? 'تم اعتماد الروشتة – التوصيل مسموح'
                      : order.prescriptionStatus === 'rejected_visit_required'
                      ? 'مرفوضة للتوصيل – الاستلام من مقر الصيدلية فقط'
                      : 'يرجى فحص صورة الروشتة واتخاذ القرار الطبي'}
                  </p>
                </div>
              </div>
              <div>
                {order.prescriptionStatus === 'rejected_visit_required' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-xs">
                    🛑 استلام بالصيدلية فقط
                  </span>
                ) : order.prescriptionStatus === 'approved' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
                    ✓ معتمدة للتوصيل
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-xs animate-pulse">
                    ⏳ بانتظار قرار الصيدلي
                  </span>
                )}
              </div>
            </div>

            {order.prescriptionUrl ? (
              <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-amber-200">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="relative group w-14 h-14 rounded-lg overflow-hidden border border-amber-300 shrink-0 bg-ragab-surface focus:outline-none"
                  title="اضغط لمعاينة وتكبير الروشتة"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={order.prescriptionUrl}
                    alt="Prescription"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-4 h-4" />
                  </div>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-bold text-ragab-ink-800">صورة الروشتة المرفوعة من العميل</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                      className="text-caption font-bold text-ragab-brand-600 hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      معاينة وتكبير الروشتة
                    </button>
                    <a
                      href={order.prescriptionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-caption text-ragab-ink-500 hover:text-ragab-ink-700 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      فتح بنافذة جديدة
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-caption font-bold text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>الطلب يحتوي على أدوية خاضعة للرقابة ولكن العميل لم يرفع صورة الروشتة!</span>
              </div>
            )}

            {/* Doctor Decision Controls */}
            <div className="pt-2 border-t border-amber-200 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={isUpdatingDecision || order.prescriptionStatus === 'approved'}
                onClick={() => handleDecision('approved')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-caption font-bold flex items-center gap-1.5 transition-all",
                  order.prescriptionStatus === 'approved'
                    ? "bg-emerald-100 text-emerald-800 cursor-default"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-95"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اعتماد الروشتة (توصيل مسموح)</span>
              </button>

              <button
                type="button"
                disabled={isUpdatingDecision || order.prescriptionStatus === 'rejected_visit_required'}
                onClick={() => setShowRejectModal(true)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-caption font-bold flex items-center gap-1.5 transition-all",
                  order.prescriptionStatus === 'rejected_visit_required'
                    ? "bg-red-100 text-red-800 cursor-default"
                    : "bg-red-600 hover:bg-red-700 text-white shadow-xs active:scale-95"
                )}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>رفض التوصيل (شك الصيدلي - استلام بالصيدلية)</span>
              </button>
            </div>

            {order.prescriptionRejectionReason && (
              <div className="p-2.5 bg-red-50 rounded-lg border border-red-200 text-caption text-red-800">
                <span className="font-bold">سبب التحفظ: </span>
                <span>{order.prescriptionRejectionReason}</span>
              </div>
            )}
          </div>
        )}

        {/* Customer Info */}
        <div className="bg-ragab-surface rounded-xl p-3 space-y-2 border border-ragab-ink-100">
          <div className="flex items-center gap-2 text-ragab-ink-800 font-semibold">
            <User className="w-4 h-4 text-ragab-ink-400" />
            {order.deliveryAddress?.recipientName}
          </div>
          <div className="flex items-center gap-2 text-ragab-ink-600 text-body-sm">
            <Phone className="w-4 h-4 text-ragab-ink-400" />
            <a href={`tel:${order.deliveryAddress?.phone}`} className="text-ragab-brand-600 hover:underline">
              {order.deliveryAddress?.phone}
            </a>
          </div>
          <div className="flex items-start gap-2 text-ragab-ink-600 text-body-sm">
            <MapPin className="w-4 h-4 text-ragab-ink-400 shrink-0 mt-0.5" />
            <span>
              {order.deliveryAddress?.village}، {order.deliveryAddress?.streetAddress}
              {order.deliveryAddress?.landmark && ` (${order.deliveryAddress.landmark})`}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2">
          <h4 className="font-bold text-body-sm text-ragab-ink-800">عناصر الطلب ({order.items?.length || 0})</h4>
          <div className="bg-white border border-ragab-ink-100 rounded-xl divide-y divide-ragab-ink-100">
            {order.items?.map(item => (
              <div key={item.id} className="p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ragab-surface shrink-0 overflow-hidden border border-ragab-ink-100 flex items-center justify-center">
                    {item.image ? (
                      <img src={item.image} alt={item.productNameAr} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingCart className="w-5 h-5 text-ragab-ink-300" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-body-sm text-ragab-ink-800 line-clamp-1">{item.productNameAr}</p>
                      {item.requiresPrescription && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <span className="font-black">Rx</span>
                          <span>خاضع للرقابة</span>
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-ragab-ink-500">{item.unit}</p>
                  </div>
                </div>
                <div className="text-end shrink-0 pl-1">
                  <p className="font-bold text-ragab-ink-800">x{item.quantity}</p>
                  <Price price={item.total} className="text-caption text-ragab-ink-600" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-ragab-surface rounded-xl p-3 space-y-2 border border-ragab-ink-100 text-body-sm">
          <div className="flex justify-between text-ragab-ink-600">
            <span>المجموع</span>
            <Price price={order.subtotal} />
          </div>
          <div className="flex justify-between text-ragab-ink-600">
            <span>التوصيل</span>
            <Price price={order.deliveryFee} />
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-ragab-brand-600 font-semibold">
              <span>خصم</span>
              <Price price={order.discount} />
            </div>
          )}
          <div className="flex justify-between text-ragab-ink-800 font-bold pt-2 border-t border-ragab-ink-200 text-body">
            <span>الإجمالي</span>
            <Price price={order.total} />
          </div>
        </div>
      </div>

      {/* Modal Action CTA */}
      <div className="mt-4 pt-3 border-t border-ragab-ink-100">
        <button
          disabled={isAccepting}
          onClick={handleAccept}
          className={cn(
            "w-full h-12 rounded-xl font-bold text-body flex items-center justify-center gap-2 transition-all shadow-sm",
            isAccepting 
              ? "bg-ragab-ink-200 text-ragab-ink-400 cursor-not-allowed" 
              : order.prescriptionStatus === 'rejected_visit_required'
              ? "bg-amber-600 text-white hover:bg-amber-700 shadow-md active:scale-[0.98]"
              : "bg-ragab-brand-600 text-white hover:bg-ragab-brand-700 shadow-md active:scale-[0.98]"
          )}
        >
          {isAccepting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>جاري قبول الطلب...</span>
            </>
          ) : order.prescriptionStatus === 'rejected_visit_required' ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>بدء التحضير (استلام شخصي بالصيدلية)</span>
            </>
          ) : hasPrescription && order.prescriptionStatus === 'pending' ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>اعتماد الروشتة وبدء التحضير</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>قبول وبدء التحضير فوراً</span>
            </>
          )}
        </button>
      </div>

      {/* Prescription Preview Modal */}
      {isPreviewOpen && order.prescriptionUrl && (
        <Modal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title="معاينة الروشتة الطبية" maxWidth="lg">
          <div className="space-y-4">
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-ragab-ink-100 bg-black/5 flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.prescriptionUrl} alt="Prescription Full Preview" className="max-w-full h-auto object-contain rounded-lg" />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={order.prescriptionUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl text-body-sm font-bold bg-ragab-surface border border-ragab-ink-200 text-ragab-ink-700 hover:bg-ragab-ink-50 flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح بحجم أصلي في نافذة مستقلة</span>
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Visit Required Modal */}
      {showRejectModal && (
        <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="رفض التوصيل – إلزام الاستلام من الصيدلية" maxWidth="md">
          <div className="space-y-4">
            <p className="text-body-sm text-ragab-ink-600">
              سيتم إشعار العميل والمندوب بأن هذا الدواء خاضع للرقابة ولا يُصرف عبر التوصيل إلا بعد فحص الروشتة الأصلية وبطاقة الرقم القومي بمقر الصيدلية.
            </p>
            <div>
              <label className="block text-caption font-bold text-ragab-ink-700 mb-1">سبب التحفظ أو ملاحظة للعميل:</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full text-body-sm p-3 rounded-xl border border-ragab-ink-200 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl text-body-sm font-bold text-ragab-ink-600 hover:bg-ragab-ink-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isUpdatingDecision}
                onClick={() => handleDecision('rejected_visit_required', rejectReason)}
                className="px-4 py-2 rounded-xl text-body-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                تأكيد رفض التوصيل
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
