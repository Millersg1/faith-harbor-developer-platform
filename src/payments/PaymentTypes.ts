/**
 * The lifecycle of a payment.
 *
 * pending  — a checkout link was created; awaiting payment.
 * paid     — Stripe confirmed the payment (via webhook).
 * failed   — the payment attempt failed.
 */
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed";

/**
 * The payment provider used.
 */
export type PaymentProvider =
  | "stripe"
  | "paypal";

/**
 * A stored record of a payment attempt against an invoice.
 */
export interface PaymentRecord {
  id: string;
  invoiceId: string;
  clientId: string;

  /**
   * Which provider processed (or is processing) this payment.
   */
  provider: PaymentProvider;

  /**
   * Amount in the smallest currency unit is not stored; the human
   * amount is kept for reporting, matching the invoice total.
   */
  amount: number;
  currency: string;

  status: PaymentStatus;

  /**
   * The Stripe Checkout Session id, when created.
   */
  sessionId?: string;

  /**
   * The Stripe-hosted checkout URL the customer pays through.
   */
  checkoutUrl?: string;

  createdAt: string;
  paidAt?: string;
}

/**
 * Which payment providers are configured.
 */
export interface PaymentIntegrationStatus {
  /**
   * True when at least one provider is connected.
   */
  connected: boolean;
  stripe: boolean;
  paypal: boolean;
  message: string;
}
