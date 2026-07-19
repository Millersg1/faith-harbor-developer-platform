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
 * A stored record of a payment attempt against an invoice.
 */
export interface PaymentRecord {
  id: string;
  invoiceId: string;
  clientId: string;

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
 * Whether Stripe payments are configured.
 */
export interface PaymentIntegrationStatus {
  connected: boolean;
  message: string;
}
