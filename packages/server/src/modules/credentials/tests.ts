/**
 * Per-provider connection tests for the admin panel. Each returns a plain ok/message
 * result and NEVER echoes a secret. Tests use the effective credentials (DB override or
 * env). They validate reachability + credential validity without side effects.
 */
import nodemailer from 'nodemailer';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { serverEnv } from '../../config/env';
import { getCredential, type ProviderKey } from './service';

export interface TestResult {
  ok: boolean;
  message: { ar: string; en: string };
}

const fail = (ar: string, en: string): TestResult => ({ ok: false, message: { ar, en } });
const pass = (ar: string, en: string): TestResult => ({ ok: true, message: { ar, en } });

export async function testProvider(provider: ProviderKey): Promise<TestResult> {
  switch (provider) {
    case 'paymob':
      return testPaymob();
    case 'smtp':
      return testSmtp();
    case 's3':
      return testS3();
    case 'sms':
      return testSms();
    default:
      return fail('مزود غير معروف.', 'Unknown provider.');
  }
}

async function testPaymob(): Promise<TestResult> {
  const apiKey = await getCredential('paymob', 'PAYMOB_API_KEY');
  if (!apiKey) return fail('لم يتم إدخال مفتاح API.', 'API key is not set.');
  const base = serverEnv().PAYMOB_BASE_URL;
  try {
    const res = await fetch(`${base}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 201 || res.status === 200) {
      const data = (await res.json().catch(() => ({}))) as { token?: string };
      if (data.token) return pass('تم الاتصال بـ Paymob والتحقق من المفتاح بنجاح.', 'Connected to Paymob and validated the key.');
      return fail('استجابة غير متوقعة من Paymob.', 'Unexpected response from Paymob.');
    }
    if (res.status === 401 || res.status === 400) return fail('مفتاح API غير صحيح.', 'Invalid API key.');
    return fail(`فشل الاتصال (رمز ${res.status}).`, `Connection failed (status ${res.status}).`);
  } catch {
    return fail('تعذّر الوصول إلى Paymob.', 'Could not reach Paymob.');
  }
}

async function testSmtp(): Promise<TestResult> {
  const host = await getCredential('smtp', 'SMTP_HOST');
  if (!host) return fail('لم يتم إدخال خادم SMTP.', 'SMTP host is not set.');
  const port = Number((await getCredential('smtp', 'SMTP_PORT')) ?? 587);
  const user = await getCredential('smtp', 'SMTP_USER');
  const pass = await getCredential('smtp', 'SMTP_PASSWORD');
  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10_000,
    });
    await transport.verify();
    return { ok: true, message: { ar: 'تم الاتصال بخادم البريد والتحقق منه.', en: 'Connected to the mail server and verified.' } };
  } catch {
    return fail('فشل الاتصال بخادم البريد أو بيانات الدخول غير صحيحة.', 'Failed to connect or authenticate to the mail server.');
  }
}

async function testS3(): Promise<TestResult> {
  const accessKey = await getCredential('s3', 'S3_ACCESS_KEY_ID');
  const secretKey = await getCredential('s3', 'S3_SECRET_ACCESS_KEY');
  const bucket = (await getCredential('s3', 'S3_BUCKET')) ?? serverEnv().S3_BUCKET;
  if (!accessKey || !secretKey) return fail('لم يتم إدخال مفاتيح التخزين.', 'Storage keys are not set.');
  const endpoint = await getCredential('s3', 'S3_ENDPOINT');
  const region = (await getCredential('s3', 'S3_REGION')) ?? serverEnv().S3_REGION;
  try {
    const client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return pass('تم الاتصال بالتخزين والوصول إلى الحاوية.', 'Connected to storage and reached the bucket.');
  } catch {
    return fail('فشل الاتصال بالتخزين أو الحاوية غير موجودة.', 'Failed to connect to storage or the bucket is missing.');
  }
}

async function testSms(): Promise<TestResult> {
  const apiKey = await getCredential('sms', 'SMS_API_KEY');
  const providerName = await getCredential('sms', 'SMS_PROVIDER');
  if (!apiKey || !providerName) return fail('لم يتم ضبط مزود الرسائل بعد.', 'SMS provider is not configured yet.');
  // A live send is provider-specific; presence of credentials is reported as configured.
  return pass('تم ضبط مزود الرسائل (لا يوجد اختبار إرسال حي).', 'SMS provider configured (no live send test).');
}
