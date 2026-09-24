/**
 * Manual transfer (Vodafone Cash / InstaPay to the store wallet). The customer transfers
 * and uploads a receipt; a staff member with payments:approve confirms it (with re-auth
 * and audit). No secrets, no automatic capture.
 */
import type { CreateIntentInput, CreateIntentResult, ParsedPaymentEvent, PaymentProvider, RefundInput, RefundResult, WebhookVerification } from '../provider';
import { getSettings } from '../../settings/service';

export class ManualTransferProvider implements PaymentProvider {
  readonly key = 'manual_transfer' as const;

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const settings = await getSettings();
    const target = input.method === 'instapay' ? settings.phone : settings.whatsapp;
    return {
      status: 'requires_action',
      instructions: {
        ar: `يرجى تحويل مبلغ الطلب إلى ${target} ثم رفع صورة الإيصال. سيتم تأكيد الطلب بعد المراجعة.`,
        en: `Please transfer the order amount to ${target}, then upload the receipt. Your order will be confirmed after review.`,
      },
    };
  }
  async verifyWebhook(): Promise<WebhookVerification> {
    return { valid: false, reason: 'manual transfer has no webhooks' };
  }
  parseEvent(payload: unknown): ParsedPaymentEvent {
    return { providerEventId: '', eventType: 'noop', outcome: 'unknown', raw: payload };
  }
  async refund(_input: RefundInput): Promise<RefundResult> {
    return { status: 'succeeded' };
  }
}
