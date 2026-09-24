'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MoreVertical, Pencil, Trash2, Loader2, Check, MapPin } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { getDeliveryZonesAdmin, saveDeliveryZone, deleteDeliveryZone } from '../../../services/deliveryZoneService';
import { PermissionError } from '../../../lib/rbac';
import { ApiError } from '../../../lib/apiClient';
import { DeliveryZone } from '../../../types';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Can } from '../../../components/auth/Can';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { FormField } from '../../../components/ui/FormField';
import { Checkbox } from '../../../components/ui/Checkbox';
import { DataTable, DataColumn } from '../../../components/ui/DataTable';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';

const blank: DeliveryZone = { id: '', nameAr: '', nameEn: '', deliveryFee: 0, minOrder: 0, estimatedTimeAr: '', estimatedTimeEn: '', isActive: true, sortOrder: 0 };

/**
 * Delivery zones are the pricing source of truth (AC-14): what is edited here is what the
 * cart, the quote and checkout charge on the very next request.
 */
function DeliveryZonesInner() {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<DeliveryZone>(blank);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeliveryZone | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await getDeliveryZonesAdmin()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((z) => z.nameAr.toLowerCase().includes(q) || z.nameEn.toLowerCase().includes(q));
  }, [items, query]);

  const canEdit = hasPermission('settings', 'edit');
  const openAdd = () => { setForm({ ...blank, sortOrder: items.length }); setNameError(''); setDrawerOpen(true); };
  const openEdit = (z: DeliveryZone) => { setForm(z); setNameError(''); setDrawerOpen(true); };
  const set = (patch: Partial<DeliveryZone>) => setForm((f) => ({ ...f, ...patch }));
  const money = (v: number) => (v === 0 ? t.adminZones.free : `${v} ${t.common.egp}`);

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const message = e instanceof PermissionError ? t.states.forbiddenTitle : e instanceof ApiError ? (ar ? e.bilingual.ar : e.bilingual.en) : t.states.error;
      showToast(message, 'error');
    }
  };

  const onSave = async () => {
    if (!form.nameAr.trim() || !form.nameEn.trim()) { setNameError(t.adminZones.nameRequired); return; }
    setSaving(true);
    await guard(async () => {
      await saveDeliveryZone(form);
      await load();
      showToast(t.adminZones.saved, 'success');
      setDrawerOpen(false);
    });
    setSaving(false);
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setBusy(true);
    guard(async () => {
      await deleteDeliveryZone(deleteTarget.id);
      await load();
      showToast(t.adminZones.deleted, 'success');
    }).finally(() => { setBusy(false); setDeleteTarget(null); });
  };

  const statusPill = (z: DeliveryZone) => (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', z.isActive === false ? 'bg-ragab-ink-100 text-ragab-ink-500' : 'bg-ragab-success-soft text-ragab-success')}>
      {z.isActive === false ? t.adminZones.inactive : t.adminZones.active}
    </span>
  );

  const columns: DataColumn<DeliveryZone>[] = [
    { key: 'name', header: t.adminZones.colName, hideOnMobile: true, cell: (z) => <button onClick={() => openEdit(z)} className="font-bold text-ragab-ink-800 hover:text-ragab-brand-700 text-start">{ar ? z.nameAr : z.nameEn}</button> },
    { key: 'fee', header: t.adminZones.colFee, cell: (z) => <span className="font-bold tabular-nums">{money(z.deliveryFee)}</span> },
    { key: 'minOrder', header: t.adminZones.colMinOrder, hideOnMobile: true, cell: (z) => <span className="tabular-nums">{z.minOrder > 0 ? `${z.minOrder} ${t.common.egp}` : '—'}</span> },
    { key: 'eta', header: t.adminZones.colEta, hideOnMobile: true, cell: (z) => (ar ? z.estimatedTimeAr : z.estimatedTimeEn) || '—' },
    { key: 'status', header: t.adminZones.colStatus, cell: statusPill },
    {
      key: 'actions', header: t.admin.actions, align: 'end',
      cell: (z) => (
        <DropdownMenu
          trigger={<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-ragab-ink-500 hover:bg-ragab-ink-100"><MoreVertical className="w-4 h-4" /></span>}
          items={[
            { label: t.admin.edit, icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(z), disabled: !canEdit },
            { label: t.admin.delete, icon: <Trash2 className="w-4 h-4" />, destructive: true, separatorBefore: true, onClick: () => setDeleteTarget(z), disabled: !canEdit },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-h2 text-ragab-ink-800">{t.adminZones.title}</h2>
          <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.adminZones.subtitle} · {filtered.length} {t.adminZones.resultsCount}</p>
        </div>
        <Can resource="settings" action="edit">
          <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t.adminZones.newZone}</Button>
        </Can>
      </div>

      <div className="max-w-sm">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.adminZones.search} startIcon={<Search className="w-4 h-4" />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ragab-ink-400" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<MapPin className="w-8 h-8 text-ragab-brand-700" />} title={t.adminZones.empty} description={t.adminZones.subtitle} />
      ) : (
        <DataTable columns={columns} rows={filtered} keyField={(z) => z.id} mobileTitle={(z) => <button onClick={() => openEdit(z)} className="text-ragab-ink-800 text-start">{ar ? z.nameAr : z.nameEn}</button>} />
      )}

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={form.id ? t.adminZones.editZone : t.adminZones.createZone}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminZones.nameAr} error={nameError || undefined} required><Input value={form.nameAr} onChange={(e) => set({ nameAr: e.target.value })} invalid={!!nameError} /></FormField>
            <FormField label={t.adminZones.nameEn} required><Input dir="ltr" value={form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} invalid={!!nameError} /></FormField>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminZones.fee} required><Input type="number" inputMode="decimal" min={0} step="0.5" dir="ltr" value={String(form.deliveryFee)} onChange={(e) => set({ deliveryFee: Number(e.target.value) })} /></FormField>
            <FormField label={t.adminZones.minOrder}><Input type="number" inputMode="decimal" min={0} step="1" dir="ltr" value={String(form.minOrder)} onChange={(e) => set({ minOrder: Number(e.target.value) })} /></FormField>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.adminZones.etaAr}><Input value={form.estimatedTimeAr} onChange={(e) => set({ estimatedTimeAr: e.target.value })} placeholder="30 - 45 دقيقة" /></FormField>
            <FormField label={t.adminZones.etaEn}><Input dir="ltr" value={form.estimatedTimeEn} onChange={(e) => set({ estimatedTimeEn: e.target.value })} placeholder="30 - 45 min" /></FormField>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 items-end">
            <FormField label={t.adminZones.sortOrder}><Input type="number" inputMode="numeric" min={0} step="1" dir="ltr" value={String(form.sortOrder ?? 0)} onChange={(e) => set({ sortOrder: Number(e.target.value) })} /></FormField>
            <Checkbox checked={form.isActive !== false} onChange={(v) => set({ isActive: v })} label={t.adminZones.activeToggle} size="sm" />
          </div>
          <div className="flex items-center gap-2.5 pt-2">
            <Button variant="primary" fullWidth onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>{t.common.saveChanges}</Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>{t.common.cancel}</Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={onDelete} title={t.adminZones.deleteTitle} description={t.adminZones.deleteDesc} confirmLabel={t.admin.delete} destructive isLoading={busy} />
    </div>
  );
}

export default function DeliveryZonesAdminPage() {
  return (
    <RequirePermission resource="settings" action="view">
      <DeliveryZonesInner />
    </RequirePermission>
  );
}
