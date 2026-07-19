import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

/**
 * Minimal fetch contract so the gateway can be tested with a stub.
 */
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
 * Details needed to create a hosted checkout.
 */
export interface CheckoutInput {
  amount: number;
  currency: string;
  description: string;
  invoiceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  id: string;
  url: string;
}

/**
 * Collects card payments through Stripe.
 *
 * Requests are made against the Stripe REST API with the built-in
 * fetch, and webhook signatures are verified with node:crypto — no
 * Stripe SDK dependency, so nothing extra installs on the server.
 */
export interface StripeGateway {
  isConnected(): boolean;

  createCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult>;

  /**
   * Verifies a Stripe webhook signature against the raw request body.
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
}

/**
 * The default when no Stripe key is configured. Reports "not
 * connected" and refuses to create checkouts, rather than pretending.
 */
export class DisconnectedStripeGateway
  implements StripeGateway
{
  isConnected(): boolean {
    return false;
  }

  async createCheckout(
    _input: CheckoutInput,
  ): Promise<CheckoutResult> {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to accept payments.",
    );
  }

  verifyWebhook(
    _rawBody: string,
    _signatureHeader: string | undefined,
  ): boolean {
    return false;
  }
}

/**
 * The live Stripe gateway.
 */
export class HttpStripeGateway
  implements StripeGateway
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

  async createCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    // Stripe amounts are in the smallest currency unit (cents).
    const unitAmount = Math.round(
      input.amount * 100,
    );

    const form = encodeForm({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id:
        input.invoiceId,
      "metadata[invoiceId]":
        input.invoiceId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]":
        input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]":
        String(unitAmount),
      "line_items[0][price_data][product_data][name]":
        input.description,
    });

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
          body: form,
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
    const age =
      Math.abs(
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

    const expectedBuffer =
      Buffer.from(expected, "utf8");

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

/**
 * Encodes a flat map as application/x-www-form-urlencoded.
 */
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
