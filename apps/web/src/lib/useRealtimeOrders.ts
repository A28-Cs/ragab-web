import { useEffect, useRef } from 'react';
import { Order, OrderStatus } from '@ragab/types';

interface UseRealtimeOrdersProps {
  rows: Order[];
  setRows: React.Dispatch<React.SetStateAction<Order[]>>;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
  currentFilter: 'all' | OrderStatus;
  onReconnect: () => void;
}

export function useRealtimeOrders({
  rows,
  setRows,
  setTotal,
  currentFilter,
  onReconnect,
}: UseRealtimeOrdersProps) {
  const isFirstConnection = useRef(true);

  useEffect(() => {
    const sse = new EventSource('/api/v1/events/admin-orders');

    sse.onopen = () => {
      // Re-fetch silently if it's a reconnection to catch up on missed events
      if (!isFirstConnection.current) {
        onReconnect();
      }
      isFirstConnection.current = false;
    };

    sse.addEventListener('order.status_updated', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const { orderId, status } = payload.data;

        setRows((currentRows) => {
          if (currentFilter !== 'all' && currentFilter !== status) {
            const exists = currentRows.some((r) => r.id === orderId);
            if (exists) setTotal((t) => Math.max(0, t - 1));
            return currentRows.filter((r) => r.id !== orderId);
          }

          return currentRows.map((order) =>
            order.id === orderId ? { ...order, status } : order
          );
        });
      } catch (e) {
        console.error('Failed to parse realtime event', e);
      }
    });

    sse.addEventListener('order.created', (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const newOrder = payload.data.order;

        if (currentFilter === 'all' || currentFilter === newOrder.status) {
          setRows((currentRows) => {
            if (currentRows.some((r) => r.id === newOrder.id)) return currentRows;
            return [newOrder, ...currentRows];
          });
          setTotal((t) => t + 1);
        }
      } catch (e) {
        console.error('Failed to parse realtime event', e);
      }
    });

    sse.onerror = (err) => {
      // Browser auto-reconnects SSE
    };

    return () => {
      sse.close();
    };
  }, [setRows, setTotal, currentFilter, onReconnect]);
}
