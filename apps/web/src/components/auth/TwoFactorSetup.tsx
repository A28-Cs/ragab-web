'use client';

/**
 * Two-factor setup modal (§9). Calls /auth/2fa/setup on open, shows the secret to add to
 * an authenticator app, verifies a 6-digit code via /auth/2fa/enable, then displays the
 * one-time recovery codes. Manual secret entry (no QR dependency) — the otpauth URI is
 * also offered for apps that accept a link.
 */
import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { api } from '../../lib/apiClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

type Step = 'loading' | 'verify' | 'recovery' | 'error';

export const TwoFactorSetup: React.FC<Props> = ({ isOpen, onClose, onEnabled }) => {
  const [step, setStep] = useState<Step>('loading');
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setStep('loading');
    setCode('');
    setError('');
    (async () => {
      try {
        const res = await api.post<{ secret: string; otpauthUri: string }>('/auth/2fa/setup');
        setSecret(res.secret);
        setOtpauth(res.otpauthUri);
        setStep('verify');
      } catch (e) {
        setError((e as { bilingual?: { ar: string } }).bilingual?.ar ?? 'تعذر بدء الإعداد');
        setStep('error');
      }
    })();
  }, [isOpen]);

  const confirm = async () => {
    if (code.trim().length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code: code.trim() });
      setRecovery(res.recoveryCodes);
      setStep('recovery');
    } catch (e) {
      setError((e as { bilingual?: { ar: string } }).bilingual?.ar ?? 'رمز التحقق غير صحيح');
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onEnabled();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={step === 'recovery' ? finish : onClose} title="تفعيل التحقق بخطوتين">
      {step === 'loading' && <p className="text-body-sm text-ragab-ink-500">جارٍ التحضير…</p>}

      {step === 'error' && <p className="text-body-sm text-ragab-danger">{error}</p>}

      {step === 'verify' && (
        <div className="space-y-4">
          <p className="text-body-sm text-ragab-ink-600">
            أضف هذا المفتاح في تطبيق المصادقة (Google Authenticator / Authy) ثم أدخل الرمز المكوّن من 6 أرقام.
          </p>
          <div className="rounded-xl bg-ragab-surface p-3 text-center">
            <code dir="ltr" className="text-body font-mono tracking-wider text-ragab-ink-800 break-all">{secret}</code>
          </div>
          <a href={otpauth} className="block text-center text-caption text-ragab-brand-700 hover:underline" dir="ltr">
            فتح في تطبيق المصادقة
          </a>
          <FormField label="رمز التحقق" htmlFor="v-code" error={error || undefined}>
            <Input id="v-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" dir="ltr" invalid={!!error} />
          </FormField>
          <Button variant="primary" size="lg" fullWidth onClick={confirm} isLoading={busy} disabled={code.length !== 6}>
            تفعيل
          </Button>
        </div>
      )}

      {step === 'recovery' && (
        <div className="space-y-4">
          <p className="text-body-sm text-ragab-ink-600">
            احفظ رموز الاسترداد التالية في مكان آمن. كل رمز يُستخدم مرة واحدة لتسجيل الدخول إذا فقدت هاتفك.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-ragab-surface p-3">
            {recovery.map((c) => (
              <code key={c} dir="ltr" className="text-caption font-mono text-ragab-ink-800 text-center">{c}</code>
            ))}
          </div>
          <Button variant="primary" size="lg" fullWidth onClick={finish}>
            تم الحفظ
          </Button>
        </div>
      )}
    </Modal>
  );
};
