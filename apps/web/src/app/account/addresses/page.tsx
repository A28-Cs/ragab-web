'use client';

import React, { useEffect, useState } from 'react';
import { Plus, MapPin, Home, Briefcase, Pencil, Trash2, Star, Check } from 'lucide-react';
import { validateEgyptianPhone, validateRecipientName, validateStreetAddress } from '@ragab/validation';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import {
  getAddresses,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
} from '../../../services/addressService';
import { getDeliveryZones } from '../../../services/deliveryZoneService';
import { Address, AddressLabel, DeliveryZone } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { StatusPill } from '../../../components/ui/StatusPill';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';

const LABEL_ICON: Record<AddressLabel, React.ElementType> = {
  home: Home,
  work: Briefcase,
  other: MapPin,
};

const emptyForm: Address = {
  id: '',
  title: '',
  label: 'home',
  recipientName: '',
  phone: '',
  village: '',
  zoneId: '',
  streetAddress: '',
  landmark: '',
  notes: '',
};

export default function AddressesPage() {
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<Address>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof Address, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The zone is the pricing key of an address (AC-14): pick it from the served areas, never free text.
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  useEffect(() => {
    getDeliveryZones().then(setZones).catch(() => setZones([]));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setAddresses(await getAddresses());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setErrors({});
    setDrawerOpen(true);
  };
  const openEdit = (a: Address) => {
    setForm(a);
    setErrors({});
    setDrawerOpen(true);
  };

  const set = (k: keyof Address, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof Address, string>> = {};
    if (form.title.trim().length < 2) e.title = t.auth.fieldRequired;
    if (!validateRecipientName(form.recipientName)) e.recipientName = t.auth.nameTooShort;
    if (!validateEgyptianPhone(form.phone)) e.phone = t.auth.invalidPhone;
    if (!form.zoneId && form.village.trim().length < 2) e.village = t.auth.fieldRequired;
    if (!validateStreetAddress(form.streetAddress)) e.streetAddress = t.auth.fieldRequired;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveAddress(form);
      await load();
      showToast(t.account.addressSaved, 'success');
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const onSetDefault = async (a: Address) => {
    if (a.isDefault) return;
    setAddresses((prev) => prev.map((x) => ({ ...x, isDefault: x.id === a.id })));
    await setDefaultAddress(a.id);
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAddress(deleteTarget.id);
      await load();
      showToast(t.account.addressDeleted, 'success');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const labelText = (l?: AddressLabel) =>
    l === 'home' ? t.account.labelHome : l === 'work' ? t.account.labelWork : t.account.labelOther;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 text-ragab-ink-800">{t.account.addressesTitle}</h1>
        <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>
          {t.account.addAddress}
        </Button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8 text-ragab-success" />}
          title={t.account.noAddressesTitle}
          description={t.account.noAddressesDesc}
          actionLabel={t.account.addAddress}
          onAction={openAdd}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {addresses.map((a) => {
            const Icon = LABEL_ICON[a.label ?? 'other'];
            return (
              <div
                key={a.id}
                className={cn(
                  'bg-ragab-surface rounded-xl border p-4 shadow-subtle flex flex-col',
                  a.isDefault ? 'border-ragab-brand-300 ring-1 ring-ragab-brand-200' : 'border-ragab-ink-200'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-ragab-cream text-ragab-brand-700 shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-ragab-ink-800 truncate">{a.title}</p>
                      <p className="text-caption text-ragab-ink-500">{labelText(a.label)}</p>
                    </div>
                  </div>
                  {a.isDefault && (
                    <StatusPill tone="success" dot={false}>
                      {t.account.defaultAddress}
                    </StatusPill>
                  )}
                </div>

                <div className="text-body-sm text-ragab-ink-600 space-y-0.5 flex-1">
                  <p className="font-semibold text-ragab-ink-700">{a.recipientName}</p>
                  <p dir="ltr" className="text-start">
                    {a.phone}
                  </p>
                  <p>
                    {a.village} — {a.streetAddress}
                  </p>
                  {a.landmark && <p className="text-caption text-ragab-ink-400">{a.landmark}</p>}
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-ragab-ink-100">
                  {!a.isDefault && (
                    <button
                      onClick={() => onSetDefault(a)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-caption font-semibold text-ragab-ink-600 hover:bg-ragab-ink-100 transition-colors touch-target"
                    >
                      <Star className="w-4 h-4" />
                      {t.account.setDefault}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(a)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-caption font-semibold text-ragab-ink-600 hover:bg-ragab-ink-100 transition-colors ms-auto touch-target"
                  >
                    <Pencil className="w-4 h-4" />
                    {t.common.edit}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(a)}
                    aria-label={t.account.deleteAddress}
                    className="flex items-center justify-center rounded-lg w-9 h-9 text-ragab-danger hover:bg-ragab-danger-soft transition-colors touch-target"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit form */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={form.id ? t.account.editAddress : t.account.addAddress}>
        <div className="space-y-4">
          <FormField label={t.account.addressLabel}>
            <div className="grid grid-cols-3 gap-2">
              {(['home', 'work', 'other'] as AddressLabel[]).map((l) => {
                const Icon = LABEL_ICON[l];
                const active = form.label === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, label: l }))}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors',
                      active
                        ? 'bg-ragab-cream border-ragab-brand-300 text-ragab-ink-800'
                        : 'bg-white border-ragab-ink-200 text-ragab-ink-500'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-caption font-semibold">{labelText(l)}</span>
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField label={t.account.addressTitle} htmlFor="a-title" error={errors.title} required>
            <Input id="a-title" value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} />
          </FormField>

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <FormField label={t.account.recipientName} htmlFor="a-recipient" error={errors.recipientName} required>
              <Input
                id="a-recipient"
                value={form.recipientName}
                onChange={(e) => set('recipientName', e.target.value)}
                invalid={!!errors.recipientName}
              />
            </FormField>
            <FormField label={t.account.phone} htmlFor="a-phone" error={errors.phone} required>
              <Input
                id="a-phone"
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                invalid={!!errors.phone}
              />
            </FormField>
          </div>

          <FormField label={t.account.village} htmlFor="a-village" error={errors.village} required>
            <select
              id="a-village"
              value={form.zoneId ?? ''}
              onChange={(e) => {
                const zone = zones.find((z) => z.id === e.target.value);
                setForm((f) => ({ ...f, zoneId: e.target.value, village: zone?.nameAr ?? f.village }));
              }}
              aria-invalid={!!errors.village}
              className={cn('w-full h-11 rounded-lg border bg-white px-3 text-body-sm text-ragab-ink-800 focus-ring', errors.village ? 'border-ragab-danger' : 'border-ragab-ink-200')}
            >
              {/* A legacy free-text village shows as the placeholder until a zone is picked. */}
              <option value="">{form.village && !form.zoneId ? form.village : t.checkout.selectVillage}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {isRTL ? z.nameAr : z.nameEn} — {z.deliveryFee === 0 ? t.cart.free : `${z.deliveryFee} ${t.common.egp}`}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t.account.streetAddress} htmlFor="a-street" error={errors.streetAddress} required>
            <Textarea
              id="a-street"
              value={form.streetAddress}
              onChange={(e) => set('streetAddress', e.target.value)}
              invalid={!!errors.streetAddress}
            />
          </FormField>

          <FormField label={t.account.landmark} htmlFor="a-landmark">
            <Input id="a-landmark" value={form.landmark ?? ''} onChange={(e) => set('landmark', e.target.value)} />
          </FormField>

          <FormField label={t.account.addrNotes} htmlFor="a-notes">
            <Textarea id="a-notes" rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </FormField>

          <div className="flex items-center gap-2.5 pt-2">
            <Button variant="primary" fullWidth onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>
              {t.common.saveChanges}
            </Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title={t.account.deleteAddressConfirmTitle}
        description={t.account.deleteAddressConfirmDesc}
        confirmLabel={t.account.deleteAddress}
        destructive
        isLoading={deleting}
      />
    </div>
  );
}
