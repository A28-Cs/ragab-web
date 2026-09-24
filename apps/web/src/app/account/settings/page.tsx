'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon,
  Mail,
  Phone,
  Languages,
  Bell,
  KeyRound,
  ShieldCheck,
  MonitorSmartphone,
  Database,
  Megaphone,
  LifeBuoy,
  Headset,
  LogOut,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { apiRequest, ApiError } from '../../../lib/apiClient';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';

type RowProps = {
  icon: React.ElementType;
  label: string;
  value?: string;
  href?: string;
  control?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
};

const SettingRow: React.FC<RowProps> = ({ icon: Icon, label, value, href, control, danger, onClick }) => {
  const body = (
    <div className={cn('flex items-center gap-3 px-1 py-3', (href || onClick) && 'hover:bg-ragab-ink-50 rounded-lg px-3 -mx-2 transition-colors')}>
      <span
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
          danger ? 'bg-ragab-danger-soft text-ragab-danger' : 'bg-ragab-ink-100 text-ragab-ink-600'
        )}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className={cn('text-body-sm font-semibold flex-1 min-w-0', danger ? 'text-ragab-danger' : 'text-ragab-ink-800')}>
        {label}
      </span>
      {value && <span className="text-caption text-ragab-ink-500 truncate max-w-[45%]" dir="auto">{value}</span>}
      {control}
      {(href || onClick) && !control && <ChevronLeft className="w-4 h-4 text-ragab-ink-300 ltr:rotate-180 shrink-0" />}
    </div>
  );
  if (href) return <Link href={href} className="block focus-ring rounded-lg">{body}</Link>;
  if (onClick) return <button onClick={onClick} className="block w-full text-start focus-ring rounded-lg">{body}</button>;
  return body;
};

export default function SettingsPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [marketing, setMarketing] = useState(true);
  const [dataConsent, setDataConsent] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDelete = async (reauth?: string, code?: string) => {
    setDeleting(true);
    try {
      await apiRequest('/auth/account', {
        method: 'DELETE',
        body: { reauthPassword: reauth ?? '', ...(code?.trim() ? { code: code.trim() } : {}) },
      });
      setDeleteOpen(false);
      showToast(t.settings.deleteSuccess, 'success');
      // The server already revoked every session and cleared the cookies; this only
      // resets local auth state (the API call inside logout may fail — that's fine).
      await logout().catch(() => {});
      router.push('/');
    } catch (e) {
      showToast(e instanceof ApiError ? e.bilingual[language] : t.states.error, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-h1 text-ragab-ink-800">{t.settings.title}</h1>

      {/* Account */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupAccount} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow icon={UserIcon} label={t.settings.profile} value={user?.name} href="/account/profile" />
          <SettingRow icon={Mail} label={t.settings.email} value={user?.email ?? '—'} href="/account/profile" />
          <SettingRow icon={Phone} label={t.settings.phone} value={user?.phone} href="/account/profile" />
        </div>
      </Card>

      {/* Preferences */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupPreferences} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow
            icon={Languages}
            label={t.settings.language}
            control={
              <div className="inline-flex rounded-lg bg-ragab-ink-100 p-0.5">
                {(['ar', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={cn(
                      'px-3 h-8 rounded-md text-caption font-bold transition-colors',
                      language === l ? 'bg-white text-ragab-ink-800 shadow-subtle' : 'text-ragab-ink-500'
                    )}
                  >
                    {l === 'ar' ? 'عربي' : 'EN'}
                  </button>
                ))}
              </div>
            }
          />
          <SettingRow icon={Bell} label={t.settings.notificationsPref} href="/account/notifications" />
        </div>
      </Card>

      {/* Security */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupSecurity} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow icon={KeyRound} label={t.settings.password} href="/account/security" />
          <SettingRow icon={ShieldCheck} label={t.settings.twoFactor} value={user?.twoFactorEnabled ? t.settings.on : t.settings.off} href="/account/security" />
          <SettingRow icon={MonitorSmartphone} label={t.settings.sessions} href="/account/security" />
        </div>
      </Card>

      {/* Privacy */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupPrivacy} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow
            icon={Database}
            label={t.settings.dataPreferences}
            control={<Switch checked={dataConsent} onChange={setDataConsent} label={t.settings.dataPreferences} />}
          />
          <SettingRow
            icon={Megaphone}
            label={t.settings.marketingPreferences}
            control={<Switch checked={marketing} onChange={setMarketing} label={t.settings.marketingPreferences} />}
          />
        </div>
      </Card>

      {/* Support */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupSupport} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow icon={LifeBuoy} label={t.settings.helpCenter} href="/contact" />
          <SettingRow icon={Headset} label={t.settings.contactSupport} href="/contact" />
        </div>
      </Card>

      {/* Account management */}
      <Card padded={false} className="p-4">
        <CardHeader title={t.settings.groupManagement} />
        <div className="divide-y divide-ragab-ink-100">
          <SettingRow icon={LogOut} label={t.settings.logout} onClick={() => { logout(); router.push('/'); }} />
          <SettingRow icon={Trash2} label={t.settings.deleteAccount} danger onClick={() => setDeleteOpen(true)} />
        </div>
      </Card>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        title={t.settings.deleteConfirmTitle}
        description={t.settings.deleteConfirmDesc}
        confirmLabel={t.settings.deleteConfirmCta}
        destructive
        requireReauth
        reauthNote={t.settings.deleteConfirmDesc}
        requireCode={!!user?.twoFactorEnabled}
        codeLabel={t.settings.deleteTwoFactorCode}
        isLoading={deleting}
      />
    </div>
  );
}
