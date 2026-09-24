/**
 * Order service — backed by the API. The customer path (list, detail, create) is fully
 * wired. `createOrder` bridges the client cart to the SERVER cart, then calls the
 * authoritative /checkout endpoint: the server reprices everything and the totals the
 * client passed are ignored (§8). Admin operations map to the admin endpoints.
 * Signatures are preserved so existing callers keep compiling.
 */
import { Order, Address, OrderStatus, PermissionKey } from '../types';
import { api, type PageResult } from '../lib/apiClient';
import { fetchAllPages } from '../lib/pageWalker';

export const getOrders = async (filter?: { phone?: string }): Promise<Order[]> => {
  // `phone` is a legacy customer-scoping hint; the server scopes by the session instead.
  // Admin callers (no phone) get the admin list; customers get their own orders.
  const path = filter?.phone === undefined ? '/admin/orders' : '/orders';
  try {
    const page = await api.get<PageResult<Order>>(path, { limit: 100 });
    return page.items;
  } catch {
    // If the admin list is forbidden (a customer), fall back to their own orders.
    const page = await api.get<PageResult<Order>>('/orders', { limit: 100 });
    return page.items;
  }
};

export interface AdminOrderFilter {
  status?: OrderStatus;
  /** Order number, recipient name or phone. */
  q?: string;
}

/** One server page of the admin listing — filters, cursor and the matching total come from the API. */
export const getOrdersPage = async (
  filter: AdminOrderFilter & { cursor?: string; limit?: number },
): Promise<PageResult<Order>> =>
  api.get<PageResult<Order>>('/admin/orders', {
    status: filter.status,
    q: filter.q || undefined,
    cursor: filter.cursor,
    limit: filter.limit ?? 10,
  });

/** Every matching admin order (bounded walk) — for CSV export only. */
export const getAllAdminOrders = async (filter: AdminOrderFilter = {}): Promise<Order[]> =>
  fetchAllPages<Order>('/admin/orders', { status: filter.status, q: filter.q || undefined });

export const getOrderById = async (id: string): Promise<Order | null> => {
  try {
    return await api.get<Order>(`/orders/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
};

/** Legacy sync peek — no longer resolvable client-side; callers use the async API. */
export const findOrderByNumber = (_orderNumber: string): Order | null => null;

/**
 * Customer-initiated cancellation. The server owns the rule (only the owner's own
 * `pending` order) and returns the updated order; the UI renders exactly that — never
 * an optimistic local copy — so the state survives a reload.
 */
export const cancelMyOrder = async (id: string): Promise<Order> =>
  api.post<Order>(`/orders/${encodeURIComponent(id)}/cancel`);

/** The customer's next payment step — replayable after a reload, so nothing handed over at checkout is lost. */
export const getPaymentStep = async (id: string): Promise<PaymentInit> =>
  api.get<PaymentInit>(`/orders/${encodeURIComponent(id)}/payment`);

/** Recovery after a failed / abandoned online payment: fall back to cash on delivery. */
export const switchToCod = async (id: string): Promise<Order> =>
  api.post<Order>(`/orders/${encodeURIComponent(id)}/payment/cod`);

/** What the server tells the client to do next to pay (Paymob redirect / transfer instructions). */
export interface PaymentInit {
  status: string;
  redirectUrl?: string;
  clientSecret?: string;
  instructions?: { ar: string; en: string };
  paymentMethod: 'cod' | 'vodafone_cash' | 'instapay';
}

export interface CheckoutResult {
  order: Order;
  payment: PaymentInit;
}

/**
 * Place the order for the SERVER cart (the same cart the cart page renders — there is
 * no client copy to sync). The address is either a saved one (`addressId`) or a new one
 * created first. The server reprices everything; nothing money-related is sent. The
 * payment step of the response is returned so the success page can act on it.
 */
export const createOrder = async (payload: {
  addressId?: string;
  newAddress?: Omit<Address, 'id'>;
  paymentMethod: 'cod' | 'vodafone_cash' | 'instapay';
  couponCode?: string | null;
  notes?: string;
  /** Held by the caller across retries so a dropped connection replays, never double-orders. */
  idempotencyKey: string;
}): Promise<CheckoutResult> => {
  let addressId = payload.addressId;
  if (!addressId) {
    const addr = payload.newAddress;
    if (!addr) throw new Error('createOrder: addressId or newAddress is required');
    const created = await api.post<{ id: string }>('/addresses', {
      title: addr.title || 'التوصيل',
      label: addr.label,
      recipientName: addr.recipientName,
      phone: addr.phone,
      village: addr.village,
      streetAddress: addr.streetAddress,
      landmark: addr.landmark || undefined,
      notes: addr.notes || undefined,
    });
    addressId = created.id;
  }
  return api.post<CheckoutResult>(
    '/checkout',
    { addressId, paymentMethod: payload.paymentMethod, couponCode: payload.couponCode || undefined, notes: payload.notes || undefined },
    { idempotencyKey: payload.idempotencyKey },
  );
};

/** Stable idempotency key for one checkout attempt (survives retries within the page). */
export const newCheckoutKey = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ck-${Date.now()}-${Math.random()}`;

export const updateOrderStatus = async (id: string, status: OrderStatus, _perms?: Set<PermissionKey>): Promise<void> => {
  await api.patch(`/admin/orders/${encodeURIComponent(id)}/status`, { status });
};

/** Staff correction of the delivery snapshot (allowed while pending / preparing). */
export const updateOrderDelivery = async (id: string, address: Address, _perms?: Set<PermissionKey>): Promise<Order> =>
  api.patch<Order>(`/admin/orders/${encodeURIComponent(id)}/delivery`, {
    recipientName: address.recipientName,
    phone: address.phone,
    village: address.village,
    streetAddress: address.streetAddress,
    landmark: address.landmark || undefined,
    notes: address.notes || undefined,
  });

// Orders are never hard-deleted (financial history is retained) and there is no manual
// order entry — both were removed from the UI rather than left as buttons that lied.

/** Flatten orders into CSV rows (UTF-8 BOM so Excel opens Arabic correctly). */
export function ordersToCsv(rows: Order[], headers: string[]): string {
  const lines: string[][] = [headers];
  for (const o of rows) {
    lines.push([
      o.orderNumber,
      o.createdAt,
      o.deliveryAddress.recipientName,
      o.deliveryAddress.phone,
      o.deliveryAddress.village,
      o.status,
      o.paymentMethod,
      o.paymentStatus ?? '',
      String(o.items.reduce((n, it) => n + it.quantity, 0)),
      String(o.subtotal),
      String(o.deliveryFee),
      String(o.discount),
      String(o.total),
    ]);
  }
  const escape = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
  return `﻿${lines.map((r) => r.map(escape).join(',')).join('\r\n')}`;
}
