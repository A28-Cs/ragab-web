'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, ChevronLeft, Package, Undo2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useAuth } from '../../../context/AuthContext';
import { getOrders } from '../../../services/orderService';
import { Order } from '../../../types';
import { Tabs } from '../../../components/ui/Tabs';
import { StatusPill } from '../../../components/ui/StatusPill';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ORDER_STATUS_TONE, OrderFilter, matchesFilter } from '../../../lib/orderStatus';

export default function OrdersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderFilter>('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getOrders({ phone: user?.phone });
        if (alive) setOrders(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.phone]);

  const filtered = useMemo(() => orders.filter((o) => matchesFilter(o.status, filter)), [orders, filter]);

  const tabs = [
    { value: 'all', label: t.account.filterAll },
    { value: 'processing', label: t.account.filterProcessing },
    { value: 'on_the_way', label: t.account.filterOnTheWay },
    { value: 'delivered', label: t.account.filterDelivered },
    { value: 'cancelled', label: t.account.filterCancelled },
  ];

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-h1 text-ragab-ink-800">{t.account.myOrders}</h1>

      <Tabs items={tabs} value={filter} onChange={(v) => setFilter(v as OrderFilter)} variant="segmented" />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="w-8 h-8 text-ragab-brand-700" />}
          title={t.account.noOrdersTitle}
          description={t.account.noOrdersDesc}
          actionLabel={t.cart.startShopping}
          actionHref="/categories"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <Link
              key={o.id}
              href={`/account/orders/${o.id}`}
              className="block bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-ragab-cream text-ragab-brand-700 shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-bold text-ragab-ink-800" dir="ltr">
                      {o.orderNumber}
                    </p>
                    <p className="text-caption text-ragab-ink-500">{o.createdAt}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {o.refunded && (
                    <StatusPill tone="info" dot={false}>
                      <span className="inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />{t.account.refunded}</span>
                    </StatusPill>
                  )}
                  <StatusPill tone={ORDER_STATUS_TONE[o.status]}>{t.account.orderStatus[o.status]}</StatusPill>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-ragab-ink-100">
                <p className="text-caption text-ragab-ink-500">
                  {o.items.length} {t.account.itemsUnit}
                </p>
                <div className="flex items-center gap-2">
                  <div className="text-end">
                    <p className="text-body font-bold text-ragab-ink-800">
                      {o.total} {t.common.egp}
                    </p>
                    {o.refunded && (
                      <p className="text-caption font-bold text-ragab-danger inline-flex items-center gap-1 justify-end" title={t.account.refundedAmount}>
                        <Undo2 className="w-3 h-3" />
                        <span dir="ltr">-{o.total}</span> {t.common.egp}
                      </p>
                    )}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-ragab-ink-300 ltr:rotate-180" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
