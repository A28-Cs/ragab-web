/**
 * Email delivery (§23). Real SMTP via nodemailer when SMTP_HOST is configured; otherwise
 * a safe no-op that records the intent (so dev works without a mail server). Every send
 * is recorded in `email_events` for audit. Templates are bilingual and minimal (RTL).
 * Failures never throw into the caller's happy path.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { eq } from 'drizzle-orm';
import { serverEnv } from '../config/env';
import { getCredential } from './credentials';
import { db } from '../db/client';
import { emailEvents } from '../db/schema';
import { logger } from './logger';
import { escapeHtml } from '../security/sanitize';

/** Build a transport from the EFFECTIVE SMTP credentials (DB override or env). Not
 *  cached — credentials can change at runtime from the admin panel. */
async function getTransport(): Promise<Transporter | null> {
  const host = await getCredential('smtp', 'SMTP_HOST');
  if (!host) return null; // no mail server configured — dev/no-op mode
  const port = Number((await getCredential('smtp', 'SMTP_PORT')) ?? 587);
  const user = await getCredential('smtp', 'SMTP_USER');
  const pass = await getCredential('smtp', 'SMTP_PASSWORD');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string | null;
  template?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean }> {
  const log = logger().child({ component: 'email', template: msg.template });
  const t = await getTransport();
  try {
    if (!t) {
      log.info({ to: '[redacted]' }, 'email skipped (SMTP not configured)');
      await record(msg, 'queued', null);
      return { delivered: false };
    }
    const from = (await getCredential('smtp', 'SMTP_FROM')) ?? serverEnv().SMTP_FROM;
    const info = await t.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    await record(msg, 'sent', info.messageId ?? null);
    return { delivered: true };
  } catch (e) {
    log.error({ err: e }, 'email send failed');
    await record(msg, 'failed', null, (e as Error).message);
    return { delivered: false };
  }
}

async function record(msg: EmailMessage, status: string, providerMessageId: string | null, error?: string): Promise<void> {
  try {
    await db().insert(emailEvents).values({
      userId: msg.userId ?? null,
      toAddress: msg.to,
      template: msg.template ?? 'generic',
      status,
      providerMessageId,
      error: error ?? null,
    });
  } catch {
    /* recording failure must not break the flow */
  }
}

// ---- bilingual templates ----

function layout(bodyAr: string, bodyEn: string): string {
  return `<div style="font-family:Tahoma,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
    <div dir="rtl" style="text-align:right">${bodyAr}</div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <div dir="ltr" style="text-align:left;color:#666;font-size:13px">${bodyEn}</div>
    <p style="color:#aaa;font-size:12px;margin-top:24px">رجب — Ragab</p>
  </div>`;
}

export function verificationEmail(code: string): { subject: string; html: string; text: string } {
  const safe = escapeHtml(code);
  return {
    subject: 'رمز التحقق — Ragab verification code',
    html: layout(
      `<h2>رمز التحقق الخاص بك</h2><p>استخدم الرمز التالي لتأكيد حسابك. صالح لمدة 10 دقائق.</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${safe}</p>`,
      `<p>Your verification code is <b>${safe}</b>. It expires in 10 minutes.</p>`,
    ),
    text: `رمز التحقق: ${code} / Verification code: ${code}`,
  };
}

export function emailVerificationLinkEmail(link: string): { subject: string; html: string; text: string } {
  const safe = escapeHtml(link);
  return {
    subject: 'تأكيد البريد الإلكتروني — Verify your email',
    html: layout(
      `<h2>تأكيد البريد الإلكتروني</h2><p>اضغط الرابط التالي لتأكيد حسابك. صالح لمدة 24 ساعة.</p><p><a href="${safe}">تأكيد الحساب</a></p>`,
      `<p>Click to verify your email (valid 24 hours): <a href="${safe}">${safe}</a>.</p>`,
    ),
    text: `تأكيد البريد: ${link} / Verify email: ${link}`,
  };
}

export function passwordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const safe = escapeHtml(resetUrl);
  return {
    subject: 'إعادة تعيين كلمة المرور — Reset your password',
    html: layout(
      `<h2>إعادة تعيين كلمة المرور</h2><p>اضغط الرابط التالي لإعادة تعيين كلمة المرور. صالح لمدة 30 دقيقة. تجاهل الرسالة إن لم تطلبها.</p><p><a href="${safe}">إعادة التعيين</a></p>`,
      `<p>Click to reset your password (valid 30 minutes): <a href="${safe}">${safe}</a>. Ignore this email if you did not request it.</p>`,
    ),
    text: `إعادة التعيين: ${resetUrl} / Reset: ${resetUrl}`,
  };
}

// ---- order lifecycle templates ----

/** Everything an order email needs, projected from the Order DTO (money in major units). */
export interface OrderEmailSummary {
  orderNumber: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  items: { nameAr: string; nameEn?: string; quantity: number; total: number }[];
  address: { recipientName: string; phone: string; village: string; streetAddress: string; landmark?: string };
  paymentMethod: 'cod' | 'vodafone_cash' | 'instapay';
  /** Absolute link to the order page (omit in tests / when the public URL is unknown). */
  orderUrl?: string;
}

export type EmailTemplate = { subject: string; html: string; text: string };

const PAYMENT_LABEL: Record<OrderEmailSummary['paymentMethod'], { ar: string; en: string }> = {
  cod: { ar: 'الدفع عند الاستلام', en: 'Cash on delivery' },
  vodafone_cash: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
  instapay: { ar: 'إنستاباي', en: 'InstaPay' },
};

const STATUS_COPY: Record<string, { subjectAr: string; subjectEn: string; bodyAr: string; bodyEn: string }> = {
  preparing: { subjectAr: 'جاري تجهيز طلبك', subjectEn: 'Your order is being prepared', bodyAr: 'بدأنا في تجهيز طلبك. سنخطرك عند خروجه للتوصيل.', bodyEn: 'We have started preparing your order and will notify you when it is out for delivery.' },
  on_the_way: { subjectAr: 'طلبك في الطريق إليك', subjectEn: 'Your order is on its way', bodyAr: 'خرج طلبك للتوصيل الآن. يرجى تجهيز المبلغ إن كان الدفع عند الاستلام.', bodyEn: 'Your order is out for delivery now. Please have the amount ready if paying on delivery.' },
  delivered: { subjectAr: 'تم توصيل طلبك', subjectEn: 'Your order was delivered', bodyAr: 'تم توصيل طلبك بنجاح. شكرًا لثقتك في رجب!', bodyEn: 'Your order was delivered successfully. Thank you for shopping with Ragab!' },
  cancelled: { subjectAr: 'تم إلغاء طلبك', subjectEn: 'Your order was cancelled', bodyAr: 'تم إلغاء طلبك. إن كان قد تم تحصيل أي مبلغ فسيُعاد إليك.', bodyEn: 'Your order was cancelled. Any amount already collected will be returned to you.' },
};

/** Address + items + totals block shared by every order email (both languages). */
function orderBlock(o: OrderEmailSummary): { ar: string; en: string } {
  const a = o.address;
  const rows = (lang: 'ar' | 'en') =>
    o.items
      .map((it) => `<tr><td style="padding:4px 0">${escapeHtml(lang === 'ar' ? it.nameAr : it.nameEn || it.nameAr)} × ${it.quantity}</td><td style="padding:4px 0;text-align:${lang === 'ar' ? 'left' : 'right'}">${it.total.toFixed(2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}</td></tr>`)
      .join('');
  const totals = (lang: 'ar' | 'en') => {
    const cur = lang === 'ar' ? 'ج.م' : 'EGP';
    const l = lang === 'ar'
      ? { sub: 'المنتجات', del: 'التوصيل', disc: 'الخصم', tot: 'الإجمالي', free: 'مجانًا' }
      : { sub: 'Items', del: 'Delivery', disc: 'Discount', tot: 'Total', free: 'Free' };
    return `<p>${l.sub}: ${o.subtotal.toFixed(2)} ${cur}<br/>${l.del}: ${o.deliveryFee === 0 ? l.free : `${o.deliveryFee.toFixed(2)} ${cur}`}${o.discount > 0 ? `<br/>${l.disc}: -${o.discount.toFixed(2)} ${cur}` : ''}<br/><b>${l.tot}: ${o.total.toFixed(2)} ${cur}</b></p>`;
  };
  const addr = (lang: 'ar' | 'en') => {
    const l = lang === 'ar' ? { title: 'عنوان التوصيل', pay: 'طريقة الدفع' } : { title: 'Delivery address', pay: 'Payment' };
    return `<p><b>${l.title}:</b><br/>${escapeHtml(a.recipientName)} — ${escapeHtml(a.phone)}<br/>${escapeHtml(a.village)}، ${escapeHtml(a.streetAddress)}${a.landmark ? `<br/>${escapeHtml(a.landmark)}` : ''}</p><p><b>${l.pay}:</b> ${PAYMENT_LABEL[o.paymentMethod][lang]}</p>`;
  };
  const link = (lang: 'ar' | 'en') => (o.orderUrl ? `<p><a href="${escapeHtml(o.orderUrl)}">${lang === 'ar' ? 'عرض الطلب' : 'View order'}</a></p>` : '');
  return {
    ar: `<table style="width:100%;border-collapse:collapse">${rows('ar')}</table>${totals('ar')}${addr('ar')}${link('ar')}`,
    en: `<table style="width:100%;border-collapse:collapse">${rows('en')}</table>${totals('en')}${addr('en')}${link('en')}`,
  };
}

function textSummary(o: OrderEmailSummary): string {
  return `${o.orderNumber} — ${o.total.toFixed(2)} ج.م — ${o.address.village}, ${o.address.streetAddress}`;
}

export function orderConfirmationEmail(o: OrderEmailSummary): EmailTemplate {
  const safeNo = escapeHtml(o.orderNumber);
  const block = orderBlock(o);
  return {
    subject: `تأكيد الطلب ${o.orderNumber} — Order confirmed`,
    html: layout(
      `<h2>تم استلام طلبك</h2><p>رقم الطلب: <b>${safeNo}</b></p>${block.ar}<p>سنخطرك عند كل تحديث لحالة الطلب.</p>`,
      `<p>Order <b>${safeNo}</b> received.</p>${block.en}<p>We will notify you at every status update.</p>`,
    ),
    text: `تم استلام الطلب ${textSummary(o)}`,
  };
}

export function orderStatusEmail(o: OrderEmailSummary, status: string): EmailTemplate {
  const copy = STATUS_COPY[status] ?? { subjectAr: 'تحديث حالة الطلب', subjectEn: 'Order update', bodyAr: 'تم تحديث حالة طلبك.', bodyEn: 'Your order status was updated.' };
  const safeNo = escapeHtml(o.orderNumber);
  const block = orderBlock(o);
  return {
    subject: `${copy.subjectAr} ${o.orderNumber} — ${copy.subjectEn}`,
    html: layout(
      `<h2>${copy.subjectAr}</h2><p>رقم الطلب: <b>${safeNo}</b></p><p>${copy.bodyAr}</p>${block.ar}`,
      `<p><b>${safeNo}</b>: ${copy.bodyEn}</p>${block.en}`,
    ),
    text: `${copy.subjectAr}: ${textSummary(o)}`,
  };
}

export function paymentConfirmedEmail(o: OrderEmailSummary): EmailTemplate {
  const safeNo = escapeHtml(o.orderNumber);
  const block = orderBlock(o);
  return {
    subject: `تم تأكيد دفع الطلب ${o.orderNumber} — Payment confirmed`,
    html: layout(
      `<h2>تم تأكيد الدفع</h2><p>استلمنا دفع طلبك رقم <b>${safeNo}</b> وبدأنا في تجهيزه.</p>${block.ar}`,
      `<p>We received the payment for order <b>${safeNo}</b> and started preparing it.</p>${block.en}`,
    ),
    text: `تم تأكيد دفع الطلب ${textSummary(o)}`,
  };
}

export function refundIssuedEmail(o: OrderEmailSummary, amount: number): EmailTemplate {
  const safeNo = escapeHtml(o.orderNumber);
  return {
    subject: `تم استرداد مبلغ الطلب ${o.orderNumber} — Refund issued`,
    html: layout(
      `<h2>تم إصدار استرداد</h2><p>أعدنا مبلغ <b>${amount.toFixed(2)} ج.م</b> عن الطلب رقم <b>${safeNo}</b>. قد يستغرق ظهوره حسب طريقة الدفع.</p>`,
      `<p>A refund of <b>${amount.toFixed(2)} EGP</b> was issued for order <b>${safeNo}</b>. It may take a few days to appear depending on the payment method.</p>`,
    ),
    text: `تم استرداد ${amount.toFixed(2)} ج.م عن الطلب ${o.orderNumber}`,
  };
}
