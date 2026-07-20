import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DisconnectedPayPalGateway,
  HttpPayPalGateway,
  type PayPalFetch,
} from "./PayPalGateway";

/**
 * A fetch stub that answers PayPal's OAuth, create-order, and capture
 * endpoints. Records the create-order body for assertions.
 */
function stubFetch(options: {
  captureStatus?: string;
}): {
  fetch: PayPalFetch;
  calls: {
    orderBody?: string;
  };
} {
  const calls: {
    orderBody?: string;
  } = {};

  const fetch: PayPalFetch = async (
    url,
    init,
  ) => {
    if (
      url.includes(
        "/v1/oauth2/token",
      )
    ) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "tok-123",
          }),
      };
    }

    if (
      url.endsWith("/capture")
    ) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status:
              options.captureStatus ??
              "COMPLETED",
            purchase_units: [
              {
                custom_id: "inv-1",
              },
            ],
          }),
      };
    }

    // create order
    calls.orderBody = init.body;

    return {
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: "ORDER-1",
          links: [
            {
              rel: "self",
              href: "https://api/self",
            },
            {
              rel: "approve",
              href: "https://www.paypal.com/checkoutnow?token=ORDER-1",
            },
          ],
        }),
    };
  };

  return { fetch, calls };
}

const input = {
  amount: 250,
  currency: "USD",
  description: "Invoice INV-0001",
  invoiceId: "inv-1",
  successUrl: "https://app/return",
  cancelUrl: "https://app/cancel",
};

describe("HttpPayPalGateway", () => {
  it("creates an order and returns the approval URL", async () => {
    const { fetch, calls } =
      stubFetch({});

    const gateway =
      new HttpPayPalGateway(
        {
          clientId: "id",
          secret: "secret",
          environment: "sandbox",
        },
        fetch,
      );

    const result =
      await gateway.createCheckout(
        input,
      );

    expect(result.id).toBe(
      "ORDER-1",
    );
    expect(result.url).toContain(
      "paypal.com/checkoutnow",
    );

    // The order carries the amount and links the invoice.
    const body = JSON.parse(
      calls.orderBody as string,
    );
    expect(
      body.purchase_units[0].amount
        .value,
    ).toBe("250.00");
    expect(
      body.purchase_units[0]
        .custom_id,
    ).toBe("inv-1");
  });

  it("directs funds to the configured payee", async () => {
    const { fetch, calls } =
      stubFetch({});

    const gateway =
      new HttpPayPalGateway(
        {
          clientId: "id",
          secret: "secret",
          payeeEmail:
            "shawn@fhws.co",
        },
        fetch,
      );

    await gateway.createCheckout(
      input,
    );

    const body = JSON.parse(
      calls.orderBody as string,
    );
    expect(
      body.purchase_units[0].payee
        .email_address,
    ).toBe("shawn@fhws.co");
  });

  it("captures a completed order", async () => {
    const { fetch } = stubFetch({
      captureStatus: "COMPLETED",
    });

    const gateway =
      new HttpPayPalGateway(
        {
          clientId: "id",
          secret: "secret",
        },
        fetch,
      );

    const result =
      await gateway.captureOrder(
        "ORDER-1",
      );

    expect(result.completed).toBe(
      true,
    );
    expect(result.invoiceId).toBe(
      "inv-1",
    );
  });

  it("reports an uncompleted capture", async () => {
    const { fetch } = stubFetch({
      captureStatus: "PENDING",
    });

    const result =
      await new HttpPayPalGateway(
        {
          clientId: "id",
          secret: "secret",
        },
        fetch,
      ).captureOrder("ORDER-1");

    expect(result.completed).toBe(
      false,
    );
  });
});

describe("DisconnectedPayPalGateway", () => {
  it("is not connected and refuses checkout", async () => {
    const gateway =
      new DisconnectedPayPalGateway();

    expect(gateway.isConnected())
      .toBe(false);

    await expect(
      gateway.createCheckout(input),
    ).rejects.toThrow(
      "not configured",
    );

    const capture =
      await gateway.captureOrder(
        "x",
      );
    expect(capture.completed).toBe(
      false,
    );
  });
});
