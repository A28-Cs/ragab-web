'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, ArrowLeft, AlertCircle } from 'lucide-react';
import { validateEgyptianPhone, validateRecipientName } from '@ragab/validation';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../components/ui/Toast';
import { AuthShell } from '../../components/auth/AuthShell';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrengthMeter, PasswordRule } from '../../components/ui/PasswordStrengthMeter';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

// Apple sign-in needs the Apple provider configured in Firebase Auth first.
const APPLE_SIGNIN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';

interface Form {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithProvider } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [form, setForm] = useState<Form>({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [agree, setAgree] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleProviderLogin = async (provider: 'google' | 'apple') => {
    setLoading(true);
    setDuplicate(false);
    try {
      if (await loginWithProvider(provider)) router.push('/account');
    } catch (err: any) {
      const msg = err.bilingual?.ar ?? err.message ?? 'تعذر التسجيل باستخدام ' + provider;
      showToast(msg, 'error');
      console.error('Provider Login Error:', err);
    } finally {
      setLoading(false);
    }
  };
  const rules: PasswordRule[] = [
    { label: t.auth.reqLength, test: (p) => p.length >= 8 },
    { label: t.auth.reqUpper, test: (p) => /[A-Z]/.test(p) },
    { label: t.auth.reqNumber, test: (p) => /[0-9]/.test(p) },
    { label: t.auth.reqSymbol, test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!validateRecipientName(form.name)) e.name = t.auth.nameTooShort;
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t.auth.invalidEmail || 'البريد الإلكتروني مطلوب وصالح';
    if (!validateEgyptianPhone(form.phone)) e.phone = t.auth.invalidPhone;
    if (form.password.length < 8) e.password = t.auth.passwordTooShort;
    if (form.confirm !== form.password) e.confirm = t.auth.passwordsMismatch;
    setErrors(e);
    setAgreeError(!agree);
    return Object.keys(e).length === 0 && agree;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicate(false);
    if (!validate()) return;
    setLoading(true);
    try {
      await register({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), password: form.password });
      showToast(t.auth.registerSuccess || 'تم إنشاء الحساب، يرجى تفعيل بريدك الإلكتروني.', 'success');
      router.push(`/verify?type=email&to=${encodeURIComponent(form.email.trim())}`);
    } catch (err: any) {
      const code = err.code || err.message;
      if (code === 'PHONE_ALREADY_REGISTERED' || (err.message && err.message.includes('PHONE'))) setDuplicate(true);
      else showToast('تعذر إنشاء الحساب', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      {duplicate && (
        <Alert kind="warning" className="mb-4" icon={<AlertCircle className="w-5 h-5" />} title={t.auth.duplicateAccount}>
          <Link href="/login" className="font-bold text-ragab-ink-800 underline">
            {t.auth.duplicateAccountAction}
          </Link>
        </Alert>
      )}

      {/* Social */}
      <div className="space-y-3 mb-5">
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={() => handleProviderLogin('google')}
          leftIcon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 12s4.1 9.6 9.2 9.6c5.3 0 8.8-3.7 8.8-9 0-.6-.06-1-.15-1.4H12z" />
            </svg>
          }
        >
          {t.auth.continueWithGoogle}
        </Button>

        {APPLE_SIGNIN_ENABLED && (
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => handleProviderLogin('apple')}
            leftIcon={
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.09 2.31-.86 3.63-.72 1.62.15 2.94.81 3.79 2.05-3.02 1.76-2.52 5.81.45 6.94-1.01 2.39-2.07 3.01-2.95 3.9M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
              </svg>
            }
          >
            المتابعة عبر آبل
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="flex-1 h-px bg-ragab-ink-200" />
        <span className="text-caption text-ragab-ink-400">{t.auth.orContinueWith}</span>
        <span className="flex-1 h-px bg-ragab-ink-200" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label={t.auth.fullName} htmlFor="r-name" error={errors.name} required>
          <Input id="r-name" value={form.name} onChange={(e) => set('name', e.target.value)} startIcon={<User className="w-4 h-4" />} invalid={!!errors.name} />
        </FormField>

        <FormField label={t.auth.email} htmlFor="r-email" error={errors.email}>
          <Input id="r-email" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={t.auth.emailPlaceholder} startIcon={<Mail className="w-4 h-4" />} invalid={!!errors.email} />
        </FormField>

        <FormField label={t.auth.phoneNumber} htmlFor="r-phone" error={errors.phone} required>
          <Input id="r-phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t.auth.phonePlaceholder} startIcon={<Phone className="w-4 h-4" />} invalid={!!errors.phone} />
        </FormField>

        <FormField label={t.auth.password} htmlFor="r-password" error={errors.password} required>
          <PasswordInput id="r-password" value={form.password} onChange={(e) => set('password', e.target.value)} showLabel={t.auth.showPassword} hideLabel={t.auth.hidePassword} invalid={!!errors.password} autoComplete="new-password" />
        </FormField>

        {form.password.length > 0 && (
          <PasswordStrengthMeter
            value={form.password}
            rules={rules}
            title={t.auth.passwordStrength}
            strengthLabels={[t.auth.strengthWeak, t.auth.strengthFair, t.auth.strengthGood, t.auth.strengthStrong]}
          />
        )}

        <FormField label={t.auth.confirmPassword} htmlFor="r-confirm" error={errors.confirm} required>
          <PasswordInput id="r-confirm" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} showLabel={t.auth.showPassword} hideLabel={t.auth.hidePassword} invalid={!!errors.confirm} autoComplete="new-password" />
        </FormField>

        <div>
          <Checkbox
            checked={agree}
            onChange={(v) => {
              setAgree(v);
              if (v) setAgreeError(false);
            }}
            size="sm"
            label={
              <span>
                {t.auth.agreeToTermsPrefix}{' '}
                <Link href="/terms" className="font-bold text-ragab-brand-700 hover:underline">
                  {t.auth.termsLink}
                </Link>{' '}
                {t.auth.and}{' '}
                <Link href="/privacy" className="font-bold text-ragab-brand-700 hover:underline">
                  {t.auth.privacyLink}
                </Link>
              </span>
            }
          />
          {agreeError && <p className="text-caption text-ragab-danger mt-1">{t.auth.mustAgree}</p>}
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading} rightIcon={<ArrowLeft className="w-4 h-4 ltr:rotate-180" />}>
          {t.auth.registerCTA}
        </Button>
      </form>

      <p className="text-center text-body-sm text-ragab-ink-500 mt-6">
        {t.auth.hasAccount}{' '}
        <Link href="/login" className="font-bold text-ragab-brand-700 hover:underline">
          {t.auth.loginCTA}
        </Link>
      </p>
    </AuthShell>
  );
}
