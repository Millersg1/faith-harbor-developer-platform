import type {
  CheckoutInput,
  CheckoutResult,
} from "./StripeGateway";

/**
 * Minimal fetch contract so the gateway can be tested with a stub.
 */
export interface PayPalFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type PayPalFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<PayPalFetchResponse>;

export interface PayPalConfig {
  clientId: string;
  secret: string;
  environment?: "live" | "sandbox";

  /**
   * Optional merchant email to receive the funds. Must belong to the
   * same PayPal account as the API credentials (funds go to the
   * credentials' account regardless; this makes the destination
   * explicit). When omitted, funds go to the credentials' account.
   */
  payeeEmail?: string;
}

/**
 * The outcome of capturing a PayPal order.
 */
export interface CaptureResult {
  completed: boolean;
  invoiceId?: string;
  status: string;
}

/**
 * Collects payments through PayPal.
 *
 * Uses the PayPal REST API with the built-in fetch — no PayPal SDK,
 * so nothing extra installs on the server. The flow is: create an
 * order (returns an approval URL the payer visits), then capture the
 * order when the payer returns.
 */
export interface PayPalGateway {
  isConnected(): boolean;

  createCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult>;

  captureOrder(
    orderId: string,
  ): Promise<CaptureResult>;
}

/**
 * The default when no PayPal credentials are configured.
 */
export class DisconnectedPayPalGateway
  implements PayPalGateway
{
  isConnected(): boolean {
    return false;
  }

  async createCheckout(
    _input: CheckoutInput,
  ): Promise<CheckoutResult> {
    throw new Error(
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_SECRET to accept PayPal payments.",
    );
  }

  async captureOrder(
    _orderId: string,
  ): Promise<CaptureResult> {
    return {
      completed: false,
      status: "NOT_CONFIGURED",
    };
  }
}

/**
 * The live PayPal gateway.
 */
export class HttpPayPalGateway
  implements PayPalGateway
{
  private readonly base: string;

  constructor(
    private readonly config: PayPalConfig,
    private readonly fetchFn: PayPalFetch =
      globalThis.fetch as unknown as PayPalFetch,
  ) {
    this.base =
      config.environment === "sandbox"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";
  }

  isConnected(): boolean {
    return true;
  }

  async createCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    const token =
      await this.accessToken();

    const body = JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.invoiceId,
          description:
            input.description.slice(
              0,
              127,
            ),
          amount: {
            currency_code:
              input.currency.toUpperCase(),
            value:
              input.amount.toFixed(2),
          },
          ...(this.config
            .payeeEmail
            ? {
                payee: {
                  email_address:
                    this.config
                      .payeeEmail,
                },
              }
            : {}),
        },
      ],
      application_context: {
        return_url:
          input.successUrl,
        cancel_url:
          input.cancelUrl,
        shipping_preference:
          "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    });

    const response =
      await this.fetchFn(
        `${this.base}/v2/checkout/orders`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },
          body,
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `PayPal order creation failed (status ${response.status}).`,
      );
    }

    const order = JSON.parse(
      text,
    ) as {
      id?: string;
      links?: {
        rel: string;
        href: string;
      }[];
    };

    const approve =
      order.links?.find(
        (link) =>
          link.rel === "approve",
      );

    if (
      !order.id ||
      !approve?.href
    ) {
      throw new Error(
        "PayPal did not return an approval link.",
      );
    }

    return {
      id: order.id,
      url: approve.href,
    };
  }

  async captureOrder(
    orderId: string,
  ): Promise<CaptureResult> {
    const token =
      await this.accessToken();

    const response =
      await this.fetchFn(
        `${this.base}/v2/checkout/orders/${orderId}/capture`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      return {
        completed: false,
        status: `HTTP_${response.status}`,
      };
    }

    const result = JSON.parse(
      text,
    ) as {
      status?: string;
      purchase_units?: {
        custom_id?: string;
        payments?: {
          captures?: {
            custom_id?: string;
          }[];
        };
      }[];
    };

    const unit =
      result.purchase_units?.[0];

    const invoiceId =
      unit?.custom_id ??
      unit?.payments?.captures?.[0]
        ?.custom_id;

    return {
      completed:
        result.status ===
        "COMPLETED",
      invoiceId,
      status:
        result.status ?? "UNKNOWN",
    };
  }

  /**
   * Fetches an OAuth access token via client credentials.
   */
  private async accessToken(): Promise<string> {
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.secret}`,
      "utf8",
    ).toString("base64");

    const response =
      await this.fetchFn(
        `${this.base}/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `PayPal authentication failed (status ${response.status}).`,
      );
    }

    const data = JSON.parse(
      text,
    ) as {
      access_token?: string;
    };

    if (!data.access_token) {
      throw new Error(
        "PayPal did not return an access token.",
      );
    }

    return data.access_token;
  }
}
