import { createHmac } from "node:crypto";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  DisconnectedStripeGateway,
  HttpStripeGateway,
  type StripeFetch,
} from "./StripeGateway";

describe("HttpStripeGateway", () => {
  it("creates a checkout session", async () => {
    const fetchFn: StripeFetch =
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "cs_123",
            url: "https://checkout.stripe.com/pay/cs_123",
          }),
      }));

    const gateway =
      new HttpStripeGateway(
        { secretKey: "sk_test" },
        fetchFn,
      );

    const result =
      await gateway.createCheckout({
        amount: 250,
        currency: "USD",
        description: "Invoice INV-0001",
        invoiceId: "inv-1",
        successUrl:
          "https://app.example/ok",
        cancelUrl:
          "https://app.example/no",
      });

    expect(result.url)
      .toContain("checkout.stripe.com");

    const [url, init] = (
      fetchFn as unknown as {
        mock: {
          calls: [
            string,
            {
              body: string;
              headers: Record<
                string,
                string
              >;
            },
          ][];
        };
      }
    ).mock.calls[0];

    expect(url).toContain(
      "/v1/checkout/sessions",
    );
    // 250 dollars -> 25000 cents (form keys are URL-encoded).
    expect(
      decodeURIComponent(init.body),
    ).toContain(
      "[unit_amount]=25000",
    );
    expect(init.body).toContain(
      "client_reference_id=inv-1",
    );
    expect(init.headers.Authorization)
      .toBe("Bearer sk_test");
  });

  it("throws when Stripe returns an error", async () => {
    const gateway =
      new HttpStripeGateway(
        { secretKey: "sk_test" },
        async () => ({
          ok: false,
          status: 402,
          text: async () => "{}",
        }),
      );

    await expect(
      gateway.createCheckout({
        amount: 10,
        currency: "usd",
        description: "x",
        invoiceId: "i",
        successUrl: "u",
        cancelUrl: "u",
      }),
    ).rejects.toThrow(
      "Stripe checkout failed",
    );
  });

  it("verifies a valid webhook signature", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({
      type: "checkout.session.completed",
    });
    const t = 1_700_000_000;

    const signature = createHmac(
      "sha256",
      secret,
    )
      .update(`${t}.${body}`)
      .digest("hex");

    const gateway =
      new HttpStripeGateway(
        {
          secretKey: "sk",
          webhookSecret: secret,
        },
        (async () => ({
          ok: true,
          status: 200,
          text: async () => "",
        })) as StripeFetch,
        () => t * 1000,
      );

    expect(
      gateway.verifyWebhook(
        body,
        `t=${t},v1=${signature}`,
      ),
    ).toBe(true);
  });

  it("rejects a forged or stale signature", () => {
    const secret = "whsec_test";
    const body = "{}";
    const t = 1_700_000_000;

    const good = createHmac(
      "sha256",
      secret,
    )
      .update(`${t}.${body}`)
      .digest("hex");

    const nowAtT =
      new HttpStripeGateway(
        {
          secretKey: "sk",
          webhookSecret: secret,
        },
        (async () => ({
          ok: true,
          status: 200,
          text: async () => "",
        })) as StripeFetch,
        () => t * 1000,
      );

    // Forged signature.
    expect(
      nowAtT.verifyWebhook(
        body,
        `t=${t},v1=deadbeef`,
      ),
    ).toBe(false);

    // Valid signature but timestamp far in the past (replay).
    const nowMuchLater =
      new HttpStripeGateway(
        {
          secretKey: "sk",
          webhookSecret: secret,
        },
        (async () => ({
          ok: true,
          status: 200,
          text: async () => "",
        })) as StripeFetch,
        () => (t + 100_000) * 1000,
      );

    expect(
      nowMuchLater.verifyWebhook(
        body,
        `t=${t},v1=${good}`,
      ),
    ).toBe(false);
  });
});

describe("DisconnectedStripeGateway", () => {
  it("is not connected and refuses checkout", async () => {
    const gateway =
      new DisconnectedStripeGateway();

    expect(gateway.isConnected())
      .toBe(false);

    await expect(
      gateway.createCheckout({
        amount: 1,
        currency: "usd",
        description: "x",
        invoiceId: "i",
        successUrl: "u",
        cancelUrl: "u",
      }),
    ).rejects.toThrow(
      "not configured",
    );

    expect(
      gateway.verifyWebhook("", ""),
    ).toBe(false);
  });
});
