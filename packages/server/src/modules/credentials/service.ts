/**
 * Provider credentials manager (§33 secrets). Lets an admin configure API keys / secrets
 * / tokens per integration from the panel. Security properties:
 *   - values are ENCRYPTED at rest (AES-256-GCM) and decrypted only in-process
 *   - a DB value OVERRIDES the matching env var, so config changes need no redeploy
 *   - full secret values are NEVER returned to the client — only { configured, masked }
 *   - every change is audited; a short cache avoids decrypting on every read
 * Consumers (Paymob provider, email, storage) read via getCredential().
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { providerCredentials } from '../../db/schema';
import { DEFAULT_STORE_ID } from '../../db/schema/system';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { prefixedId } from '../../lib/ids';
import { encryptSecret } from '../../security/crypto';
import { getCredential, loadDbCredentials, invalidateCredentialsCache } from '../../lib/credentials';
import type { RequestContext } from '../../http/context';
import { logAudit } from '../audit';

export { getCredential, invalidateCredentialsCache };

export type ProviderKey = 'paymob' | 'smtp' | 's3' | 'sms';

interface KeyDef {
  name: string; // env var name (also the DB key_name)
  label: string;
  secret: boolean; // true → masked in responses
  required?: boolean;
  placeholder?: string;
}

interface ProviderDef {
  key: ProviderKey;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: 'payment' | 'messaging' | 'storage';
  keys: KeyDef[];
}

/** The sections shown in the admin panel, each with the keys it needs. */
export const PROVIDERS: ProviderDef[] = [
  {
    key: 'paymob',
    nameAr: 'باي موب (المدفوعات الإلكترونية)',
    nameEn: 'Paymob (Online Payments)',
    descriptionAr: 'مطلوب لتفعيل الدفع بالبطاقة والمحافظ الإلكترونية وInstaPay.',
    category: 'payment',
    keys: [
      { name: 'PAYMOB_API_KEY', label: 'API Key', secret: true, required: true },
      { name: 'PAYMOB_SECRET_KEY', label: 'Secret Key', secret: true, required: true },
      { name: 'PAYMOB_PUBLIC_KEY', label: 'Public Key', secret: false, required: true },
      { name: 'PAYMOB_HMAC_SECRET', label: 'HMAC Secret', secret: true, required: true },
    ],
  },
  {
    key: 'smtp',
    nameAr: 'البريد الإلكتروني (SMTP)',
    nameEn: 'Email (SMTP)',
    descriptionAr: 'مطلوب لإرسال رسائل التحقق وإعادة تعيين كلمة المرور وتأكيد الطلبات.',
    category: 'messaging',
    keys: [
      { name: 'SMTP_HOST', label: 'Host', secret: false, required: true, placeholder: 'smtp.example.com' },
      { name: 'SMTP_PORT', label: 'Port', secret: false, placeholder: '587' },
      { name: 'SMTP_USER', label: 'Username', secret: false },
      { name: 'SMTP_PASSWORD', label: 'Password', secret: true },
      { name: 'SMTP_FROM', label: 'From', secret: false, placeholder: 'Ragab <no-reply@ragab.local>' },
    ],
  },
  {
    key: 's3',
    nameAr: 'تخزين الملفات (S3 / MinIO)',
    nameEn: 'Object Storage (S3 / MinIO)',
    descriptionAr: 'مطلوب لرفع صور المنتجات والملفات.',
    category: 'storage',
    keys: [
      { name: 'S3_ENDPOINT', label: 'Endpoint', secret: false, placeholder: 'http://localhost:9000' },
      { name: 'S3_REGION', label: 'Region', secret: false, placeholder: 'us-east-1' },
      { name: 'S3_ACCESS_KEY_ID', label: 'Access Key ID', secret: true },
      { name: 'S3_SECRET_ACCESS_KEY', label: 'Secret Access Key', secret: true },
      { name: 'S3_BUCKET', label: 'Bucket', secret: false, placeholder: 'ragab-uploads' },
      { name: 'S3_PUBLIC_URL', label: 'Public URL', secret: false },
    ],
  },
  {
    key: 'sms',
    nameAr: 'الرسائل النصية (SMS)',
    nameEn: 'SMS Gateway',
    descriptionAr: 'مطلوب لإرسال رموز التحقق عبر رسائل SMS (يحتاج مزوّد خدمة).',
    category: 'messaging',
    keys: [
      { name: 'SMS_PROVIDER', label: 'Provider', secret: false, placeholder: 'twilio | smsmisr' },
      { name: 'SMS_API_KEY', label: 'API Key', secret: true },
      { name: 'SMS_SENDER', label: 'Sender ID', secret: false },
    ],
  },
];

const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.key, p]));
const ALL_KEY_NAMES = new Set(PROVIDERS.flatMap((p) => p.keys.map((k) => k.name)));


// ---- admin listing / editing ----

function mask(value: string, secret: boolean): string {
  if (!secret) return value;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

export interface ProviderStatusDto {
  key: ProviderKey;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: string;
  configured: boolean;
  keys: { name: string; label: string; secret: boolean; required: boolean; placeholder?: string; configured: boolean; source: 'db' | 'env' | 'none'; masked?: string }[];
}

/** Masked status of every provider/key — safe to send to the client (no full secrets). */
export async function listProviderStatus(): Promise<ProviderStatusDto[]> {
  const dbMap = await loadDbCredentials();
  return PROVIDERS.map((p) => {
    const keys = p.keys.map((k) => {
      const dbVal = dbMap.get(`${p.key}:${k.name}`);
      const envVal = process.env[k.name];
      const value = dbVal && dbVal !== '' ? dbVal : envVal && envVal !== '' ? envVal : undefined;
      const source: 'db' | 'env' | 'none' = dbVal && dbVal !== '' ? 'db' : envVal && envVal !== '' ? 'env' : 'none';
      return {
        name: k.name, label: k.label, secret: k.secret, required: Boolean(k.required), placeholder: k.placeholder,
        configured: value !== undefined,
        source,
        // Non-secret values are shown; secret values are masked; missing → undefined.
        masked: value !== undefined ? mask(value, k.secret) : undefined,
      };
    });
    const requiredKeys = p.keys.filter((k) => k.required);
    const configured = requiredKeys.length > 0 ? requiredKeys.every((k) => keys.find((x) => x.name === k.name)?.configured) : keys.some((x) => x.configured);
    return { key: p.key, nameAr: p.nameAr, nameEn: p.nameEn, descriptionAr: p.descriptionAr, category: p.category, configured, keys };
  });
}

export const setCredentialsSchema = z.object({
  values: z.record(z.string(), z.string().max(4000)),
}).strict();

/**
 * Set credentials for a provider. An empty string DELETES that key (revert to env).
 * A masked placeholder (starts with the mask bullet) is IGNORED so re-saving the form
 * without retyping a secret does not overwrite it with the mask.
 */
export async function setCredentials(ctx: RequestContext, provider: ProviderKey, values: Record<string, string>): Promise<ProviderStatusDto[]> {
  const def = PROVIDER_MAP.get(provider);
  if (!def) throw new NotFoundError({ code: 'PROVIDER_NOT_FOUND', message: { ar: 'المزود غير موجود.', en: 'Provider not found.' } });
  const validNames = new Set(def.keys.map((k) => k.name));

  for (const [name, raw] of Object.entries(values)) {
    if (!validNames.has(name)) throw new ValidationError({ code: 'UNKNOWN_CREDENTIAL_KEY', message: { ar: 'مفتاح غير معروف.', en: 'Unknown credential key.' }, details: { name } });
    const value = raw.trim();
    if (value.startsWith('••••')) continue; // untouched masked field — skip
    if (value === '') {
      await db().delete(providerCredentials).where(and(eq(providerCredentials.provider, provider), eq(providerCredentials.keyName, name)));
      continue;
    }
    await db()
      .insert(providerCredentials)
      .values({ id: prefixedId('cred'), provider, keyName: name, valueEncrypted: encryptSecret(value), updatedBy: ctx.principal?.userId })
      .onConflictDoUpdate({ target: [providerCredentials.storeId, providerCredentials.provider, providerCredentials.keyName], set: { valueEncrypted: encryptSecret(value), updatedBy: ctx.principal?.userId, updatedAt: new Date() } });
  }

  invalidateCredentialsCache();
  await logAudit({
    actorId: ctx.principal?.userId, actorName: ctx.principal?.user.name ?? 'system', actorRole: 'staff',
    action: 'settings_changed', resource: 'integrations', resourceId: provider,
    // Metadata records WHICH keys changed, never the values.
    metadata: { provider, keys: Object.keys(values).join(',') }, requestId: ctx.requestId,
  });
  return listProviderStatus();
}

export function isKnownProvider(p: string): p is ProviderKey {
  return PROVIDER_MAP.has(p as ProviderKey);
}

export { PROVIDER_MAP, ALL_KEY_NAMES };
