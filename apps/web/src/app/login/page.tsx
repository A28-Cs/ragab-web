'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AuthShell } from '../../components/auth/AuthShell';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';

// Apple sign-in needs the Apple provider configured in Firebase Auth first.
const APPLE_SIGNIN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === 'true';

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyTwoFactor } = useAuth();
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const { loginWithProvider, resendEmailVerification } = useAuth();

  // 2FA step: set when the server requires a second factor.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password.trim()) {
      setError(t.auth.fieldRequired);
      return;
    }
    setLoading(true);
    try {
      const res = await login(identifier.trim(), password);
      if (res.requires2FA && res.challenge) {
        setChallenge(res.challenge);
      } else {
        router.push('/account');
      }
    } catch (err: any) {
      const bilingualMessage = err.bilingual?.ar ?? 'تعذر تسجيل الدخول';
      
      // Handle unverified email specifically
      if (err.code === 'ACCOUNT_UNVERIFIED' || (err.message && err.message.includes('ACCOUNT_UNVERIFIED'))) {
        setError('البريد الإلكتروني غير مؤكد. يرجى تأكيده لتسجيل الدخول.');
        // We will store the unverified email in a state to allow resending
        setUnverifiedEmail(identifier.trim());
      } else {
        setError(bilingualMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!challenge || !code.trim()) return;
    setLoading(true);
    try {
      await verifyTwoFactor(challenge, code.trim());
      router.push('/account');
    } catch (err) {
      const e = err as { bilingual?: { ar: string; en: string } };
      setError(e.bilingual?.ar ?? 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = async (provider: 'google' | 'apple') => {
    setLoading(true);
    setError('');
    try {
      if (await loginWithProvider(provider)) router.push('/account');
    } catch (err: any) {
      const msg = err.bilingual?.ar ?? err.message ?? 'تعذر تسجيل الدخول باستخدام ' + provider;
      setError(msg);
      console.error('Provider Login Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendSuccess('');
    setError('');
    try {
      await resendEmailVerification(unverifiedEmail);
      setResendSuccess('تم إرسال رابط تأكيد جديد إلى بريدك الإلكتروني.');
    } catch (err) {
      setError('تعذر إرسال الرابط. حاول مرة أخرى.');
    } finally {
      setResendLoading(false);
    }
  };

  // 2FA challenge step.
  if (challenge) {
    return (
      <AuthShell title="التحقق بخطوتين" subtitle="أدخل الرمز من تطبيق المصادقة">
        <form onSubmit={onVerify2FA} className="space-y-4">
          <FormField label="رمز التحقق (6 أرقام)" htmlFor="twofa" error={error || undefined}>
            <Input
              id="twofa"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              invalid={!!error}
            />
          </FormField>
          <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading}>
            تأكيد
          </Button>
          <button type="button" onClick={() => { setChallenge(null); setCode(''); setError(''); }} className="w-full text-caption text-ragab-ink-500 hover:underline">
            الرجوع
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.auth.welcomeBack} subtitle={t.auth.loginSubtitle}>
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
        <FormField label={t.auth.emailOrPhone} htmlFor="identifier" error={error || undefined}>
          <Input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t.auth.phonePlaceholder}
            startIcon={<User className="w-4 h-4" />}
            invalid={!!error}
            autoComplete="username"
            dir="ltr"
          />
        </FormField>

        <FormField label={t.auth.password} htmlFor="password">
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.auth.passwordPlaceholder}
            showLabel={t.auth.showPassword}
            hideLabel={t.auth.hidePassword}
            autoComplete="current-password"
          />
        </FormField>

        <div className="flex items-center justify-between gap-2">
          <Checkbox checked={remember} onChange={setRemember} label={t.auth.rememberMe} size="sm" />
          <Link href="/forgot-password" className="text-caption font-semibold text-ragab-brand-700 hover:underline">
            {t.auth.forgotPassword}
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={loading} rightIcon={<ArrowLeft className="w-4 h-4 ltr:rotate-180" />}>
          {t.auth.loginCTA}
        </Button>
      </form>

      {unverifiedEmail && (
        <div className="mt-4 p-4 rounded-xl bg-ragab-danger-soft text-center">
          <p className="text-caption text-ragab-danger mb-2">البريد الإلكتروني غير مؤكد. يرجى مراجعة صندوق الوارد.</p>
          <Button variant="outline" size="sm" onClick={handleResend} isLoading={resendLoading}>
            إعادة إرسال الرابط
          </Button>
          {resendSuccess && <p className="text-caption text-ragab-success mt-2">{resendSuccess}</p>}
        </div>
      )}

      <p className="text-center text-body-sm text-ragab-ink-500 mt-6">
        {t.auth.noAccount}{' '}
        <Link href="/register" className="font-bold text-ragab-brand-700 hover:underline">
          {t.auth.createOne}
        </Link>
      </p>
    </AuthShell>
  );
}
