/**
 * Stripe boundary for the domain purchase saga — TEST MODE only in this stage.
 *
 * The saga never trusts the browser: it creates the Checkout server-side with a
 * server-computed amount + server identifiers, verifies the webhook signature
 * against the RAW body, and re-reads the PaymentIntent from Stripe to confirm
 * amount/currency/status before any fulfillment. Refunds use deterministic
 * idempotency keys and are only considered done once Stripe confirms.
 *
 * A fake implementation backs deterministic tests; the HTTP implementation
 * mirrors the platform's existing Stripe conventions (form-encoded POST, manual
 * HMAC-SHA256 webhook verification) and is exercised only against Stripe test
 * keys (never in unit tests).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface OneTimeCheckoutInput {
  orderId: string;
  organizationId: string;
  userId: string;
  quoteId: string;
  amountMinor: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  /** Deterministic idempotency key (per order/attempt). */
  idempotencyKey: string;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

export interface PaymentIntentView {
  id: string;
  amountMinor: number;
  currency: string;
  status: string; // "succeeded" | "requires_payment_method" | ...
  chargeId?: string;
}

export interface RefundInput {
  chargeId: string;
  amountMinor: number;
  reason: string;
  /** Deterministic idempotency key (per captured payment + reason). */
  idempotencyKey: string;
}

export interface RefundView {
  id: string;
  status: string; // "pending" | "succeeded" | "failed"
}

export interface DomainStripeGateway {
  readonly testMode: boolean;
  createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(rawBody: string, signatureHeader: string): boolean;
  getPaymentIntent(id: string): Promise<PaymentIntentView>;
  createRefund(input: RefundInput): Promise<RefundView>;
  getRefund(id: string): Promise<RefundView>;
}

/** Refuses everything — the safe default when Stripe is unconfigured. */
export class DisconnectedDomainStripeGateway implements DomainStripeGateway {
  readonly testMode = true;
  private fail(): never {
    throw new Error("Stripe is not configured (test mode).");
  }
  createOneTimeCheckout(): Promise<CheckoutResult> { return this.fail(); }
  verifyWebhook(): boolean { return false; }
  getPaymentIntent(): Promise<PaymentIntentView> { return this.fail(); }
  createRefund(): Promise<RefundView> { return this.fail(); }
  getRefund(): Promise<RefundView> { return this.fail(); }
}

/**
 * HTTP Stripe (test mode). Uses the same manual HMAC verification the platform's
 * subscription gateway uses. Only ever constructed with a TEST secret key.
 */
export class HttpDomainStripeGateway implements DomainStripeGateway {
  readonly testMode = true;
  constructor(
    private readonly config: { secretKey: string; webhookSecret: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^sk_test_/.test(config.secretKey)) {
      throw new Error("Domain Stripe gateway requires a TEST secret key (sk_test_).");
    }
  }

  private async post(path: string, form: Record<string, string>, idem?: string) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (idem) headers["Idempotency-Key"] = idem;
    const res = await this.fetcher(`https://api.stripe.com${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}.`);
    return (await res.json()) as Record<string, unknown>;
  }

  async createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<CheckoutResult> {
    const j = await this.post(
      "/v1/checkout/sessions",
      {
        mode: "payment",
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][product_data][name]": input.productName,
        "line_items[0][price_data][unit_amount]": String(input.amountMinor),
        "line_items[0][quantity]": "1",
        client_reference_id: input.orderId,
        "metadata[orderId]": input.orderId,
        "metadata[organizationId]": input.organizationId,
        "metadata[quoteId]": input.quoteId,
        "payment_intent_data[metadata][orderId]": input.orderId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      },
      input.idempotencyKey,
    );
    return { id: String(j.id), url: String(j.url) };
  }

  verifyWebhook(rawBody: string, signatureHeader: string): boolean {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]),
    );
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentView> {
    const res = await this.fetcher(`https://api.stripe.com/v1/payment_intents/${id}`, {
      headers: { Authorization: `Bearer ${this.config.secretKey}` },
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}.`);
    const j = (await res.json()) as Record<string, unknown>;
    return {
      id: String(j.id),
      amountMinor: Number(j.amount),
      currency: String(j.currency).toUpperCase(),
      status: String(j.status),
      chargeId: j.latest_charge ? String(j.latest_charge) : undefined,
    };
  }

  async createRefund(input: RefundInput): Promise<RefundView> {
    const j = await this.post(
      "/v1/refunds",
      { charge: input.chargeId, amount: String(input.amountMinor) },
      input.idempotencyKey,
    );
    return { id: String(j.id), status: String(j.status) };
  }

  async getRefund(id: string): Promise<RefundView> {
    const res = await this.fetcher(`https://api.stripe.com/v1/refunds/${id}`, {
      headers: { Authorization: `Bearer ${this.config.secretKey}` },
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}.`);
    const j = (await res.json()) as Record<string, unknown>;
    return { id: String(j.id), status: String(j.status) };
  }
}
