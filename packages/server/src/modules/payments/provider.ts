/**
 * Payment provider abstraction (§17). Business logic (checkout, orders, refunds) depends
 * ONLY on this interface — never on a concrete PSP — so adding/removing a provider is a
 * config change, not a rewrite. Provider selection is driven by the order's paymentMethod
 * and store config.
 */
export type ProviderKey = 'cod' | 'paymob' | 'manual_transfer';

export interface CreateIntentInput {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  method: 'cod' | 'vodafone_cash' | 'instapay' | 'card';
  customer: { name: string; phone: string; email?: string };
}

export interface CreateIntentResult {
  status: 'created' | 'requires_action' | 'processing';
  providerIntentId?: string;
  clientSecret?: string;
  /** Hosted checkout / iframe URL the client redirects to (Paymob). */
  redirectUrl?: string;
  /** Human instructions for manual transfer. */
  instructions?: { ar: string; en: string };
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
}

/** Normalized event the pipeline persists and processes, provider-agnostic. */
export interface ParsedPaymentEvent {
  providerEventId: string;
  eventType: string;
  /** Our order id, recovered from the provider's merchant/order reference. */
  orderId?: string;
  outcome: 'succeeded' | 'failed' | 'pending' | 'refunded' | 'unknown';
  providerPaymentId?: string;
  amountMinor?: number;
  /** When the provider says the event happened; drives the replay-window check. */
  occurredAt?: Date;
  raw: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
}

export interface RefundResult {
  status: 'succeeded' | 'pending' | 'failed';
  providerRefundId?: string;
}

export interface PaymentProvider {
  key: ProviderKey;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  /** Verify a webhook's authenticity from the RAW body + headers/query. */
  verifyWebhook(rawBody: string, headers: Record<string, string>, query: Record<string, string>): Promise<WebhookVerification>;
  parseEvent(payload: unknown): ParsedPaymentEvent;
  refund(input: RefundInput): Promise<RefundResult>;
  /**
   * Ask the provider for the final state of an order's transaction — reconciliation of
   * intents whose webhook never arrived. Optional: COD and manual transfer have no remote
   * truth to ask. `null` means the provider knows of no transaction (yet).
   */
  inquire?(orderId: string): Promise<ParsedPaymentEvent | null>;
}
