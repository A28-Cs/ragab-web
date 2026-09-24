'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AtSign, ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { AuthShell } from '../../components/auth/AuthShell';
import { Stepper } from '../../components/ui/Stepper';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrengthMeter, PasswordRule } from '../../components/ui/PasswordStrengthMeter';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

const CORRECT_CODE = '123456';
const RESEND_SECONDS = 45;
const MAX_ATTEMPTS = 3;

function maskDestination(v: string): string {
  const s = v.trim();
  if (s.includes('@')) {
    const [name, domain] = s.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  if (s.length >= 4) return `${s.slice(0, 3)}••••${s.slice(-2)}`;
  return s;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [destination, setDestination] = useState('');
  const [destError, setDestError] = useState('');

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [expired, setExpired] = useState(false);

  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [loading, setLoading] = useState(false);

  const rules: PasswordRule[] = [
    { label: t.auth.reqLength, test: (p) => p.length >= 8 },
    { label: t.auth.reqUpper, test: (p) => /[A-Z]/.test(p) },
    { label: t.auth.reqNumber, test: (p) => /[0-9]/.test(p) },
    { label: t.auth.reqSymbol, test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  // resend countdown on the code step
  useEffect(() => {
    if (step !== 1 || seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [step, seconds]);

  const sendCode = async () => {
    if (destination.trim().length < 5) {
      setDestError(t.auth.fieldRequired);
      return;
    }
    setDestError('');
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setLoading(false);
    setStep(1);
    setSeconds(RESEND_SECONDS);
    setCode('');
    setCodeError('');
    setAttempts(0);
    setExpired(false);
  };

  const resend = () => {
    setSeconds(RESEND_SECONDS);
    setCode('');
    setCodeError('');
    setAttempts(0);
    setExpired(false);
  };

  const verifyCode = async () => {
    if (expired) {
      setCodeError(t.auth.codeExpired);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      setCodeError(t.auth.tooManyAttempts);
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 350));
    setLoading(false);
    if (code === CORRECT_CODE) {
      setStep(2);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setCodeError(next >= MAX_ATTEMPTS ? t.auth.tooManyAttempts : t.auth.codeInvalid);
  };

  const savePassword = async () => {
    setPwError('');
    if (pw.next.length < 8) return setPwError(t.auth.passwordTooShort);
    if (pw.next !== pw.confirm) return setPwError(t.auth.passwordsMismatch);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 450));
    setLoading(false);
    setStep(3);
  };

  const steps = [t.auth.stepIdentity, t.auth.stepCode, t.auth.stepNewPassword, t.auth.stepDone];

  return (
    <AuthShell title={t.auth.forgotTitle}>
      <div className="mb-6">
        <Stepper steps={steps} current={step} />
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-body-sm text-ragab-ink-500 text-center">{t.auth.forgotSubtitle}</p>
          <FormField label={t.auth.emailOrPhone} htmlFor="dest" error={destError || undefined}>
            <Input id="dest" dir="ltr" value={destination} onChange={(e) => setDestination(e.target.value)} startIcon={<AtSign className="w-4 h-4" />} invalid={!!destError} placeholder={t.auth.emailPlaceholder} />
          </FormField>
          <Button variant="primary" size="lg" fullWidth onClick={sendCode} isLoading={loading}>
            {t.auth.sendCode}
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-body-sm text-ragab-ink-500 text-center">
            {t.auth.verifySubtitle} <span className="font-bold text-ragab-ink-800" dir="ltr">{maskDestination(destination)}</span>
          </p>
          <OtpInput value={code} onChange={setCode} invalid={!!codeError} autoFocus />
          {codeError && <p className="text-caption text-ragab-danger text-center">{codeError}</p>}
          <Button variant="primary" size="lg" fullWidth onClick={verifyCode} isLoading={loading} disabled={code.length < 6}>
            {t.auth.verifyCTA}
          </Button>
          <div className="flex items-center justify-between text-caption">
            <button onClick={() => setStep(0)} className="font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
              {t.auth.changeDestination}
            </button>
            {seconds > 0 ? (
              <span className="text-ragab-ink-400">{t.auth.resendIn.replace('{seconds}', String(seconds))}</span>
            ) : (
              <button onClick={resend} className="inline-flex items-center gap-1 font-bold text-ragab-brand-700 hover:underline">
                <RotateCcw className="w-3.5 h-3.5" />
                {t.auth.resendCode}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <FormField label={t.auth.newPassword} htmlFor="np">
            <PasswordInput id="np" value={pw.next} onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))} autoComplete="new-password" />
          </FormField>
          {pw.next.length > 0 && (
            <PasswordStrengthMeter value={pw.next} rules={rules} title={t.auth.passwordStrength} strengthLabels={[t.auth.strengthWeak, t.auth.strengthFair, t.auth.strengthGood, t.auth.strengthStrong]} />
          )}
          <FormField label={t.auth.confirmPassword} htmlFor="ncp" error={pwError || undefined}>
            <PasswordInput id="ncp" value={pw.confirm} onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))} invalid={!!pwError} autoComplete="new-password" />
          </FormField>
          <Button variant="primary" size="lg" fullWidth onClick={savePassword} isLoading={loading}>
            {t.auth.resetCTA}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-ragab-success-soft text-ragab-success flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-h2 text-ragab-ink-800 mb-2">{t.auth.resetSuccessTitle}</h2>
          <p className="text-body-sm text-ragab-ink-500 mb-6">{t.auth.resetSuccessDesc}</p>
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/login')} rightIcon={<ArrowLeft className="w-4 h-4 ltr:rotate-180" />}>
            {t.auth.backToLogin}
          </Button>
        </div>
      )}

      {step < 3 && (
        <p className="text-center text-body-sm text-ragab-ink-500 mt-6">
          <Link href="/login" className="font-bold text-ragab-brand-700 hover:underline">
            {t.auth.backToLogin}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
