'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Package, Tag, UserCircle, ShieldAlert, Megaphone, CheckCheck } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../../context/LanguageContext';
import { getNotifications, markAsRead, markAllAsRead } from '../../../services/notificationService';
import { AppNotification, NotificationCategory } from '../../../types';
import { Tabs } from '../../../components/ui/Tabs';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';

const CAT_META: Record<NotificationCategory, { icon: React.ElementType; tone: string; rail: string }> = {
  order: { icon: Package, tone: 'bg-ragab-info-soft text-ragab-info', rail: 'bg-ragab-info' },
  promo: { icon: Tag, tone: 'bg-ragab-brand-100 text-ragab-brand-700', rail: 'bg-ragab-brand-500' },
  account: { icon: UserCircle, tone: 'bg-ragab-ink-100 text-ragab-ink-600', rail: 'bg-ragab-ink-400' },
  security: { icon: ShieldAlert, tone: 'bg-ragab-danger-soft text-ragab-danger', rail: 'bg-ragab-danger' },
  general: { icon: Megaphone, tone: 'bg-ragab-warning-soft text-ragab-warning', rail: 'bg-ragab-warning' },
};

export default function NotificationsPage() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getNotifications();
        if (alive) setItems(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const unreadCount = items.filter((n) => !n.read).length;
  const filtered = useMemo(() => (tab === 'unread' ? items.filter((n) => !n.read) : items), [items, tab]);

  const catLabel = (c: NotificationCategory) =>
    ({ order: t.notifications.catOrder, promo: t.notifications.catPromo, account: t.notifications.catAccount, security: t.notifications.catSecurity, general: t.notifications.catGeneral }[c]);

  const onRead = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await markAsRead(n.id);
  };

  const onReadAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    await markAllAsRead();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 text-ragab-ink-800">{t.notifications.title}</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" leftIcon={<CheckCheck className="w-4 h-4" />} onClick={onReadAll}>
            {t.notifications.markAllAsRead}
          </Button>
        )}
      </div>

      <Tabs
        variant="segmented"
        value={tab}
        onChange={(v) => setTab(v as 'all' | 'unread')}
        items={[
          { value: 'all', label: t.notifications.all },
          { value: 'unread', label: t.notifications.unread, badge: unreadCount },
        ]}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-8 h-8 text-ragab-brand-700" />}
          title={t.notifications.emptyTitle}
          description={t.notifications.emptyDesc}
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((n) => {
            const meta = CAT_META[n.category];
            const Icon = meta.icon;
            const title = ar ? n.titleAr : n.titleEn;
            const body = ar ? n.bodyAr : n.bodyEn;
            const inner = (
              <div
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border p-3.5 pe-4 transition-colors overflow-hidden',
                  n.read
                    ? 'bg-ragab-surface border-ragab-ink-200'
                    : 'bg-ragab-cream-soft border-ragab-brand-200'
                )}
              >
                {/* unread rail (non-color cue paired with dot + weight) */}
                {!n.read && <span className={cn('absolute inset-y-0 start-0 w-1', meta.rail)} />}
                <span className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', meta.tone)}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn('text-body-sm text-ragab-ink-800', n.read ? 'font-medium' : 'font-extrabold')}>
                      {title}
                    </p>
                    {!n.read && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ragab-brand-700 bg-ragab-brand-100 rounded-full px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-ragab-brand-500" />
                        {t.notifications.newLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-ragab-ink-500 mt-0.5">{body}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-semibold text-ragab-ink-400">{catLabel(n.category)}</span>
                    <span className="text-[11px] text-ragab-ink-300">· {n.createdAt}</span>
                  </div>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} onClick={() => onRead(n)} className="block focus-ring rounded-xl">
                    {inner}
                  </Link>
                ) : (
                  <button onClick={() => onRead(n)} className="block w-full text-start focus-ring rounded-xl">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
