'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, RotateCcw, MailCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AuthShell } from '../../components/auth/AuthShell';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/apiClient';

const RESEND_SECONDS = 45;

function maskDestination(v: string): string {
  const s = v.trim();
  if (s.includes('@')) {
    const [name, domain] = s.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  if (s.length >= 4) return `${s.slice(0, 3)}••••${s.slice(-2)}`;
  return s;
}

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLanguage();
  const { user, verifyEmail, resendEmailVerification } = useAuth();

  const token = params.get('token');
  const type = params.get('type') === 'phone' ? 'phone' : 'email';
  const destination = params.get('to') || (type === 'phone' ? user?.phone ?? '' : user?.email ?? 'name@example.com');

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenProcessing, setTokenProcessing] = useState(!!token);

  useEffect(() => {
    if (!token) return;
    
    // Automatically verify token from URL
    verifyEmail(token)
      .then(() => {
        setDone(true);
      })
      .catch((err) => {
        const e = err as { bilingual?: { ar: string; en: string } };
        setError(e.bilingual?.ar ?? 'رابط التحقق غير صالح أو منتهي');
      })
      .finally(() => {
        setTokenProcessing(false);
      });
  }, [token, verifyEmail]);

  useEffect(() => {
    if (seconds <= 0 || tokenProcessing) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, tokenProcessing]);

  const verify = async () => {
    setLoading(true);
    try {
      if (type === 'phone') {
        await api.post('/auth/verify-phone', { code });
      }
      setDone(true);
    } catch (err) {
      const e = err as { bilingual?: { ar: string; en: string } };
      setError(e.bilingual?.ar ?? 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  };
  
  const resend = async () => {
    setSeconds(RESEND_SECONDS); 
    setCode(''); 
    setError('');
    
    if (type === 'email' && user?.email) {
      await resendEmailVerification(user.email);
    } else if (type === 'phone') {
      // Assuming a backend endpoint for resending phone OTP exists or just rely on backend limits
      await api.post('/auth/resend-phone-verification', {}).catch(() => {});
    }
  };

  if (tokenProcessing) {
    return (
      <AuthShell>
        <div className="text-center py-10">
          <p className="text-body text-ragab-ink-600">جاري التحقق من الرابط...</p>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-ragab-success-soft text-ragab-success flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-h2 text-ragab-ink-800 mb-2">{t.auth.verifiedTitle}</h2>
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/account')} rightIcon={<ArrowLeft className="w-4 h-4 ltr:rotate-180" />}>
            {t.account.title}
          </Button>
        </div>
      </AuthShell>
    );
  }
  
  if (token && error) {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-ragab-danger-soft text-ragab-danger flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-h2 text-ragab-ink-800 mb-2">تعذر التحقق</h2>
          <p className="text-body-sm text-ragab-danger mb-6">{error}</p>
          <Button variant="outline" size="lg" fullWidth onClick={() => router.push('/login')}>
            الرجوع لتسجيل الدخول
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-ragab-brand-100 text-ragab-brand-700 flex items-center justify-center mx-auto mb-3">
          <MailCheck className="w-7 h-7" />
        </div>
        <h1 className="text-h2 text-ragab-ink-800">{t.auth.verifyTitle}</h1>
        <p className="text-body-sm text-ragab-ink-500 mt-2">
          {t.auth.verifySubtitle} <span className="font-bold text-ragab-ink-800" dir="ltr">{maskDestination(destination)}</span>
        </p>
      </div>

      <div className="space-y-4">
        {type === 'phone' ? (
          <>
            <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} invalid={!!error} autoFocus />
            {error && <p className="text-caption text-ragab-danger text-center">{error}</p>}
            <Button variant="primary" size="lg" fullWidth onClick={verify} isLoading={loading} disabled={code.length < 6}>
              {t.auth.verifyCTA}
            </Button>
          </>
        ) : (
          <p className="text-body-sm text-center text-ragab-ink-600 mb-4">
            يرجى التحقق من بريدك الإلكتروني والضغط على الرابط المرسل لتفعيل حسابك.
          </p>
        )}
        
        <div className="flex items-center justify-between text-caption mt-6">
          <button onClick={() => router.push('/account/profile')} className="font-semibold text-ragab-ink-500 hover:text-ragab-ink-800">
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
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <VerifyInner />
    </Suspense>
  );
}
