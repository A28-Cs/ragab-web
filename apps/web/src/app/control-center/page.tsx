'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingCart, Wallet, Users, PackageX, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getAuditLog } from '../../services/auditService';
import { AuditLogEntry } from '../../types';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { getDashboardOverview, type DashboardOverview } from '../../services/reportService';
import { AUDIT_ACTION_KEY } from '../../lib/audit';

export default function ControlCenterOverview() {
  const { t, language } = useLanguage();
  const { user, role, hasPermission } = useAuth();
  const ar = language === 'ar';
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<DashboardOverview | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const canViewAudit = hasPermission('audit', 'view');
  const canViewOrders = hasPermission('orders', 'view');
  const loadStats = useCallback(async () => {
    const version = ++requestVersion.current;
    setStatsLoading(true);
    setStatsError(false);
    try {
      const data = await getDashboardOverview();
      if (mounted.current && version === requestVersion.current) setStats(data);
    } catch {
      if (mounted.current && version === requestVersion.current) { setStats(null); setStatsError(true); }
    } finally {
      if (mounted.current && version === requestVersion.current) setStatsLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    loadStats();
    const onFocus = () => loadStats();
    window.addEventListener('focus', onFocus);
    const stream = canViewOrders ? new EventSource('/api/v1/events/admin-orders') : null;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(loadStats, 300); };
    stream?.addEventListener('open', refresh);
    stream?.addEventListener('order.created', refresh);
    stream?.addEventListener('order.status_updated', refresh);
    return () => { mounted.current = false; ++requestVersion.current; clearTimeout(timer); stream?.close(); window.removeEventListener('focus', onFocus); };
  }, [loadStats, canViewOrders]);
  const number = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (!canViewAudit) return;
        const data = await getAuditLog();
        if (alive) setActivity(data.slice(0, 6));
      } catch {
        if (alive) setActivityError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canViewAudit]);

  const roleLabel = role ? (ar ? role.nameAr : role.nameEn) : '';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">
          {t.admin.welcome}
          {user ? `، ${user.name.split(' ')[0]}` : ''}
        </h2>
        {roleLabel && <p className="text-body-sm text-ragab-ink-500 mt-1">{roleLabel}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 text-caption text-ragab-ink-500">
        <p>{ar ? 'طلبات اليوم بتوقيت القاهرة · صافي التحصيل لكل الفترات' : 'Today in Cairo · All-time net collections'}</p>
        <button onClick={loadStats} disabled={statsLoading} className="focus-ring rounded-lg px-3 py-2 text-ragab-brand-700 font-bold disabled:opacity-50">{ar ? 'تحديث' : 'Refresh'}</button>
      </div>
      {statsError && <p role="alert" className="text-body-sm text-ragab-danger">{ar ? 'تعذر تحميل الإحصاءات. حاول التحديث مرة أخرى.' : 'Unable to load statistics. Please refresh to retry.'}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy={statsLoading} aria-live="polite">
        {statsLoading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />) : <>
          <StatCard label={t.admin.statOrders} value={number(stats?.todayOrders)} hint={!statsError && stats?.todayOrders === null ? (ar ? 'غير متاح لصلاحياتك' : 'Not permitted') : undefined} icon={<ShoppingCart className="w-5 h-5" />} tone="info" />
          <StatCard label={t.admin.statRevenue} value={stats?.revenue == null ? '—' : number(stats.revenue) + ' ' + t.common.egp} hint={ar ? 'المحصّل بعد الاستردادات' : 'Collected, less refunds'} icon={<Wallet className="w-5 h-5" />} tone="success" />
          <StatCard label={t.admin.statCustomers} value={number(stats?.customers)} icon={<Users className="w-5 h-5" />} tone="brand" />
          <StatCard label={t.admin.statLowStock} value={number(stats?.lowStock)} icon={<PackageX className="w-5 h-5" />} tone="warning" />
        </>}
      </div>

      {/* Recent activity */}
      {canViewAudit && <Card>
        <CardHeader title={t.admin.recentActivity} />
        {activityError && <p role="alert" className="text-body-sm text-ragab-danger">{ar ? 'تعذر تحميل آخر الأنشطة' : 'Unable to load recent activity'}</p>}
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-ragab-ink-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
                    a.result === 'success' ? 'bg-ragab-success-soft text-ragab-success' : 'bg-ragab-danger-soft text-ragab-danger'
                  )}
                >
                  {a.result === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-ragab-ink-800">
                    <span className="font-bold">{a.actorName}</span>{' '}
                    <span className="text-ragab-ink-500">{(t.admin as Record<string, string>)[AUDIT_ACTION_KEY[a.action]]}</span>
                    {a.target ? ` — ${a.target}` : ''}
                  </p>
                  <p className="text-caption text-ragab-ink-400">{a.timestamp}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>}
    </div>
  );
}
