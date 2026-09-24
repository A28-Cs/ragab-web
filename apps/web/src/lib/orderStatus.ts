import type { OrderStatus } from '../types';
import type { StatusTone } from '../components/ui/StatusPill';

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: 'warning',
  preparing: 'info',
  on_the_way: 'info',
  delivered: 'success',
  cancelled: 'danger',
};

export type OrderFilter = 'all' | 'processing' | 'on_the_way' | 'delivered' | 'cancelled';

/** Maps the account Orders filter tabs to the underlying OrderStatus values */
export function matchesFilter(status: OrderStatus, filter: OrderFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'processing':
      return status === 'pending' || status === 'preparing';
    case 'on_the_way':
      return status === 'on_the_way';
    case 'delivered':
      return status === 'delivered';
    case 'cancelled':
      return status === 'cancelled';
  }
}

/** Ordered pipeline steps for the order timeline (cancelled handled separately) */
export const ORDER_PIPELINE: OrderStatus[] = ['pending', 'preparing', 'on_the_way', 'delivered'];
