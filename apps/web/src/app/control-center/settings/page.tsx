'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Check, Store, Truck, CreditCard, Wrench } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { useAudit } from '../../../lib/useAudit';
import { getSettings, saveSettings } from '../../../services/settingsService';
import { PermissionError } from '../../../lib/rbac';
import { StoreSettings } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Card, CardHeader } from '../../../components/ui/Card';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';

function SettingsInner() {
  const { t } = useLanguage();
  const { permissions, hasPermission } = useAuth();
  const { showToast } = useToast();
  const record = useAudit();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = hasPermission('settings', 'edit');

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSettings();
      if (alive) { setSettings(s); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const set = (patch: Partial<StoreSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const onSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveSettings(settings, permissions);
      record('settings_changed', 'settings', t.adminSettings.title);
      showToast(t.adminSettings.saved, 'success');
    } catch (e) {
      showToast(e instanceof PermissionError ? t.states.forbiddenTitle : t.states.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>;
  }

  const Row: React.FC<{ icon: React.ElementType; title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ icon: Icon, title, desc, checked, onChange }) => (
    <div className="flex items-center gap-3 py-3 border-b border-ragab-ink-100 last:border-0">
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-ragab-ink-100 text-ragab-ink-600 shrink-0"><Icon className="w-4 h-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-ragab-ink-800">{title}</p>
        {desc && <p className="text-caption text-ragab-ink-500">{desc}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={!canEdit} label={title} />
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminSettings.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminSettings.subtitle}</p>
        </div>
        {canEdit && <Button variant="primary" onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.adminSettings.save}</Button>}
      </div>

      {/* Store info */}
      <Card>
        <CardHeader title={t.adminSettings.storeInfo} />
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label={t.adminSettings.storeNameAr}><Input value={settings.storeNameAr} onChange={(e) => set({ storeNameAr: e.target.value })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.storeNameEn}><Input dir="ltr" value={settings.storeNameEn} onChange={(e) => set({ storeNameEn: e.target.value })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.phone}><Input dir="ltr" value={settings.phone} onChange={(e) => set({ phone: e.target.value })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.whatsapp}><Input dir="ltr" value={settings.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.address} className="sm:col-span-2"><Textarea value={settings.addressAr} onChange={(e) => set({ addressAr: e.target.value })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.workingHours} className="sm:col-span-2"><Input value={settings.workingHours} onChange={(e) => set({ workingHours: e.target.value })} disabled={!canEdit} /></FormField>
        </div>
      </Card>

      {/* Delivery */}
      <Card>
        <CardHeader title={t.adminSettings.delivery} />
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label={t.adminSettings.deliveryFee}><Input type="number" value={settings.deliveryFee} onChange={(e) => set({ deliveryFee: Number(e.target.value) })} disabled={!canEdit} /></FormField>
          <FormField label={t.adminSettings.freeThreshold}><Input type="number" value={settings.freeDeliveryThreshold} onChange={(e) => set({ freeDeliveryThreshold: Number(e.target.value) })} disabled={!canEdit} /></FormField>
        </div>
      </Card>

      {/* Payments + maintenance toggles */}
      <Card>
        <CardHeader title={t.adminSettings.payments} />
        <Row icon={CreditCard} title={t.adminSettings.codEnabled} checked={settings.codEnabled} onChange={(v) => set({ codEnabled: v })} />
        <Row icon={Truck} title={t.adminSettings.onlinePayments} checked={settings.onlinePaymentsEnabled} onChange={(v) => set({ onlinePaymentsEnabled: v })} />
        <Row icon={Wrench} title={t.adminSettings.maintenance} desc={t.adminSettings.maintenanceDesc} checked={settings.maintenanceMode} onChange={(v) => set({ maintenanceMode: v })} />
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.adminSettings.save}</Button>
        </div>
      )}
    </div>
  );
}

export default function SettingsAdminPage() {
  return (
    <RequirePermission resource="settings" action="view">
      <SettingsInner />
    </RequirePermission>
  );
}
