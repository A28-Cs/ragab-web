'use client';

import React, { useState } from 'react';
import { useOrderEvents } from '../../context/OrderEventsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Drawer } from '../ui/Drawer';
import { Order } from '../../types';
import { updateOrderStatus } from '../../services/orderService';
import { useToast } from '../ui/Toast';
import { cn } from '@ragab/utils';
import { ShoppingCart, Clock, User, Phone, MapPin, ArrowRight, Loader2, CheckCircle2, ChefHat } from 'lucide-react';
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

  // If closed or no orders, reset selected order
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedOrder(null);
    }
  }, [isOpen]);

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
    <Drawer 
      isOpen={isOpen} 
      onClose={onClose} 
      title={selectedOrder ? `طلب #${selectedOrder.orderNumber}` : "الطلبات الجديدة"} 
      position="bottom" 
      size="md"
    >
      <div className="flex flex-col h-full">
        {selectedOrder ? (
          <OrderQuickDetail order={selectedOrder} onBack={handleBack} onAccepted={() => removeOrder(selectedOrder.id)} />
        ) : (
          <PendingOrdersList orders={pendingOrders} onSelect={setSelectedOrder} />
        )}
      </div>
    </Drawer>
  );
}

function PendingOrdersList({ orders, onSelect }: { orders: Order[], onSelect: (o: Order) => void }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ragab-ink-400">
        <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-body font-semibold">لا توجد طلبات جديدة</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map(order => (
        <button
          key={order.id}
          onClick={() => onSelect(order)}
          className="w-full text-start bg-white border border-ragab-ink-100 rounded-xl p-4 hover:border-ragab-brand-300 hover:shadow-sm transition-all flex flex-col gap-2"
        >
          <div className="flex justify-between items-start">
            <span className="font-bold text-body text-ragab-ink-800">#{order.orderNumber}</span>
            <span className="text-caption font-semibold text-ragab-brand-600 bg-ragab-brand-50 px-2 py-0.5 rounded-full">
              {order.items?.length || 0} منتجات
            </span>
          </div>
          
          <div className="flex items-center gap-2 text-ragab-ink-600 text-body-sm">
            <User className="w-4 h-4" />
            <span>{order.deliveryAddress?.recipientName}</span>
          </div>
          
          <div className="flex items-center gap-2 text-ragab-ink-400 text-caption">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="mx-1">•</span>
            <Price price={order.total} className="font-bold text-ragab-ink-700" />
          </div>
        </button>
      ))}
    </div>
  );
}

function OrderQuickDetail({ order, onBack, onAccepted }: { order: Order, onBack: () => void, onAccepted: () => void }) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const { showToast } = useToast();
  
  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await updateOrderStatus(order.id, 'preparing');
      showToast('تم قبول الطلب بنجاح ✅', 'success');
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
          <span>جاري التحضير – في انتظار المندوب</span>
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
    <div className="flex flex-col h-full">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-ragab-brand-600 mb-4 font-semibold hover:underline w-fit touch-target"
      >
        <ArrowRight className="w-4 h-4" />
        العودة للقائمة
      </button>

      <div className="space-y-4 flex-1 overflow-y-auto pb-24">
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
                    <p className="font-semibold text-body-sm text-ragab-ink-800 line-clamp-1">{item.productNameAr}</p>
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

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-ragab-ink-100 z-10 sm:absolute">
        <button
          disabled={isAccepting}
          onClick={handleAccept}
          className={cn(
            "w-full h-14 rounded-xl font-bold text-body flex items-center justify-center transition-all",
            isAccepting 
              ? "bg-ragab-ink-200 text-ragab-ink-400 cursor-not-allowed" 
              : "bg-ragab-brand-500 text-ragab-ink-900 hover:bg-ragab-brand-400 shadow-md active:scale-[0.98]"
          )}
        >
          {isAccepting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              جاري قبول الطلب...
            </span>
          ) : (
            "قبول وبدء التحضير"
          )}
        </button>
      </div>
    </div>
  );
}

