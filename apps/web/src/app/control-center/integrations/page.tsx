'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, CreditCard, Truck, BarChart3, MessageSquare, CheckCircle2 } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { getIntegrations, toggleIntegration } from '../../../services/integrationService';
import { PermissionError } from '../../../lib/rbac';
import { Integration } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Switch } from '../../../components/ui/Switch';
import { StatusPill } from '../../../components/ui/StatusPill';

const CAT_ICON = { payment: CreditCard, delivery: Truck, analytics: BarChart3, messaging: MessageSquare };

function IntegrationsInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setItems(await getIntegrations()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const canEdit = hasPermission('integrations', 'edit');

  const onToggle = async (i: Integration, enabled: boolean) => {
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, enabled } : x)));
    try {
      await toggleIntegration(i.id, enabled, permissions);
      showToast(t.adminIntegrations.toggled, 'success');
    } catch (e) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, enabled: !enabled } : x)));
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    }
  };

  const catLabel = (c: Integration['category']) => ({ payment: t.adminIntegrations.catPayment, delivery: t.adminIntegrations.catDelivery, analytics: t.adminIntegrations.catAnalytics, messaging: t.adminIntegrations.catMessaging }[c]);

  return (
    <RequirePermission resource="integrations" action="view">
      <div className="space-y-4">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminIntegrations.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminIntegrations.subtitle}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map((i) => {
              const Icon = CAT_ICON[i.category];
              return (
                <div key={i.id} className="bg-ragab-surface rounded-xl border border-ragab-ink-200 shadow-subtle p-4">
                  <div className="flex items-start gap-3">
                    <span className={cn('flex items-center justify-center w-11 h-11 rounded-xl shrink-0', i.enabled ? 'bg-ragab-brand-100 text-ragab-brand-700' : 'bg-ragab-ink-100 text-ragab-ink-500')}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-body-sm font-bold text-ragab-ink-800">{ar ? i.nameAr : i.nameEn}</p>
                        {i.connected && (
                          <StatusPill tone="success" dot={false}>
                            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t.adminIntegrations.connected}</span>
                          </StatusPill>
                        )}
                      </div>
                      <p className="text-caption text-ragab-ink-500 mt-0.5">{ar ? i.descriptionAr : i.descriptionEn}</p>
                      <p className="text-[11px] font-semibold text-ragab-ink-400 mt-1.5">{catLabel(i.category)}</p>
                    </div>
                    <Switch checked={i.enabled} onChange={(v) => onToggle(i, v)} disabled={!canEdit} label={ar ? i.nameAr : i.nameEn} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

export default function IntegrationsAdminPage() {
  return <IntegrationsInner />;
}
