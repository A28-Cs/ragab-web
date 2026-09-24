/**
 * Cash on delivery. No external calls: the payment is recorded as pending at checkout
 * and captured when the order is marked delivered (see orders.updateOrderStatus).
 */
import type { CreateIntentInput, CreateIntentResult, ParsedPaymentEvent, PaymentProvider, RefundInput, RefundResult, WebhookVerification } from '../provider';

export class CodProvider implements PaymentProvider {
  readonly key = 'cod' as const;

  async createIntent(_input: CreateIntentInput): Promise<CreateIntentResult> {
    return { status: 'created' };
  }
  async verifyWebhook(): Promise<WebhookVerification> {
    return { valid: false, reason: 'COD has no webhooks' };
  }
  parseEvent(payload: unknown): ParsedPaymentEvent {
    return { providerEventId: '', eventType: 'noop', outcome: 'unknown', raw: payload };
  }
  async refund(_input: RefundInput): Promise<RefundResult> {
    // A COD refund is a manual/cash operation recorded in our ledger; nothing to call.
    return { status: 'succeeded' };
  }
}
