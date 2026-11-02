'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Order } from '../types';
import { useAuth } from './AuthContext';
import { getOrdersPage, getOrderById } from '../services/orderService';
import { useToast } from '../components/ui/Toast';

interface OrderEventsContextValue {
  pendingOrders: Order[];
  unreadCount: number;
  isConnecting: boolean;
  markAsRead: (id: string) => void;
  removeOrder: (id: string) => void;
  refreshPendingOrders: () => Promise<void>;
}

const OrderEventsContext = createContext<OrderEventsContextValue | null>(null);

// كود تشغيل تنبيه الأوردرات (الجرس الكريستالي الثلاثي (عالي النقاء)) - صيدلية رجب
export function playRagabPharmacyOrderAlert() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const playNote = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.9, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      [659.25, 830.61, 1318.51].forEach((f, i) => playNote(f, now + i * 0.22, 1.15));
    }

    // نطق صوتي مضبوط بالتشكيل لاسم صيدلية رجب
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const msg = new SpeechSynthesisUtterance("أُورْدَر جَدِيد عَلَى صَيْدَلِيَّة رَجَبْ");
        msg.lang = 'ar-EG';
        msg.rate = 1.05;
        msg.pitch = 1;
        msg.volume = 1.0;
        window.speechSynthesis.speak(msg);
      }, 850);
    }
  } catch (e) {
    // Ignore audio errors
  }
}

export function OrderEventsProvider({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [isConnecting, setIsConnecting] = useState(false);

  const canManageOrders = hasPermission('orders', 'view');
  
  // Use a ref to keep track of existing order IDs to avoid duplicate fetching
  const pendingOrderIdsRef = useRef<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    if (!canManageOrders) return;
    try {
      const page = await getOrdersPage({ status: 'pending', limit: 50 });
      setPendingOrders(page.items);
      pendingOrderIdsRef.current = new Set(page.items.map(o => o.id));
    } catch (err) {
      console.error('Failed to fetch initial pending orders', err);
    }
  }, [canManageOrders]);

  useEffect(() => {
    if (canManageOrders) {
      fetchPending();
    }
  }, [fetchPending, canManageOrders]);

  useEffect(() => {
    if (!canManageOrders || typeof window === 'undefined') return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [canManageOrders]);

  useEffect(() => {
    if (!canManageOrders) return;

    setIsConnecting(true);
    let es: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      es = new EventSource('/api/v1/events/admin-orders', { withCredentials: true });

      es.onopen = () => {
        setIsConnecting(false);
      };

      es.onerror = () => {
        es?.close();
        setIsConnecting(true);
        reconnectTimer = setTimeout(connect, 5000);
      };

      es.addEventListener('order.created', async (e) => {
        try {
          const payload = JSON.parse(e.data);
          const orderId = payload.data?.order?.id || payload.data?.orderId;
          
          if (orderId && !pendingOrderIdsRef.current.has(orderId)) {
             pendingOrderIdsRef.current.add(orderId);
             
             const fullOrder = await getOrderById(orderId);
             if (fullOrder && fullOrder.status === 'pending') {
                setPendingOrders((prev) => {
                  if (prev.some(o => o.id === fullOrder.id)) return prev;
                  return [fullOrder, ...prev];
                });
                
                setUnreadIds((prev) => {
                  const next = new Set(prev);
                  next.add(fullOrder.id);
                  return next;
                });
                
                showToast(`طلب جديد #${fullOrder.orderNumber}`, 'info');
                playRagabPharmacyOrderAlert();

                // إشعار سطح المكتب / الويندوز في زاوية الشاشة
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  try {
                    const formattedTotal = fullOrder.total !== undefined ? `${fullOrder.total.toFixed(2)} ج.م` : '';
                    const n = new Notification(`طلب جديد #${fullOrder.orderNumber} - صيدلية رجب`, {
                      body: formattedTotal ? `الإجمالي: ${formattedTotal}\nاضغط لفتح الطلب باللوحة` : `اضغط لفتح الطلب باللوحة`,
                      icon: '/favicon.ico',
                      tag: `order-${fullOrder.id}`,
                    });
                    n.onclick = () => {
                      window.focus();
                      n.close();
                    };
                  } catch (e) {
                    // Ignore desktop notification error
                  }
                }
             } else {
                pendingOrderIdsRef.current.delete(orderId);
             }
          }
        } catch(err) {
          console.error('Error parsing order.created', err);
        }
      });

      es.addEventListener('order.status_updated', async (e) => {
        try {
           const payload = JSON.parse(e.data);
           const { orderId, status } = payload.data;
           
           if (status !== 'pending') {
              setPendingOrders(prev => prev.filter(o => o.id !== orderId));
              pendingOrderIdsRef.current.delete(orderId);
              setUnreadIds(prev => {
                 const next = new Set(prev);
                 next.delete(orderId);
                 return next;
              });
           } else if (!pendingOrderIdsRef.current.has(orderId)) {
              // Order returned to pending state
              pendingOrderIdsRef.current.add(orderId);
              const fullOrder = await getOrderById(orderId);
              if (fullOrder && fullOrder.status === 'pending') {
                setPendingOrders((prev) => {
                  if (prev.some(o => o.id === fullOrder.id)) return prev;
                  return [fullOrder, ...prev];
                });
              } else {
                pendingOrderIdsRef.current.delete(orderId);
              }
           }
        } catch(err) {
           console.error('Error parsing order.status_updated', err);
        }
      });
    };

    connect();

    return () => {
      if (es) es.close();
      clearTimeout(reconnectTimer);
    };
  }, [canManageOrders, showToast]);

  const markAsRead = useCallback((id: string) => {
    setUnreadIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const removeOrder = useCallback((id: string) => {
    setPendingOrders(prev => prev.filter(o => o.id !== id));
    pendingOrderIdsRef.current.delete(id);
    markAsRead(id);
  }, [markAsRead]);

  return (
    <OrderEventsContext.Provider value={{
      pendingOrders,
      unreadCount: unreadIds.size,
      isConnecting,
      markAsRead,
      removeOrder,
      refreshPendingOrders: fetchPending
    }}>
      {children}
    </OrderEventsContext.Provider>
  );
}

export function useOrderEvents() {
  const ctx = useContext(OrderEventsContext);
  if (!ctx) throw new Error('useOrderEvents must be used within OrderEventsProvider');
  return ctx;
}
