'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Wallet, ShoppingCart, Receipt, Users, Download, Undo2, PiggyBank, RefreshCw } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { getSalesReport, salesReportToCsv, downloadTextFile, type ReportRangeKey } from '../../../services/reportService';
import { SalesReport } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { StatCard } from '../../../components/ui/StatCard';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ORDER_STATUS_TONE } from '../../../lib/orderStatus';

const BAR_TONE: Record<string, string> = {
  success: 'bg-ragab-success', warning: 'bg-ragab-warning', info: 'bg-ragab-info', danger: 'bg-ragab-danger', neutral: 'bg-ragab-ink-400',
};

function BarRow({ label, value, max, tone = 'brand', suffix }: { label: string; value: number; max: number; tone?: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = BAR_TONE[tone] ?? 'bg-ragab-brand-500';
  return (
    <div className="flex items-center gap-3">
      <span className="text-body-sm text-ragab-ink-700 w-28 sm:w-36 truncate shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-ragab-ink-100 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <span className="text-caption font-bold text-ragab-ink-800 w-16 text-end shrink-0">{value}{suffix}</span>
    </div>
  );
}

/**
 * Every figure here is the server's `SalesReport` — the same object the mobile control
 * center renders — so the two dashboards can never disagree, and cancelled orders are
 * excluded at the query, not in the browser.
 */
function ReportsInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { showToast } = useToast();
  const [range, setRange] = useState<ReportRangeKey>('all');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const r = await getSalesReport(range);
        if (alive) setReport(r);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [range, reloadKey]);

  const methodLabel = (m: string) =>
    m === 'cod' ? t.account.paymentCod : m === 'vodafone_cash' ? t.account.paymentVodafone : m === 'instapay' ? t.account.paymentInstapay : m;
  const statusLabel = (s: SalesReport['byStatus'][number]['status']) => t.account.orderStatus[s] ?? s;

  const rangeOptions = [
    { value: 'all', label: t.adminReports.rangeAll },
    { value: '7d', label: t.adminReports.range7 },
    { value: '30d', label: t.adminReports.range30 },
    { value: '90d', label: t.adminReports.range90 },
  ];

  const onExport = () => {
    if (!report) return;
    const csv = salesReportToCsv(report, { section: 'section', item: 'item', value: 'value', egp: t.common.egp });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`ragab-sales-${range}-${stamp}.csv`, csv);
    showToast(t.adminReports.exported, 'success');
  };

  if (loading && !report) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>;
  }
  if (failed || !report) {
    return (
      <EmptyState
        icon={<RefreshCw className="w-8 h-8 text-ragab-danger" />}
        title={t.states.error}
        description={t.adminReports.subtitle}
        actionLabel={t.states.retry}
        onAction={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  const statusMax = Math.max(1, ...report.byStatus.map((s) => s.count));
  const catMax = Math.max(1, ...report.byCategory.map((c) => c.revenue));
  const topMax = Math.max(1, ...report.topProducts.map((p) => p.quantity));
  const methodMax = Math.max(1, ...report.byMethod.map((m) => m.revenue));

  return (
    <div className={cn('space-y-4', loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminReports.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminReports.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Select options={rangeOptions} value={range} onChange={(e) => setRange(e.target.value as ReportRangeKey)} />
          </div>
          <Can resource="reports" action="export">
            <Button variant="outline" leftIcon={<Download className="w-4 h-4" />} onClick={onExport}>{t.adminReports.export}</Button>
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t.adminReports.salesTotal} value={`${report.salesTotal} ${t.common.egp}`} icon={<Wallet className="w-5 h-5" />} tone="success" />
        <StatCard label={t.adminReports.totalOrders} value={report.totalOrders} icon={<ShoppingCart className="w-5 h-5" />} tone="info" />
        <StatCard label={t.adminReports.avgOrder} value={`${report.averageOrderValue} ${t.common.egp}`} icon={<Receipt className="w-5 h-5" />} tone="brand" />
        <StatCard label={t.adminReports.totalCustomers} value={report.customers} icon={<Users className="w-5 h-5" />} tone="warning" />
      </div>

      <Card>
        <CardHeader title={t.adminReports.paymentsReport} />
        <dl className="space-y-2 text-body-sm max-w-md">
          <div className="flex justify-between">
            <dt className="inline-flex items-center gap-1.5 text-ragab-ink-600"><Wallet className="w-4 h-4 text-ragab-ink-400" />{t.adminReports.paidTotal}</dt>
            <dd className="font-bold text-ragab-ink-800">{report.collected.gross} {t.common.egp}</dd>
          </div>
          <div className="flex justify-between text-ragab-danger">
            <dt className="inline-flex items-center gap-1.5 font-semibold"><Undo2 className="w-4 h-4" />{t.adminReports.refundedTotal}</dt>
            <dd className="font-bold"><span dir="ltr">-{report.collected.refunded}</span> {t.common.egp}</dd>
          </div>
          <div className="flex justify-between pt-2 mt-1 border-t border-ragab-ink-100">
            <dt className="inline-flex items-center gap-1.5 font-bold text-ragab-ink-800"><PiggyBank className="w-4 h-4 text-ragab-success" />{t.adminReports.netRevenue}</dt>
            <dd className="text-price text-ragab-success">{report.collected.net} {t.common.egp}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title={t.adminReports.ordersByStatus} />
          <div className="space-y-3">
            {report.byStatus.map((s) => (
              <BarRow key={s.status} label={statusLabel(s.status)} value={s.count} max={statusMax} tone={ORDER_STATUS_TONE[s.status] ?? 'neutral'} suffix={` ${t.adminReports.order}`} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t.adminReports.salesByCategory} />
          <div className="space-y-3">
            {report.byCategory.length === 0 && <p className="text-body-sm text-ragab-ink-500">{t.adminReports.noData}</p>}
            {report.byCategory.map((c) => (
              <BarRow key={c.categoryId || c.nameEn} label={ar ? c.nameAr : c.nameEn} value={c.revenue} max={catMax} tone="info" suffix={` ${t.common.egp}`} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t.adminReports.revenueByMethod} />
          <div className="space-y-3">
            {report.byMethod.length === 0 && <p className="text-body-sm text-ragab-ink-500">{t.adminReports.noData}</p>}
            {report.byMethod.map((m) => (
              <BarRow key={m.method} label={methodLabel(m.method)} value={m.revenue} max={methodMax} tone="brand" suffix={` ${t.common.egp}`} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t.adminReports.topProducts} />
          <div className="space-y-3">
            {report.topProducts.length === 0 && <p className="text-body-sm text-ragab-ink-500">{t.adminReports.noData}</p>}
            {report.topProducts.map((p) => (
              <BarRow key={p.productId || p.nameAr} label={p.nameAr} value={p.quantity} max={topMax} tone="success" suffix={` ${t.adminInventory.units}`} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ReportsAdminPage() {
  return (
    <RequirePermission resource="reports" action="view">
      <ReportsInner />
    </RequirePermission>
  );
}
