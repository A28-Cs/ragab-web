/**
 * Finance service — manual payment confirmation, backed by the API
 * (`/api/v1/admin/payments/[orderId]/confirm`). Requires `payments:approve`.
 */
import { PermissionKey } from '../types';
import { api } from '../lib/apiClient';

export interface ConfirmOutcome {
  orderNumber: string;
  amount: number;
  invoiceNumber?: string;
}

export const confirmPayment = async (orderId: string, _perms?: Set<PermissionKey>): Promise<ConfirmOutcome> => {
  const res = await api.post<{ orderNumber: string; amount: number }>(`/admin/payments/${encodeURIComponent(orderId)}/confirm`);
  return { orderNumber: res.orderNumber, amount: res.amount };
};
