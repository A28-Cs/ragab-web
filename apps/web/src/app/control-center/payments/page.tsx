'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Undo2, Wallet, RotateCcw, CheckCircle2, PiggyBank } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getPayments } from '../../../services/paymentService';
import { getPaymentsSummary } from '../../../services/reportService';
import { issueRefund } from '../../../services/refundService';
import { confirmPayment } from '../../../services/financeService';
import { PermissionError } from '../../../lib/rbac';
import { CollectedTotals, PaymentStatus, PaymentTransaction } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { StatusPill, StatusTone } from '../../../components/ui/StatusPill';
import { StatCard } from '../../../components/ui/StatCard';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

const TONE: Record<PaymentStatus, StatusTone> = { paid: 'success', pending: 'warning', refunded: 'info', failed: 'danger', cancelled: 'neutral' };

function PaymentsInner() {
  const { t } = useLanguage();
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();

  const [items, setItems] = useState<PaymentTransaction[]>([]);
  const [summary, setSummary] = useState<CollectedTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | PaymentStatus>('all');
  const [refundTarget, setRefundTarget] = useState<PaymentTransaction | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PaymentTransaction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // The stat cards are server-computed over ALL payments (amount vs refunded), not
      // derived from the page of rows below — so net can never go negative.
      const [rows, totals] = await Promise.all([getPayments(), getPaymentsSummary()]);
      setItems(rows);
      setSummary(totals);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (q && !p.orderNumber.toLowerCase().includes(q) && !p.customerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, status]);

  const totalRevenue = summary?.gross ?? 0;
  const totalRefunded = summary?.refunded ?? 0;
  const netRevenue = summary?.net ?? 0;

  const statusLabel = (s: PaymentStatus) => ({ paid: t.adminPayments.statusPaid, pending: t.adminPayments.statusPending, refunded: t.adminPayments.statusRefunded, failed: t.adminPayments.statusFailed, cancelled: t.adminPayments.statusCancelled }[s]);
  const methodLabel = (m: PaymentTransaction['method']) => (m === 'cod' ? t.account.paymentCod : m === 'vodafone_cash' ? t.account.paymentVodafone : t.account.paymentInstapay);

  const onRefund = (reauth?: string) => {
    if (!refundTarget) return;
    setBusy(true);
    (async () => {
      try {
        const res = await issueRefund(refundTarget.orderId ?? refundTarget.orderNumber, permissions, reauth);
        // A refund also cancels the linked order — log both together as one event.
        record(
          res.orderUpdated ? 'order_cancelled_refunded' : 'refund_issued',
          res.orderUpdated ? 'orders' : 'payments',
          refundTarget.orderNumber,
          { metadata: { amount: String(refundTarget.amount) } }
        );
        await load();
        showToast(res.orderUpdated ? t.adminPayments.refundedLinked : t.adminPayments.refunded, 'success');
      } catch (e) {
        showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
      } finally {
        setBusy(false);
        setRefundTarget(null);
      }
    })();
  };

  const onConfirm = () => {
    if (!confirmTarget) return;
    setBusy(true);
    (async () => {
      try {
        const res = await confirmPayment(confirmTarget.orderId ?? confirmTarget.orderNumber, permissions);
        record('payment_confirmed', 'payments', confirmTarget.orderNumber, { metadata: { amount: String(res.amount) } });
        if (res.invoiceNumber) {
          record('invoice_sent', 'payments', res.invoiceNumber, { metadata: { order: confirmTarget.orderNumber } });
        }
        await load();
        showToast(res.invoiceNumber ? t.adminPayments.invoiceSent : t.adminPayments.confirmed, 'success');
      } catch (e) {
        showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
      } finally {
        setBusy(false);
        setConfirmTarget(null);
      }
    })();
  };

  const statusOptions = [
    { value: 'all', label: t.adminPayments.filterAll },
    { value: 'paid', label: t.adminPayments.statusPaid },
    { value: 'pending', label: t.adminPayments.statusPending },
    { value: 'refunded', label: t.adminPayments.statusRefunded },
    { value: 'failed', label: t.adminPayments.statusFailed },
    { value: 'cancelled', label: t.adminPayments.statusCancelled },
  ];

  const columns: DataColumn<PaymentTransaction>[] = [
    { key: 'order', header: t.adminPayments.colOrder, hideOnMobile: true, cell: (p) => <span className="font-bold text-ragab-ink-800" dir="ltr">{p.orderNumber}</span> },
    { key: 'customer', header: t.adminPayments.colCustomer, cell: (p) => p.customerName },
    { key: 'method', header: t.adminPayments.colMethod, cell: (p) => methodLabel(p.method), hideOnMobile: true },
    {
      key: 'amount',
      header: t.adminPayments.colAmount,
      cell: (p) =>
        p.status === 'refunded' ? (
          <span className="inline-flex items-center gap-1 font-bold text-ragab-danger" title={t.adminPayments.refundedAmount}>
            <Undo2 className="w-3.5 h-3.5" />
            <span dir="ltr">-{p.amount}</span> {t.common.egp}
          </span>
        ) : (
          <span className="font-bold text-ragab-ink-800">{p.amount} {t.common.egp}</span>
        ),
    },
    { key: 'status', header: t.adminPayments.colStatus, cell: (p) => <StatusPill tone={TONE[p.status]}>{statusLabel(p.status)}</StatusPill> },
    { key: 'date', header: t.adminPayments.colDate, cell: (p) => <span dir="ltr" className="text-ragab-ink-500">{p.date}</span>, hideOnMobile: true },
    {
      key: 'actions', header: '', align: 'end',
      cell: (p) => {
        if (!hasPermission('payments', 'approve')) return null;
        if (p.status === 'paid') {
          return <Button variant="outline" size="sm" leftIcon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => setRefundTarget(p)}>{t.adminPayments.refund}</Button>;
        }
        // A manual transfer can only be confirmed while its order is still live — a
        // cancelled order has nothing to pay for (the server rejects it too).
        if (p.status === 'pending' && p.orderStatus !== 'cancelled') {
          return <Button variant="secondary" size="sm" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => setConfirmTarget(p)}>{t.adminPayments.confirmPayment}</Button>;
        }
        return null;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">{t.adminPayments.title}</h2>
        <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminPayments.subtitle} · {filtered.length} {t.adminPayments.resultsCount}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label={t.adminPayments.totalRevenue} value={`${totalRevenue} ${t.common.egp}`} icon={<Wallet className="w-5 h-5" />} tone="success" />
        <StatCard label={t.adminPayments.refundedTotal} value={`${totalRefunded} ${t.common.egp}`} icon={<RotateCcw className="w-5 h-5" />} tone="danger" />
        <StatCard label={t.adminPayments.netRevenue} value={`${netRevenue} ${t.common.egp}`} icon={<PiggyBank className="w-5 h-5" />} tone="info" className="col-span-2 sm:col-span-1" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminPayments.search} startIcon={<Search className="w-4 h-4" />} />
        <Select options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : (
        <DataTable columns={columns} rows={filtered} keyField={(p) => p.id}
          mobileTitle={(p) => <span className="text-ragab-ink-800" dir="ltr">{p.orderNumber}</span>}
          mobileMeta={(p) => <StatusPill tone={TONE[p.status]}>{statusLabel(p.status)}</StatusPill>}
        />
      )}

      <ConfirmDialog isOpen={!!refundTarget} onClose={() => setRefundTarget(null)} onConfirm={onRefund} title={t.adminPayments.refundTitle} description={t.adminPayments.refundDesc} confirmLabel={t.adminPayments.refund} requireReauth reauthNote={t.admin.reauthNote} isLoading={busy} />
      <ConfirmDialog isOpen={!!confirmTarget} onClose={() => setConfirmTarget(null)} onConfirm={onConfirm} title={t.adminPayments.confirmTitle} description={t.adminPayments.confirmDesc} confirmLabel={t.adminPayments.confirmPayment} isLoading={busy} />
    </div>
  );
}

export default function PaymentsAdminPage() {
  return (
    <RequirePermission resource="payments" action="view">
      <PaymentsInner />
    </RequirePermission>
  );
}
