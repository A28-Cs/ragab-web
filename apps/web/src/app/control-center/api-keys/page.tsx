'use client';

/**
 * API keys & secrets manager. One section per integration (Paymob, SMTP, S3, SMS), each
 * with its required fields, a "configured" badge, a Save button, and a Test button that
 * runs a live connection check. Secret values are shown MASKED (••••1234) and never
 * returned in full; leaving a secret field blank keeps the stored value unchanged.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, KeyRound, CreditCard, Mail, HardDrive, MessageSquare, CheckCircle2, AlertTriangle, PlugZap } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useToast } from '../../../components/ui/Toast';
import { RequirePermission } from '../../../components/auth/RequirePermission';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { getProviderStatus, saveCredentials, testProviderConnection, type ProviderStatus } from '../../../services/credentialsService';

const SECTION_ICON: Record<string, React.ElementType> = { payment: CreditCard, messaging: Mail, storage: HardDrive };
const PROVIDER_ICON: Record<string, React.ElementType> = { paymob: CreditCard, smtp: Mail, s3: HardDrive, sms: MessageSquare };

function ApiKeysInner() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-provider working copy of typed values, and busy flags.
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await getProviderStatus();
      setProviders(data);
      // Seed drafts: non-secret keys prefilled with their real value; secrets blank.
      const seed: Record<string, Record<string, string>> = {};
      for (const p of data) {
        seed[p.key] = {};
        for (const k of p.keys) seed[p.key][k.name] = !k.secret && k.configured && k.masked ? k.masked : '';
      }
      setDrafts(seed);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const setField = (provider: string, name: string, value: string) =>
    setDrafts((d) => ({ ...d, [provider]: { ...d[provider], [name]: value } }));

  const onSave = async (p: ProviderStatus) => {
    setSaving(p.key);
    try {
      // Send only fields the admin actually changed (non-empty, differs from initial).
      const initial: Record<string, string> = {};
      for (const k of p.keys) initial[k.name] = !k.secret && k.configured && k.masked ? k.masked : '';
      const changed: Record<string, string> = {};
      for (const k of p.keys) {
        const v = drafts[p.key]?.[k.name] ?? '';
        if (v !== '' && v !== initial[k.name]) changed[k.name] = v;
      }
      if (Object.keys(changed).length === 0) {
        showToast(ar ? 'لا يوجد تغييرات للحفظ' : 'No changes to save', 'info');
        return;
      }
      const updated = await saveCredentials(p.key, changed);
      setProviders(updated);
      // Reset secret inputs after save.
      setDrafts((d) => ({ ...d, [p.key]: Object.fromEntries(p.keys.map((k) => [k.name, !k.secret ? (d[p.key]?.[k.name] ?? '') : ''])) }));
      showToast(ar ? 'تم حفظ المفاتيح' : 'Keys saved', 'success');
    } catch (e) {
      showToast((e as { bilingual?: { ar: string; en: string } }).bilingual?.[ar ? 'ar' : 'en'] ?? (ar ? 'تعذر الحفظ' : 'Save failed'), 'error');
    } finally {
      setSaving(null);
    }
  };

  const onTest = async (p: ProviderStatus) => {
    setTesting(p.key);
    setTestResult((r) => ({ ...r, [p.key]: { ok: false, text: ar ? 'جارٍ الاختبار…' : 'Testing…' } }));
    try {
      const res = await testProviderConnection(p.key);
      setTestResult((r) => ({ ...r, [p.key]: { ok: res.ok, text: res.message[ar ? 'ar' : 'en'] } }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [p.key]: { ok: false, text: (e as { bilingual?: { ar: string; en: string } }).bilingual?.[ar ? 'ar' : 'en'] ?? (ar ? 'فشل الاختبار' : 'Test failed') } }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ragab-ink-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-ragab-brand-100 text-ragab-brand-700">
          <KeyRound className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-h2 text-ragab-ink-900">{ar ? 'مفاتيح API والأسرار' : 'API Keys & Secrets'}</h1>
          <p className="text-body-sm text-ragab-ink-500">
            {ar ? 'أضف مفاتيح كل خدمة واختبر الاتصال. تُخزَّن الأسرار مشفّرة ولا تُعرض كاملة أبداً.' : 'Add each service’s keys and test the connection. Secrets are encrypted and never shown in full.'}
          </p>
        </div>
      </div>

      {providers.map((p) => {
        const Icon = PROVIDER_ICON[p.key] ?? SECTION_ICON[p.category] ?? KeyRound;
        const result = testResult[p.key];
        return (
          <Card key={p.key} className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-ragab-surface text-ragab-ink-700 shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h2 className="text-h3 text-ragab-ink-800">{ar ? p.nameAr : p.nameEn}</h2>
                  <p className="text-caption text-ragab-ink-500 mt-0.5">{p.descriptionAr}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-full ${p.configured ? 'bg-ragab-success-soft text-ragab-success' : 'bg-ragab-warning-soft text-ragab-warning'}`}>
                {p.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {p.configured ? (ar ? 'مُهيّأ' : 'Configured') : (ar ? 'غير مكتمل' : 'Not configured')}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              {p.keys.map((k) => (
                <FormField key={k.name} label={`${k.label}${k.required ? ' *' : ''}`}>
                  <Input
                    dir="ltr"
                    type={k.secret ? 'password' : 'text'}
                    value={drafts[p.key]?.[k.name] ?? ''}
                    placeholder={k.secret ? (k.configured ? (k.masked ?? '••••') : (k.placeholder ?? '')) : (k.placeholder ?? '')}
                    onChange={(e) => setField(p.key, k.name, e.target.value)}
                    autoComplete="off"
                  />
                  {k.source === 'env' && k.configured && (
                    <p className="text-[11px] text-ragab-ink-400 mt-1">{ar ? 'مضبوط حالياً من متغيرات البيئة' : 'Currently set from environment'}</p>
                  )}
                </FormField>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <Button variant="primary" size="sm" onClick={() => onSave(p)} isLoading={saving === p.key}>
                {ar ? 'حفظ' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" leftIcon={<PlugZap className="w-4 h-4" />} onClick={() => onTest(p)} isLoading={testing === p.key}>
                {ar ? 'اختبار الاتصال' : 'Test connection'}
              </Button>
              {result && (
                <span className={`inline-flex items-center gap-1.5 text-caption font-semibold ${result.ok ? 'text-ragab-success' : 'text-ragab-danger'}`}>
                  {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {result.text}
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function ApiKeysPage() {
  return (
    <RequirePermission resource="integrations" action="view">
      <ApiKeysInner />
    </RequirePermission>
  );
}
