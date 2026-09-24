/**
 * Reports — backed by the API. Every number on the Reports and Payments pages comes
 * from the server (`/admin/reports/sales`, `/admin/payments/summary`); the client never
 * re-aggregates order or payment lists, so web and mobile always show the same figures.
 */
import { CollectedTotals, SalesReport } from '../types';
import { api } from '../lib/apiClient';

export type ReportRangeKey = 'all' | '7d' | '30d' | '90d';

const DAYS: Record<ReportRangeKey, number | null> = { all: null, '7d': 7, '30d': 30, '90d': 90 };

export const getSalesReport = async (range: ReportRangeKey = 'all'): Promise<SalesReport> => {
  const days = DAYS[range];
  const from = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
  return api.get<SalesReport>('/admin/reports/sales', { from });
};

export const getPaymentsSummary = async (): Promise<CollectedTotals> => api.get<CollectedTotals>('/admin/payments/summary');

/** Flatten the report into CSV rows (UTF-8 BOM so Excel opens Arabic correctly). */
export function salesReportToCsv(r: SalesReport, labels: { section: string; item: string; value: string; egp: string }): string {
  const rows: string[][] = [[labels.section, labels.item, labels.value]];
  const push = (section: string, item: string, value: string | number) => rows.push([section, item, String(value)]);
  push('summary', 'salesTotal', `${r.salesTotal} ${labels.egp}`);
  push('summary', 'totalOrders', r.totalOrders);
  push('summary', 'cancelledOrders', r.cancelledOrders);
  push('summary', 'averageOrderValue', `${r.averageOrderValue} ${labels.egp}`);
  push('summary', 'customers', r.customers);
  push('collected', 'gross', `${r.collected.gross} ${labels.egp}`);
  push('collected', 'refunded', `${r.collected.refunded} ${labels.egp}`);
  push('collected', 'net', `${r.collected.net} ${labels.egp}`);
  r.byStatus.forEach((s) => push('byStatus', s.status, s.count));
  r.byCategory.forEach((c) => push('byCategory', c.nameAr, `${c.revenue} ${labels.egp}`));
  r.byMethod.forEach((m) => push('byMethod', m.method, `${m.revenue} ${labels.egp}`));
  r.topProducts.forEach((p) => push('topProducts', p.nameAr, p.quantity));
  const escape = (c: string) => `"${c.replace(/"/g, '""')}"`;
  return `﻿${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`;
}

/** Trigger a browser download of a text file. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
