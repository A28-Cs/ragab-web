'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Smartphone,
  Tablet,
  Monitor,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@ragab/utils';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import {
  getSessions,
  getLoginActivity,
  endSession,
  logoutOtherDevices,
  changePassword,
} from '../../../services/securityService';
import { LoginActivity, Session } from '../../../types';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { PasswordInput } from '../../../components/ui/PasswordInput';
import { PasswordStrengthMeter, PasswordRule } from '../../../components/ui/PasswordStrengthMeter';
import { Switch } from '../../../components/ui/Switch';
import { StatusPill } from '../../../components/ui/StatusPill';
import { Alert } from '../../../components/ui/Alert';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { TwoFactorSetup } from '../../../components/auth/TwoFactorSetup';
import { api as _api } from '../../../lib/apiClient';
import { Skeleton } from '../../../components/ui/Skeleton';

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export default function SecurityPage() {
  const { t } = useLanguage();
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<LoginActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const rules: PasswordRule[] = [
    { label: t.auth.reqLength, test: (p) => p.length >= 8 },
    { label: t.auth.reqUpper, test: (p) => /[A-Z]/.test(p) },
    { label: t.auth.reqNumber, test: (p) => /[0-9]/.test(p) },
    { label: t.auth.reqSymbol, test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([getSessions(), getLoginActivity()]);
      setSessions(s);
      setActivity(a);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onChangePassword = async () => {
    setPwError('');
    if (pw.next.length < 8) return setPwError(t.auth.passwordTooShort);
    if (pw.next !== pw.confirm) return setPwError(t.auth.passwordsMismatch);
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      showToast(t.security.passwordChanged, 'success');
      setPw({ current: '', next: '', confirm: '' });
    } catch {
      setPwError(t.states.error);
    } finally {
      setSavingPw(false);
    }
  };

  const onEndSession = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await endSession(id);
  };

  const onLogoutOthers = async () => {
    setLoggingOut(true);
    try {
      await logoutOtherDevices();
      setSessions((prev) => prev.filter((s) => s.current));
      showToast(t.security.loggedOutOthers, 'success');
      setLogoutOthersOpen(false);
    } finally {
      setLoggingOut(false);
    }
  };

  const [twoFAOpen, setTwoFAOpen] = useState(false);
  const [disable2FAOpen, setDisable2FAOpen] = useState(false);

  const toggle2FA = (on: boolean) => {
    if (on) setTwoFAOpen(true);
    else setDisable2FAOpen(true);
  };

  const onDisable2FA = async (reauth?: string) => {
    try {
      await _api.post('/auth/2fa/disable', { password: reauth ?? '' });
      updateUser({ twoFactorEnabled: false });
      showToast(t.security.twoFactorDisabled, 'success');
    } catch (e) {
      showToast((e as { bilingual?: { ar: string } }).bilingual?.ar ?? t.states.error, 'error');
    } finally {
      setDisable2FAOpen(false);
    }
  };

  const otherSessions = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-h1 text-ragab-ink-800 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-ragab-success" />
          {t.security.title}
        </h1>
        <p className="text-body-sm text-ragab-ink-500 mt-1">{t.security.subtitle}</p>
      </div>

      <Alert kind="success" icon={<ShieldCheck className="w-5 h-5" />}>
        {t.security.reassure}
      </Alert>

      {/* Change password */}
      <Card>
        <CardHeader title={t.security.changePassword} />
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label={t.security.currentPassword} htmlFor="cur" className="sm:col-span-2 sm:max-w-sm">
            <PasswordInput id="cur" value={pw.current} onChange={(e) => setPw((s) => ({ ...s, current: e.target.value }))} autoComplete="current-password" />
          </FormField>
          <FormField label={t.security.newPassword} htmlFor="new">
            <PasswordInput id="new" value={pw.next} onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))} autoComplete="new-password" />
          </FormField>
          <FormField label={t.security.confirmNewPassword} htmlFor="conf" error={pwError || undefined}>
            <PasswordInput id="conf" value={pw.confirm} onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))} invalid={!!pwError} autoComplete="new-password" />
          </FormField>
        </div>
        {pw.next.length > 0 && (
          <div className="mt-3 max-w-md">
            <PasswordStrengthMeter
              value={pw.next}
              rules={rules}
              title={t.auth.passwordStrength}
              strengthLabels={[t.auth.strengthWeak, t.auth.strengthFair, t.auth.strengthGood, t.auth.strengthStrong]}
            />
          </div>
        )}
        <div className="mt-5">
          <Button variant="primary" leftIcon={<KeyRound className="w-4 h-4" />} onClick={onChangePassword} isLoading={savingPw}>
            {t.security.changePassword}
          </Button>
        </div>
      </Card>

      {/* Two-factor */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-h3 text-ragab-ink-800">{t.security.twoFactor}</h3>
            <p className="text-body-sm text-ragab-ink-500 mt-0.5">{t.security.twoFactorDesc}</p>
          </div>
          <Switch checked={!!user?.twoFactorEnabled} onChange={toggle2FA} label={t.security.twoFactor} />
        </div>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader
          title={t.security.activeSessions}
          subtitle={t.security.activeSessionsDesc}
          action={
            otherSessions > 0 ? (
              <Button variant="outline" size="sm" leftIcon={<LogOut className="w-4 h-4" />} onClick={() => setLogoutOthersOpen(true)}>
                {t.security.logoutOtherDevices}
              </Button>
            ) : undefined
          }
        />
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {sessions.map((s) => {
              const Icon = DEVICE_ICON[s.deviceType];
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3">
                  <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-ragab-ink-100 text-ragab-ink-600 shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-body-sm font-bold text-ragab-ink-800 truncate">{s.device}</p>
                      {s.current && (
                        <StatusPill tone="success" dot={false}>
                          {t.security.currentSession}
                        </StatusPill>
                      )}
                    </div>
                    <p className="text-caption text-ragab-ink-500">
                      {s.browser} · {s.approxLocation}
                    </p>
                    <p className="text-[11px] text-ragab-ink-400 mt-0.5">
                      {t.security.lastActive}: {s.lastActive}
                    </p>
                  </div>
                  {!s.current && (
                    <button
                      onClick={() => onEndSession(s.id)}
                      className="text-caption font-semibold text-ragab-danger hover:underline shrink-0"
                    >
                      {t.security.logoutSession}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Login activity */}
      <Card>
        <CardHeader title={t.security.loginActivity} subtitle={t.security.loginActivityDesc} />
        {loading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <ul className="divide-y divide-ragab-ink-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full shrink-0',
                    a.result === 'success' ? 'bg-ragab-success-soft text-ragab-success' : 'bg-ragab-danger-soft text-ragab-danger'
                  )}
                >
                  {a.result === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm text-ragab-ink-700 truncate">
                    {a.device} · {a.browser}
                  </p>
                  <p className="text-caption text-ragab-ink-400">
                    {a.approxLocation} · {a.timestamp}
                  </p>
                </div>
                <span className="text-caption font-semibold shrink-0">
                  {a.result === 'success' ? (
                    <span className="text-ragab-success">{t.security.resultSuccess}</span>
                  ) : (
                    <span className="text-ragab-danger">{t.security.resultFailed}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Account recovery */}
      <Card>
        <CardHeader title={t.security.accountRecovery} subtitle={t.security.accountRecoveryDesc} />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3">
            <Mail className="w-5 h-5 text-ragab-info shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-caption text-ragab-ink-500">{t.account.email}</p>
              <p className="text-body-sm font-semibold text-ragab-ink-800 truncate" dir="ltr">
                {user?.email ?? '—'}
              </p>
            </div>
            <Link href="/account/profile" className="text-caption font-semibold text-ragab-brand-700 hover:underline shrink-0">
              {t.common.edit}
            </Link>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-ragab-ink-100 p-3">
            <Phone className="w-5 h-5 text-ragab-success shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-caption text-ragab-ink-500">{t.account.phone}</p>
              <p className="text-body-sm font-semibold text-ragab-ink-800 truncate" dir="ltr">
                {user?.phone}
              </p>
            </div>
            <Link href="/account/profile" className="text-caption font-semibold text-ragab-brand-700 hover:underline shrink-0">
              {t.common.edit}
            </Link>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={logoutOthersOpen}
        onClose={() => setLogoutOthersOpen(false)}
        onConfirm={onLogoutOthers}
        title={t.security.logoutOthersConfirmTitle}
        description={t.security.logoutOthersConfirmDesc}
        confirmLabel={t.security.logoutOtherDevices}
        isLoading={loggingOut}
      />

      <TwoFactorSetup isOpen={twoFAOpen} onClose={() => setTwoFAOpen(false)} onEnabled={() => updateUser({ twoFactorEnabled: true })} />

      <ConfirmDialog
        isOpen={disable2FAOpen}
        onClose={() => setDisable2FAOpen(false)}
        onConfirm={onDisable2FA}
        title={t.security.twoFactor}
        description={t.security.twoFactorDesc}
        confirmLabel={t.common.confirm}
        destructive
        requireReauth
        reauthNote={t.admin.reauthNote}
      />
    </div>
  );
}
