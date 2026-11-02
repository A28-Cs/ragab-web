import { serverEnv } from '../config/env';
import { logger } from './logger';

export interface TelegramOrderAlertInput {
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  totalFormatted: string;
  paymentMethod?: string;
  address?: string;
  itemsCount?: number;
  orderUrl?: string;
}

export interface TelegramPrescriptionAlertInput {
  prescriptionId: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  viewUrl?: string;
}

export async function sendTelegramOrderAlert(alert: TelegramOrderAlertInput): Promise<boolean> {
  let token: string | undefined;
  let chatId: string | undefined;

  try {
    token = serverEnv().TELEGRAM_BOT_TOKEN;
    chatId = serverEnv().TELEGRAM_CHAT_ID;
  } catch {
    return false;
  }

  if (!token || !chatId) {
    return false;
  }

  const lines = [
    `🔔 *طلب جديد في صيدلية رجب!*`,
    `━━━━━━━━━━━━━━━━`,
    `📦 *رقم الطلب:* \`#${alert.orderNumber}\``,
    alert.customerName ? `👤 *العميل:* ${alert.customerName}` : null,
    alert.customerPhone ? `📞 *الهاتف:* \`${alert.customerPhone}\`` : null,
    alert.address ? `📍 *العنوان:* ${alert.address}` : null,
    alert.itemsCount !== undefined ? `💊 *عدد الأصناف:* ${alert.itemsCount}` : null,
    `💰 *الإجمالي:* *${alert.totalFormatted}*`,
    alert.paymentMethod ? `💳 *طريقة الدفع:* ${alert.paymentMethod}` : null,
    `━━━━━━━━━━━━━━━━`,
    alert.orderUrl ? `🔗 [فتح الطلب في لوحة التحكم](${alert.orderUrl})` : null,
  ].filter(Boolean);

  return postToTelegram(token, chatId, lines.join('\n'));
}

export async function sendTelegramPrescriptionAlert(alert: TelegramPrescriptionAlertInput): Promise<boolean> {
  let token: string | undefined;
  let chatId: string | undefined;

  try {
    token = serverEnv().TELEGRAM_BOT_TOKEN;
    chatId = serverEnv().TELEGRAM_CHAT_ID;
  } catch {
    return false;
  }

  if (!token || !chatId) {
    return false;
  }

  const lines = [
    `📋 *روشتة جديدة واردة - صيدلية رجب!*`,
    `━━━━━━━━━━━━━━━━`,
    alert.customerName ? `👤 *العميل:* ${alert.customerName}` : null,
    alert.customerPhone ? `📞 *الهاتف:* \`${alert.customerPhone}\`` : null,
    alert.notes ? `📝 *ملاحظات:* ${alert.notes}` : null,
    `━━━━━━━━━━━━━━━━`,
    alert.viewUrl ? `🔗 [عرض الروشتة في لوحة التحكم](${alert.viewUrl})` : null,
  ].filter(Boolean);

  return postToTelegram(token, chatId, lines.join('\n'));
}

async function postToTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger().child({ component: 'telegram' }).warn({ status: res.status, errText }, 'Telegram alert failed');
      return false;
    }
    return true;
  } catch (err) {
    logger().child({ component: 'telegram' }).error({ err }, 'Error sending Telegram alert');
    return false;
  }
}
