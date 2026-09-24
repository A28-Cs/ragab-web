'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Pencil, ShieldCheck, ChevronLeft, Check } from 'lucide-react';
import { validateEgyptianPhone } from '@ragab/validation';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { updateProfile } from '../../../services/accountService';
import { Card, CardHeader } from '../../../components/ui/Card';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Language } from '../../../types';

interface FormState {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  preferredLanguage: Language;
  defaultVillage: string;
}

export default function ProfilePage() {
  const { t, language } = useLanguage();
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial: FormState = {
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    dateOfBirth: user?.dateOfBirth ?? '',
    preferredLanguage: user?.preferredLanguage ?? language,
    defaultVillage: user?.defaultVillage ?? '',
  };

  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  if (!user) return null;

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 3) e.name = t.auth.nameTooShort;
    if (!validateEgyptianPhone(form.phone)) e.phone = t.auth.invalidPhone;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t.auth.invalidEmail;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const updated = await updateProfile(user, {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        preferredLanguage: form.preferredLanguage,
        defaultVillage: form.defaultVillage.trim(),
      });
      updateUser(updated);
      showToast(t.account.profileSaved, 'success');
      setEditing(false);
    } catch {
      showToast(t.states.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    setForm(initial);
    setErrors({});
    setEditing(false);
  };

  const langOptions = [
    { value: 'ar', label: 'العربية' },
    { value: 'en', label: 'English' },
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 text-ragab-ink-800">{t.account.profile}</h1>
        {!editing && (
          <Button variant="outline" size="sm" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>
            {t.account.editProfile}
          </Button>
        )}
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader title={t.account.profileInfo} subtitle={t.account.profileInfoDesc} />

        {/* Avatar row */}
        <div className="flex items-center gap-4 pb-5 mb-5 border-b border-ragab-ink-100">
          <Avatar name={user.name} src={user.avatar} size="xl" />
          <div>
            <p className="text-body font-bold text-ragab-ink-800">{user.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusPill tone="success">{t.account.statusActive}</StatusPill>
              {user.emailVerified ? (
                <StatusPill tone="info" dot={false}>
                  {t.account.statusVerified}
                </StatusPill>
              ) : (
                <StatusPill tone="warning" dot={false}>
                  {t.account.statusUnverified}
                </StatusPill>
              )}
            </div>
            {editing && (
              <button className="text-caption font-semibold text-ragab-brand-700 hover:underline mt-2">
                {t.account.changeAvatar}
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label={t.account.fullName} htmlFor="name" error={editing ? errors.name : undefined} required>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={!editing}
              invalid={!!errors.name}
            />
          </FormField>

          <FormField label={t.account.phone} htmlFor="phone" error={editing ? errors.phone : undefined} required>
            <Input
              id="phone"
              type="tel"
              dir="ltr"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={!editing}
              invalid={!!errors.phone}
            />
          </FormField>

          <FormField label={t.account.email} htmlFor="email" error={editing ? errors.email : undefined}>
            <Input
              id="email"
              type="email"
              dir="ltr"
              placeholder={t.auth.emailPlaceholder}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              disabled={!editing}
              invalid={!!errors.email}
            />
          </FormField>

          <FormField label={t.account.dateOfBirth} htmlFor="dob">
            <Input
              id="dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              disabled={!editing}
            />
          </FormField>

          <FormField label={t.account.preferredLanguage} htmlFor="lang">
            <Select
              id="lang"
              options={langOptions}
              value={form.preferredLanguage}
              onChange={(e) => set('preferredLanguage', e.target.value)}
              disabled={!editing}
            />
          </FormField>

          <FormField label={t.account.deliveryPrefs} htmlFor="village">
            <Input
              id="village"
              value={form.defaultVillage}
              onChange={(e) => set('defaultVillage', e.target.value)}
              disabled={!editing}
            />
          </FormField>
        </div>

        {editing && (
          <div className="flex items-center gap-2.5 mt-6 pt-5 border-t border-ragab-ink-100">
            <Button variant="primary" onClick={onSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>
              {t.common.saveChanges}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              {t.common.cancel}
            </Button>
          </div>
        )}
      </Card>

      {/* Security Information — kept separate */}
      <Card>
        <CardHeader title={t.account.securityInfo} subtitle={t.account.securityInfoDesc} />
        <Link
          href="/account/security"
          className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3.5 hover:bg-ragab-ink-50 transition-colors"
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-ragab-warning-soft text-ragab-warning shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-bold text-ragab-ink-800">{t.security.title}</p>
            <p className="text-caption text-ragab-ink-500">{t.security.subtitle}</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-ragab-ink-300 shrink-0 ltr:rotate-180" />
        </Link>
      </Card>
    </div>
  );
}
