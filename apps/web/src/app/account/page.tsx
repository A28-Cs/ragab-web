'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  MapPin,
  Heart,
  ShieldCheck,
  Bell,
  ChevronLeft,
  Package,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getOrders } from '../../services/orderService';
import { getAddresses } from '../../services/addressService';
import { getUnreadCount } from '../../services/notificationService';
import { Address, Order } from '../../types';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Skeleton } from '../../components/ui/Skeleton';
import { ORDER_STATUS_TONE } from '../../lib/orderStatus';

export default function AccountOverviewPage() {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [o, a, u] = await Promise.all([getOrders({ phone: user?.phone }), getAddresses(), getUnreadCount()]);
        if (!alive) return;
        setOrders(o);
        setAddresses(a);
        setUnread(u);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.phone]);

  const quickActions = [
    { href: '/account/orders', label: t.account.myOrders, icon: ShoppingBag, tone: 'bg-ragab-info-soft text-ragab-info' },
    { href: '/account/addresses', label: t.account.myAddresses, icon: MapPin, tone: 'bg-ragab-success-soft text-ragab-success' },
    { href: '/favorites', label: t.account.favorites, icon: Heart, tone: 'bg-ragab-danger-soft text-ragab-danger' },
    { href: '/account/security', label: t.account.security, icon: ShieldCheck, tone: 'bg-ragab-warning-soft text-ragab-warning' },
  ];

  const Chevron = isRTL ? ChevronLeft : ChevronLeft;
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting */}
      <div>
        <h1 className="text-h1 text-ragab-ink-800">
          {t.account.greeting} {user?.name.split(' ')[0]} 👋
        </h1>
        <p className="text-body-sm text-ragab-ink-500 mt-1">{t.account.title}</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map((qa) => (
          <Link
            key={qa.href}
            href={qa.href}
            className="bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4 flex flex-col items-center gap-2 text-center transition-shadow hover:shadow-card-hover"
          >
            <span className={`flex items-center justify-center w-11 h-11 rounded-xl ${qa.tone}`}>
              <qa.icon className="w-5 h-5" />
            </span>
            <span className="text-body-sm font-semibold text-ragab-ink-800">{qa.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent orders */}
        <Card>
          <CardHeader
            title={t.account.recentOrders}
            action={
              <Link href="/account/orders" className="text-caption font-semibold text-ragab-brand-700 hover:underline">
                {t.account.viewAll}
              </Link>
            }
          />
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center text-center py-6 text-ragab-ink-500">
              <Package className="w-8 h-8 mb-2 text-ragab-ink-300" />
              <p className="text-body-sm">{t.account.noOrdersTitle}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {orders.slice(0, 3).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/account/orders/${o.id}`}
                    className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3 hover:bg-ragab-ink-50 transition-colors"
                  >
                    <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-ragab-cream text-ragab-brand-700 shrink-0">
                      <ShoppingBag className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-bold text-ragab-ink-800" dir="ltr">
                        {o.orderNumber}
                      </p>
                      <p className="text-caption text-ragab-ink-500">{o.createdAt}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <StatusPill tone={ORDER_STATUS_TONE[o.status]}>{t.account.orderStatus[o.status]}</StatusPill>
                      <p className="text-body-sm font-bold text-ragab-ink-800 mt-1">
                        {o.total} {t.common.egp}
                      </p>
                    </div>
                    <Chevron className="w-4 h-4 text-ragab-ink-300 shrink-0 ltr:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Addresses + notifications snapshot */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t.account.savedAddresses}
              action={
                <Link href="/account/addresses" className="text-caption font-semibold text-ragab-brand-700 hover:underline">
                  {t.account.viewAll}
                </Link>
              }
            />
            {loading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : defaultAddress ? (
              <div className="flex items-start gap-3 rounded-lg border border-ragab-ink-100 p-3">
                <MapPin className="w-5 h-5 text-ragab-success shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-body-sm font-bold text-ragab-ink-800 truncate">{defaultAddress.title}</p>
                    {defaultAddress.isDefault && (
                      <StatusPill tone="success" dot={false}>
                        {t.account.defaultAddress}
                      </StatusPill>
                    )}
                  </div>
                  <p className="text-caption text-ragab-ink-500 truncate">
                    {defaultAddress.village} — {defaultAddress.streetAddress}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-body-sm text-ragab-ink-500 py-2">{t.account.noAddressesDesc}</p>
            )}
          </Card>

          <Link
            href="/account/notifications"
            className="flex items-center gap-3 bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4 transition-shadow hover:shadow-card-hover"
          >
            <span className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-ragab-brand-100 text-ragab-brand-700 shrink-0">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-ragab-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {unread}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-bold text-ragab-ink-800">{t.account.notifications}</p>
              <p className="text-caption text-ragab-ink-500">
                {unread > 0 ? `${unread} ${t.notifications.unread}` : t.notifications.emptyDesc}
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-ragab-ink-300 shrink-0 ltr:rotate-180" />
          </Link>
        </div>
      </div>
    </div>
  );
}
