import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

/**
 * Collects recurring subscription payments through Stripe Checkout.
 *
 * Deliberately separate from the legacy `src/payments/StripeGateway.ts`
 * (which does one-off `mode: "payment"` charges for the single-tenant app):
 * this is the platform's own subscription gateway, so standing it up never
 * touches production. Like the legacy one it talks to the Stripe REST API
 * with the built-in fetch and verifies webhook signatures with node:crypto —
 * no Stripe SDK, so nothing extra installs on the server.
 */

export interface SubscriptionCheckoutInput {
  /** The organization the subscription is for (our tenant id). */
  organizationId: string;
  /** Which plan is being purchased. */
  planId: string;
  /** Human-readable plan name shown on the Stripe checkout page. */
  planName: string;
  /** Monthly price in the smallest currency unit (cents). */
  amountCents: number;
  /** ISO currency, e.g. "usd". */
  currency: string;
  /** Pre-fills the email on the checkout page when known. */
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

export interface StripeSubscriptionGateway {
  isConnected(): boolean;

  createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutResult>;

  /**
   * Verifies a Stripe webhook signature against the raw request body.
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean;
}

/**
 * The default when no Stripe key is configured. Reports "not connected" and
 * refuses to create checkouts, rather than pretending.
 */
export class DisconnectedStripeSubscriptionGateway
  implements StripeSubscriptionGateway
{
  isConnected(): boolean {
    return false;
  }

  async createSubscriptionCheckout(
    _input: SubscriptionCheckoutInput,
  ): Promise<CheckoutResult> {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to accept subscriptions.",
    );
  }

  verifyWebhook(
    _rawBody: string,
    _signatureHeader: string | undefined,
  ): boolean {
    return false;
  }
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
}

export interface StripeFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type StripeFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<StripeFetchResponse>;

/**
 * The live subscription gateway.
 */
export class HttpStripeSubscriptionGateway
  implements StripeSubscriptionGateway
{
  constructor(
    private readonly config: StripeConfig,
    private readonly fetchFn: StripeFetch =
      globalThis.fetch as unknown as StripeFetch,
    private readonly now: () => number = () =>
      Date.now(),
  ) {}

  isConnected(): boolean {
    return true;
  }

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<CheckoutResult> {
    // A subscription-mode Checkout Session with an inline recurring price,
    // so plans don't have to be pre-created in the Stripe dashboard. The
    // organization id rides along as metadata (and client_reference_id) so
    // the webhook can map the completed payment back to our tenant.
    const fields: Record<string, string> =
      {
        mode: "subscription",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id:
          input.organizationId,
        "metadata[organizationId]":
          input.organizationId,
        "metadata[planId]":
          input.planId,
        "subscription_data[metadata][organizationId]":
          input.organizationId,
        "subscription_data[metadata][planId]":
          input.planId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]":
          input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]":
          String(input.amountCents),
        "line_items[0][price_data][recurring][interval]":
          "month",
        "line_items[0][price_data][product_data][name]":
          input.planName,
      };

    if (input.customerEmail) {
      fields.customer_email =
        input.customerEmail;
    }

    const response =
      await this.fetchFn(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.secretKey}`,
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: encodeForm(fields),
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Stripe checkout failed (status ${response.status}).`,
      );
    }

    const session = JSON.parse(
      text,
    ) as {
      id?: string;
      url?: string;
    };

    if (!session.id || !session.url) {
      throw new Error(
        "Stripe did not return a checkout URL.",
      );
    }

    return {
      id: session.id,
      url: session.url,
    };
  }

  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean {
    const secret =
      this.config.webhookSecret;

    if (!secret || !signatureHeader) {
      return false;
    }

    const parts =
      signatureHeader.split(",");

    let timestamp = "";
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] =
        part.split("=");

      if (key === "t") {
        timestamp = value;
      } else if (key === "v1") {
        signatures.push(value);
      }
    }

    if (
      !timestamp ||
      signatures.length === 0
    ) {
      return false;
    }

    // Reject signatures older than five minutes.
    const age = Math.abs(
      this.now() / 1000 -
        Number(timestamp),
    );

    if (
      !Number.isFinite(age) ||
      age > 300
    ) {
      return false;
    }

    const expected = createHmac(
      "sha256",
      secret,
    )
      .update(
        `${timestamp}.${rawBody}`,
      )
      .digest("hex");

    const expectedBuffer = Buffer.from(
      expected,
      "utf8",
    );

    return signatures.some(
      (candidate) => {
        const candidateBuffer =
          Buffer.from(
            candidate,
            "utf8",
          );

        return (
          candidateBuffer.length ===
            expectedBuffer.length &&
          timingSafeEqual(
            candidateBuffer,
            expectedBuffer,
          )
        );
      },
    );
  }
}

function encodeForm(
  fields: Record<string, string>,
): string {
  return Object.entries(fields)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}
