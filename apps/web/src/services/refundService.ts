/**
 * Refund service — backed by the API (`/api/v1/admin/refunds`). Requires
 * `payments:approve` AND step-up re-authentication (the caller passes the admin's
 * current password). The server restocks on a full refund and enforces the over-refund
 * cap at the database. `cancelOrder` maps to the customer-cancel/admin-cancel endpoints.
 */
import { PermissionKey } from '../types';
import { api } from '../lib/apiClient';

export interface RefundOutcome {
  orderNumber: string;
  orderUpdated: boolean;
  paymentUpdated: boolean;
  amount: number;
}

export const issueRefund = async (orderId: string, _perms?: Set<PermissionKey>, reauthPassword?: string): Promise<RefundOutcome> => {
  const res = await api.post<{ full: boolean; orderNumber: string; amount: number }>('/admin/refunds', {
    orderId,
    reauthPassword: reauthPassword ?? '',
  });
  return { orderNumber: res.orderNumber, orderUpdated: res.full, paymentUpdated: true, amount: res.amount };
};

export interface CancelOutcome {
  orderNumber: string;
  cancelled: boolean;
  refunded: boolean;
  amount: number;
}

export const cancelOrder = async (orderId: string, _perms?: Set<PermissionKey>): Promise<CancelOutcome> => {
  await api.patch(`/admin/orders/${encodeURIComponent(orderId)}/status`, { status: 'cancelled' });
  return { orderNumber: orderId, cancelled: true, refunded: false, amount: 0 };
};
