'use client';

import React, { useEffect, useState } from 'react';
import { ShoppingCart, Wallet, Users, PackageX, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getAuditLog } from '../../services/auditService';
import { AuditLogEntry } from '../../types';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { AUDIT_ACTION_KEY } from '../../lib/audit';

export default function ControlCenterOverview() {
  const { t, language } = useLanguage();
  const { user, role } = useAuth();
  const ar = language === 'ar';
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getAuditLog();
        if (alive) setActivity(data.slice(0, 6));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const roleLabel = role ? (ar ? role.nameAr : role.nameEn) : '';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-ragab-ink-800">
          {t.admin.welcome}
          {user ? `، ${user.name.split(' ')[0]}` : ''} 👋
        </h2>
        {roleLabel && <p className="text-body-sm text-ragab-ink-500 mt-1">{roleLabel}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t.admin.statOrders} value="٤٨" icon={<ShoppingCart className="w-5 h-5" />} tone="info" />
        <StatCard label={t.admin.statRevenue} value={`٩٬٤٢٠ ${t.common.egp}`} icon={<Wallet className="w-5 h-5" />} tone="success" />
        <StatCard label={t.admin.statCustomers} value="١٬٢٣٧" icon={<Users className="w-5 h-5" />} tone="brand" />
        <StatCard label={t.admin.statLowStock} value="١٢" icon={<PackageX className="w-5 h-5" />} tone="warning" />
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader title={t.admin.recentActivity} />
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
      </Card>
    </div>
  );
}
