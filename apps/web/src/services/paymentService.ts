/**
 * Payments admin service — backed by the API (`/api/v1/admin/payments`). Read-only list.
 * The legacy sync mutators are removed (payment state is server-owned); confirmation
 * lives in financeService and refunds in refundService.
 */
import { PaymentTransaction } from '../types';
import { api } from '../lib/apiClient';

export const getPayments = async (): Promise<PaymentTransaction[]> => api.get<PaymentTransaction[]>('/admin/payments', { limit: 100 });

export const getPaymentByOrderNumber = async (orderNumber: string): Promise<PaymentTransaction | null> => {
  const all = await getPayments();
  return all.find((p) => p.orderNumber === orderNumber) ?? null;
};
