'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Loader2, Printer, XCircle } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import { getOrderById } from '../../../../../services/orderService';
import { api } from '../../../../../lib/apiClient';
import { Order } from '../../../../../types';
import { Button } from '../../../../../components/ui/Button';
import { EmptyState } from '../../../../../components/ui/EmptyState';

interface PublicConfig {
  store: { nameAr: string; nameEn: string; phone: string; whatsapp: string };
}

/**
 * A real, printable invoice for an order — the "download invoice" button used to be a
 * toast. Rendered from the order's immutable snapshot; the browser's print dialog gives
 * the customer a PDF (Save as PDF) on every platform without a PDF library.
 */
export default function InvoicePage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { t, isRTL } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [o, cfg] = await Promise.all([getOrderById(id), api.get<PublicConfig>('/app/config').catch(() => null)]);
        if (!alive) return;
        setOrder(o);
        setConfig(cfg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy>
        <Loader2 className="w-7 h-7 animate-spin text-ragab-ink-400" />
      </div>
    );
  }
  if (!order) {
    return (
      <EmptyState icon={<XCircle className="w-8 h-8 text-ragab-danger" />} title={t.account.orderNotFound} description={t.account.noOrdersDesc} actionLabel={t.account.myOrders} actionHref="/account/orders" />
    );
  }

  const paymentLabel = order.paymentMethod === 'cod' ? t.account.paymentCod : order.paymentMethod === 'vodafone_cash' ? t.account.paymentVodafone : t.account.paymentInstapay;
  const storeName = config ? (isRTL ? config.store.nameAr : config.store.nameEn) : 'Ragab';
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || order.paymentStatus === 'partially_refunded';

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-12 font-arabic">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="inline-flex items-center gap-1 text-caption font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
          <ChevronLeft className="w-4 h-4 ltr:rotate-180" />
          {t.account.orderDetails}
        </Link>
        <Button variant="primary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
          {t.account.printInvoice}
        </Button>
      </div>

      <article className="bg-white rounded-2xl border border-ragab-ink-200 p-6 sm:p-8 shadow-subtle print:shadow-none print:border-0 print:rounded-none">
        <header className="flex items-start justify-between gap-4 border-b border-ragab-ink-100 pb-4">
          <div>
            <h1 className="text-h1 text-ragab-ink-800">{t.account.invoiceTitle}</h1>
            <p className="text-body-sm text-ragab-ink-500 mt-1" dir="ltr">{order.orderNumber}</p>
            <p className="text-caption text-ragab-ink-500">{order.createdAt}</p>
          </div>
          <div className="text-end">
            <p className="text-body font-extrabold text-ragab-ink-800">{storeName}</p>
            {config?.store.phone && <p className="text-caption text-ragab-ink-500" dir="ltr">{config.store.phone}</p>}
          </div>
        </header>

        <section className="grid sm:grid-cols-2 gap-4 py-4 border-b border-ragab-ink-100 text-body-sm">
          <div>
            <p className="text-caption font-bold text-ragab-ink-500 mb-1">{t.account.deliveryAddress}</p>
            <p className="font-semibold text-ragab-ink-800">{order.deliveryAddress.recipientName}</p>
            <p className="text-ragab-ink-600" dir="ltr">{order.deliveryAddress.phone}</p>
            <p className="text-ragab-ink-600">{order.deliveryAddress.village} — {order.deliveryAddress.streetAddress}</p>
          </div>
          <div>
            <p className="text-caption font-bold text-ragab-ink-500 mb-1">{t.account.paymentMethod}</p>
            <p className="font-semibold text-ragab-ink-800">{paymentLabel}</p>
            <p className="text-ragab-ink-600">{paid ? t.adminPayments.statusPaid : t.adminPayments.statusPending}</p>
          </div>
        </section>

        <table className="w-full text-body-sm mt-4">
          <thead>
            <tr className="text-caption text-ragab-ink-500 border-b border-ragab-ink-100">
              <th className="text-start py-2 font-bold">{t.account.orderDetails}</th>
              <th className="text-center py-2 font-bold">{t.adminOrders.colItems}</th>
              <th className="text-end py-2 font-bold">{t.account.total}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-b border-ragab-ink-100/70">
                <td className="py-2">
                  <p className="font-semibold text-ragab-ink-800">{it.productNameAr}</p>
                  <p className="text-caption text-ragab-ink-500">{it.unit} · {it.price} {t.common.egp}</p>
                </td>
                <td className="py-2 text-center">{it.quantity}</td>
                <td className="py-2 text-end font-bold">{it.total} {t.common.egp}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1.5 text-body-sm max-w-xs ms-auto">
          <div className="flex justify-between"><dt className="text-ragab-ink-500">{t.account.subtotal}</dt><dd className="font-semibold">{order.subtotal} {t.common.egp}</dd></div>
          <div className="flex justify-between"><dt className="text-ragab-ink-500">{t.account.deliveryFee}</dt><dd className="font-semibold">{order.deliveryFee} {t.common.egp}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-ragab-success"><dt>{t.account.discount}</dt><dd className="font-semibold">-{order.discount} {t.common.egp}</dd></div>}
          <div className="flex justify-between pt-2 border-t border-ragab-ink-100"><dt className="font-bold text-ragab-ink-800">{t.account.total}</dt><dd className="text-price text-ragab-ink-800">{order.total} {t.common.egp}</dd></div>
          {order.refunded && <div className="flex justify-between text-ragab-danger"><dt className="font-bold">{t.account.refundedAmount}</dt><dd className="font-bold">-{order.total} {t.common.egp}</dd></div>}
        </dl>

        <footer className="mt-6 pt-4 border-t border-ragab-ink-100 text-caption text-ragab-ink-500">{t.account.invoiceFooter}</footer>
      </article>

      <style jsx global>{`
        @media print {
          header, nav, footer.site-footer, [data-print-hide] { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
