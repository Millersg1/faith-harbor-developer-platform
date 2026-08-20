/**
 * Deterministic in-memory Stripe for saga tests. Lets a test script capture,
 * amount/currency, refund outcomes, and webhook validity — including the unsafe
 * cases (browser-return-without-webhook, forged signature, duplicate events,
 * refund failure).
 */

import type {
  CheckoutResult,
  DomainStripeGateway,
  OffSessionChargeInput,
  OneTimeCheckoutInput,
  PaymentIntentView,
  RefundInput,
  RefundView,
} from "./DomainStripeGateway";

export class FakeDomainStripeGateway implements DomainStripeGateway {
  readonly testMode = true;
  private checkouts = new Map<string, OneTimeCheckoutInput>();
  private paymentIntents = new Map<string, PaymentIntentView>();
  private refunds = new Map<string, RefundView>();
  /** idempotencyKey -> refundId, to model deterministic idempotent refunds. */
  private refundByIdem = new Map<string, string>();
  private validSignature = true;
  private seq = 0;

  setSignatureValid(v: boolean): void {
    this.validSignature = v;
  }

  async createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<CheckoutResult> {
    // Idempotent: same key returns the same session.
    for (const [id, c] of this.checkouts) {
      if (c.idempotencyKey === input.idempotencyKey) {
        return { id, url: `https://checkout.test/${id}` };
      }
    }
    const id = `cs_test_${++this.seq}`;
    this.checkouts.set(id, input);
    // Model the PaymentIntent that a successful payment would produce.
    const pi = `pi_test_${id}`;
    this.paymentIntents.set(pi, {
      id: pi,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "requires_payment_method",
      chargeId: `ch_test_${id}`,
    });
    return { id, url: `https://checkout.test/${id}` };
  }

  /** Test helper: simulate the customer paying (PI becomes succeeded). */
  markPaid(checkoutId: string): { paymentIntentId: string } {
    const pi = `pi_test_${checkoutId}`;
    const v = this.paymentIntents.get(pi);
    if (!v) throw new Error("unknown checkout");
    v.status = "succeeded";
    return { paymentIntentId: pi };
  }

  /** Test helper: override a PI's amount/currency to model mismatches. */
  tamperPaymentIntent(piId: string, patch: Partial<PaymentIntentView>): void {
    const v = this.paymentIntents.get(piId);
    if (v) Object.assign(v, patch);
  }

  /** Scriptable off-session outcome (default: succeeds). */
  private offSessionStatus: "succeeded" | "requires_action" | "failed" = "succeeded";
  setOffSessionResult(status: "succeeded" | "requires_action" | "failed"): void {
    this.offSessionStatus = status;
  }

  async chargeOffSession(input: OffSessionChargeInput): Promise<PaymentIntentView> {
    // Idempotent: same key returns the same PaymentIntent.
    for (const v of this.paymentIntents.values()) {
      if ((v as PaymentIntentView & { _idem?: string })._idem === input.idempotencyKey) {
        return { ...v };
      }
    }
    const id = `pi_offs_${++this.seq}`;
    const view: PaymentIntentView & { _idem?: string } = {
      id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: this.offSessionStatus,
      chargeId: this.offSessionStatus === "succeeded" ? `ch_offs_${id}` : undefined,
      _idem: input.idempotencyKey,
    };
    this.paymentIntents.set(id, view);
    return { ...view };
  }

  verifyWebhook(): boolean {
    return this.validSignature;
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentView> {
    const v = this.paymentIntents.get(id);
    if (!v) throw new Error("no such payment intent");
    return { ...v };
  }

  async createRefund(input: RefundInput): Promise<RefundView> {
    const existing = this.refundByIdem.get(input.idempotencyKey);
    if (existing) return { ...this.refunds.get(existing)! };
    const id = `re_test_${++this.seq}`;
    const status = input.amountMinor <= 0 ? "failed" : "pending";
    const view = { id, status };
    this.refunds.set(id, view);
    this.refundByIdem.set(input.idempotencyKey, id);
    return { ...view };
  }

  /** Test helper: advance a refund to a terminal Stripe state. */
  settleRefund(refundId: string, status: "succeeded" | "failed"): void {
    const v = this.refunds.get(refundId);
    if (v) v.status = status;
  }

  async getRefund(id: string): Promise<RefundView> {
    const v = this.refunds.get(id);
    if (!v) throw new Error("no such refund");
    return { ...v };
  }
}
