'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Download, MoreVertical, Eye, XCircle, Loader2, BellRing, FileText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getAllAdminOrders, getOrdersPage, ordersToCsv } from '../../../services/orderService';
import { cancelOrder } from '../../../services/refundService';
import { downloadTextFile } from '../../../services/reportService';
import { PermissionError } from '../../../lib/rbac';
import { ApiError } from '../../../lib/apiClient';
import { Order, OrderStatus } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Badge } from '../../../components/ui/Badge';
import { CursorPager } from '../../../components/ui/CursorPager';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import {
  ORDER_STATUS_TONE,
  DETAILED_STATUS_TONE,
  DETAILED_STATUS_LABELS_AR,
  DELIVERY_STATUS_TONE,
  DELIVERY_STATUS_LABELS_AR,
} from '../../../lib/orderStatus';

import { useRealtimeOrders } from '../../../lib/useRealtimeOrders';

const PAGE_SIZE = 10;

/**
 * Orders list — paginated and filtered on the SERVER (Phase 8): the status filter and
 * the search box are query params, the heading count is the server's matching total
 * (AC-23), and pages follow the API's cursors. Export walks every matching page.
 * Every control here does what it says: cancel goes to the server (which refuses to
 * cancel a paid order until it is refunded); manual orders and "delete order" are gone.
 */
function OrdersAdminInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();
  const [rows, setRows] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  // cursors[i] = cursor that fetches page i+1 (page 1 has none). Reset with the filters.
  const cursors = useRef<(string | undefined)[]>([undefined]);

  // Debounce typing → one request per pause, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    cursors.current = [undefined];
    setPage(1);
  }, [q, status]);

  const load = useCallback(async (silent = false) => {
    const cursor = cursors.current[page - 1];
    if (page > 1 && cursor === undefined) return; // filters just changed; page resets to 1
    if (!silent) setLoading(true);
    try {
      const res = await getOrdersPage({ status: status === 'all' ? undefined : status, q, cursor, limit: PAGE_SIZE });
      setRows(res.items);
      setTotal(res.total ?? res.items.length);
      setHasMore(res.hasMore);
      if (res.nextCursor) cursors.current[page] = res.nextCursor;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    load();
  }, [load, tick]);

  const reload = () => setTick((n) => n + 1);
  const silentReload = useCallback(() => load(true), [load]);
  
  useRealtimeOrders({
    rows,
    setRows,
    setTotal,
    currentFilter: status,
    onReconnect: silentReload
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const message = e instanceof PermissionError ? t.states.forbiddenTitle : e instanceof ApiError ? (ar ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    }
  };

  const onCancel = () => {
    if (!cancelTarget) return;
    setBusy(true);
    const target = cancelTarget;
    guard(async () => {
      const res = await cancelOrder(target.id, permissions);
      if (res.refunded) {
        record('order_cancelled_refunded', 'orders', target.orderNumber, { metadata: { amount: String(res.amount) } });
      } else {
        record('order_status_changed', 'orders', target.orderNumber, { metadata: { status: 'cancelled' } });
      }
      reload();
      showToast(res.refunded ? t.adminOrders.orderCancelledRefunded : t.adminOrders.orderCancelled, 'success');
    }).finally(() => {
      setBusy(false);
      setCancelTarget(null);
    });
  };

  const onExport = () => {
    setExporting(true);
    guard(async () => {
      const all = await getAllAdminOrders({ status: status === 'all' ? undefined : status, q });
      const headers = [
        t.adminOrders.colOrder, t.adminOrders.colDate, t.adminOrders.colCustomer, t.adminOrders.phone, t.adminOrders.village,
        t.adminOrders.colStatus, t.account.paymentMethod, t.adminPayments.colStatus, t.adminOrders.colItems,
        t.account.subtotal, t.account.deliveryFee, t.account.discount, t.adminOrders.colTotal,
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`ragab-orders-${status}-${stamp}.csv`, ordersToCsv(all, headers));
      record('order_status_changed', 'orders', `export:${all.length}`, { metadata: { op: 'export', status } });
      showToast(t.adminOrders.exported, 'success');
    }).finally(() => setExporting(false));
  };

  const statusOptions = [
    { value: 'all', label: t.adminOrders.filterAll },
    ...(['pending', 'preparing', 'on_the_way', 'delivered', 'cancelled'] as OrderStatus[]).map((s) => ({
      value: s,
      label: t.account.orderStatus[s],
    })),
  ];

  const columns: DataColumn<Order>[] = [
    {
      key: 'order',
      header: t.adminOrders.colOrder,
      hideOnMobile: true,
      cell: (o) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/control-center/orders/${o.id}`} className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700" dir="ltr">
              {o.orderNumber}
            </Link>
            {o.manual && <Badge variant="neutral" size="sm">{t.adminOrders.manualBadge}</Badge>}
            {o.refunded && <Badge variant="warning" size="sm">{t.adminOrders.refundedBadge}</Badge>}
            {o.hasPrescriptionItems && (
              o.prescriptionStatus === 'rejected_visit_required' ? (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white shadow-xs">
                  <span>🛑</span>
                  <span>{ar ? 'زيارة الصيدلية' : 'Visit Required'}</span>
                </span>
              ) : o.prescriptionStatus === 'approved' ? (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                  <span>✓</span>
                  <span>{ar ? 'روشتة معتمدة' : 'Rx Approved'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-600 text-white shadow-xs">
                  <span className="font-black">Rx</span>
                  <span>{ar ? 'فحص روشتة' : 'Pending Rx'}</span>
                </span>
              )
            )}
          </div>
          {o.stuckInfo?.isStuck && (
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
              <span>⚠️</span>
              <span>{ar ? `عالق (${o.stuckInfo.minutesInCurrentStatus} دقيقة)` : `Stuck (${o.stuckInfo.minutesInCurrentStatus}m)`}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'customer',
      header: t.adminOrders.colCustomer,
      cell: (o) => (
        <div>
          <div className="font-medium text-ragab-ink-800">{o.deliveryAddress.recipientName}</div>
          <div dir="ltr" className="text-caption text-ragab-ink-400">{o.deliveryAddress.phone}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: ar ? 'حالة الطلب' : 'Order Status',
      cell: (o) => {
        const detStatus = o.detailedStatus;
        const tone = detStatus ? DETAILED_STATUS_TONE[detStatus] : ORDER_STATUS_TONE[o.status];
        const label = detStatus && ar ? DETAILED_STATUS_LABELS_AR[detStatus] : t.account.orderStatus[o.status];
        return <StatusPill tone={tone}>{label}</StatusPill>;
      },
    },
    {
      key: 'delivery',
      header: ar ? 'مهمة التوصيل والمندوب' : 'Delivery & Courier',
      hideOnMobile: true,
      cell: (o) => {
        const delStatus = o.deliveryStatus;
        const courier = (o as any).courier;
        if (!delStatus && !courier) {
          return <span className="text-caption text-ragab-ink-400">—</span>;
        }
        const delTone = delStatus ? DELIVERY_STATUS_TONE[delStatus] : 'neutral';
        const delLabel = delStatus && ar ? DELIVERY_STATUS_LABELS_AR[delStatus] : delStatus || 'بانتظار التوزيع';
        return (
          <div className="flex flex-col gap-1">
            <StatusPill tone={delTone}>{delLabel}</StatusPill>
            {courier?.driverName && (
              <span className="text-caption text-ragab-ink-600 font-medium">
                🛵 {courier.driverName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'payment',
      header: ar ? 'حالة الدفع' : 'Payment',
      hideOnMobile: true,
      cell: (o) => {
        const payStatus = o.paymentStatus || 'pending';
        const isPaid = payStatus === 'paid';
        return (
          <div className="flex flex-col gap-0.5">
            <span className={`text-caption font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isPaid ? (ar ? '✓ مدفوع' : 'Paid') : (ar ? 'قيد الانتظار' : 'Pending')}
            </span>
            <span className="text-[11px] text-ragab-ink-400 uppercase">
              {o.paymentMethod === 'cod' ? (ar ? 'عند الاستلام' : 'COD') : o.paymentMethod}
            </span>
          </div>
        );
      },
    },
    {
      key: 'total',
      header: t.adminOrders.colTotal,
      cell: (o) => <span className="font-bold text-ragab-ink-800">{o.total} {t.common.egp}</span>,
    },
    {
      key: 'date',
      header: t.adminOrders.colDate,
      cell: (o) => <span dir="ltr" className="text-caption text-ragab-ink-500">{o.createdAt}</span>,
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: t.admin.actions,
      align: 'end',
      cell: (o) => (
        <DropdownMenu
          trigger={
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100">
              <MoreVertical className="w-4 h-4" />
            </span>
          }
          items={[
            { label: t.admin.view, icon: <Eye className="w-4 h-4" />, href: `/control-center/orders/${o.id}` },
            {
              label: t.adminOrders.cancelOrder,
              icon: <XCircle className="w-4 h-4" />,
              destructive: true,
              separatorBefore: true,
              onClick: () => setCancelTarget(o),
              disabled: o.status === 'cancelled' || o.status === 'delivered' || !hasPermission('orders', 'edit'),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Switcher between Orders and Product Requests */}
      <div className="flex items-center gap-2 border-b border-ragab-ink-100 pb-3">
        <Link
          href="/control-center/orders"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-ragab-brand-500 text-white shadow-sm flex items-center gap-1.5"
        >
          <span>{ar ? 'طلبات الشراء' : 'Customer Orders'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/20 text-white font-mono">{total}</span>
        </Link>
        <Link
          href="/control-center/prescriptions"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors inline-flex items-center gap-1.5"
        >
          <FileText className="w-4 h-4 text-ragab-brand-600" />
          <span>{ar ? 'طلبات الروشتات' : 'Prescription Requests'}</span>
        </Link>
        <Link
          href="/control-center/product-requests"
          className="px-4 py-2 rounded-xl text-body-sm font-bold bg-white hover:bg-ragab-ink-50 text-ragab-ink-700 border border-ragab-ink-200 transition-colors inline-flex items-center gap-1.5"
        >
          <BellRing className="w-4 h-4 text-ragab-brand-600" />
          <span>{ar ? 'طلبات التوفير' : 'Stock Requests'}</span>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminOrders.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5" data-testid="orders-total">
            {t.adminOrders.subtitle} · {total} {t.adminOrders.resultsCount}
          </p>
        </div>
        <Can resource="orders" action="export">
          <Button variant="outline" leftIcon={<Download className="w-4 h-4" />} onClick={onExport} isLoading={exporting} disabled={loading || total === 0}>
            {t.adminOrders.export}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminOrders.search} startIcon={<Search className="w-4 h-4" />} />
        <Select options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" />
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          <DataTable
            columns={columns}
            rows={rows}
            keyField={(o) => o.id}
            mobileTitle={(o) => (
              <div className="flex items-center gap-2">
                <Link href={`/control-center/orders/${o.id}`} className="text-ragab-ink-800" dir="ltr">
                  {o.orderNumber}
                </Link>
                {o.manual && <Badge variant="neutral" size="sm">{t.adminOrders.manualBadge}</Badge>}
                {o.hasPrescriptionItems && (
                  <span className="inline-flex items-center rounded px-1 py-0.2 text-[9px] font-black bg-amber-600 text-white">
                    Rx
                  </span>
                )}
              </div>
            )}
          />
          <CursorPager
            className="mt-3"
            page={page}
            pageCount={pageCount}
            hasMore={hasMore}
            disabled={loading}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={onCancel}
        title={t.adminOrders.cancelConfirmTitle}
        description={t.adminOrders.cancelConfirmDesc}
        confirmLabel={t.adminOrders.cancelOrder}
        destructive
        isLoading={busy}
      />
    </div>
  );
}

export default function OrdersAdminPage() {
  return (
    <RequirePermission resource="orders" action="view">
      <OrdersAdminInner />
    </RequirePermission>
  );
}
