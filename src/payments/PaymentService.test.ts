import {
  describe,
  expect,
  it,
} from "vitest";

import { InvoiceService } from "../accounting/InvoiceService";
import { ClientService } from "../clients/ClientService";

import { PaymentRepository } from "./PaymentRepository";
import { PaymentService } from "./PaymentService";
import type {
  CheckoutInput,
  CheckoutResult,
  StripeGateway,
} from "./StripeGateway";

class FakeGateway
  implements StripeGateway
{
  public lastInput?: CheckoutInput;

  constructor(
    private readonly connected = true,
    private readonly verify = true,
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  async createCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    this.lastInput = input;

    return {
      id: "cs_test",
      url: "https://checkout.stripe.com/pay/cs_test",
    };
  }

  verifyWebhook(): boolean {
    return this.verify;
  }
}

function setup(
  gateway: StripeGateway =
    new FakeGateway(),
  baseUrl = "https://app.example",
) {
  const clients =
    new ClientService();

  const invoices =
    new InvoiceService(clients);

  const client = clients.create({
    companyName: "Grace Chapel",
    primaryContact: "Pastor John",
  });

  const invoice = invoices.create({
    clientId: client.id,
    status: "sent",
    lineItems: [
      {
        description: "Website",
        quantity: 1,
        unitPrice: 250,
      },
    ],
  });

  const payments =
    new PaymentService(
      invoices,
      gateway,
      new PaymentRepository(),
      baseUrl,
    );

  return {
    payments,
    invoices,
    invoice,
  };
}

describe("PaymentService", () => {
  it("creates a checkout link for an invoice", async () => {
    const gateway = new FakeGateway();
    const { payments, invoice } =
      setup(gateway);

    const record =
      await payments.createCheckout(
        invoice.id,
      );

    expect(record.status)
      .toBe("pending");
    expect(record.checkoutUrl)
      .toContain("checkout.stripe.com");
    expect(gateway.lastInput?.amount)
      .toBe(250);
    expect(
      gateway.lastInput?.successUrl,
    ).toContain("app.example");
  });

  it("marks the invoice paid on a completed checkout webhook", async () => {
    const { payments, invoices, invoice } =
      setup();

    await payments.createCheckout(
      invoice.id,
    );

    const event = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id:
            invoice.id,
        },
      },
    });

    const result =
      payments.handleWebhook(
        event,
        "sig",
      );

    expect(result.handled).toBe(true);
    expect(
      invoices.get(invoice.id)
        .status,
    ).toBe("paid");
  });

  it("rejects a webhook with an invalid signature", () => {
    const { payments } = setup(
      new FakeGateway(true, false),
    );

    const result =
      payments.handleWebhook(
        "{}",
        "bad",
      );

    expect(result.handled).toBe(false);
    expect(result.reason)
      .toBe("invalid signature");
  });

  it("refuses to charge an already-paid invoice", async () => {
    const { payments, invoices, invoice } =
      setup();

    invoices.update({
      ...invoice,
      status: "paid",
    });

    await expect(
      payments.createCheckout(
        invoice.id,
      ),
    ).rejects.toThrow(
      "already paid",
    );
  });

  it("requires APP_URL", async () => {
    const { payments, invoice } =
      setup(new FakeGateway(), "");

    await expect(
      payments.createCheckout(
        invoice.id,
      ),
    ).rejects.toThrow("APP_URL");
  });

  it("reports connection status", () => {
    const connected = setup(
      new FakeGateway(true),
    );

    expect(
      connected.payments
        .integrationStatus()
        .connected,
    ).toBe(true);

    const disconnected = setup(
      new FakeGateway(false),
    );

    expect(
      disconnected.payments
        .integrationStatus()
        .connected,
    ).toBe(false);
  });
});

describe("PaymentService (PayPal)", () => {
  it("creates a PayPal checkout and marks the invoice paid on capture", async () => {
    const clients =
      new ClientService();
    const invoices =
      new InvoiceService(clients);
    const client = clients.create({
      companyName: "Grace Chapel",
      primaryContact: "Pastor John",
    });
    const invoice =
      invoices.create({
        clientId: client.id,
        status: "sent",
        lineItems: [
          {
            description: "Work",
            quantity: 1,
            unitPrice: 250,
          },
        ],
      });

    const paypal = {
      isConnected: () => true,
      createCheckout: async () => ({
        id: "ORDER-1",
        url: "https://paypal/checkout/ORDER-1",
      }),
      captureOrder: async () => ({
        completed: true,
        invoiceId: invoice.id,
        status: "COMPLETED",
      }),
    };

    const payments =
      new PaymentService(
        invoices,
        new FakeGateway(false),
        new PaymentRepository(),
        "https://app.example",
        paypal,
      );

    const record =
      await payments.createCheckout(
        invoice.id,
        "paypal",
      );

    expect(record.provider).toBe(
      "paypal",
    );
    expect(record.checkoutUrl)
      .toContain("paypal");

    const outcome =
      await payments.capturePayPalReturn(
        "ORDER-1",
      );

    expect(outcome.completed).toBe(
      true,
    );
    expect(
      invoices.get(invoice.id)
        .status,
    ).toBe("paid");
  });

  it("does not mark paid when capture is not completed", async () => {
    const clients =
      new ClientService();
    const invoices =
      new InvoiceService(clients);
    const client = clients.create({
      companyName: "Grace Chapel",
      primaryContact: "Pastor John",
    });
    const invoice =
      invoices.create({
        clientId: client.id,
        status: "sent",
        lineItems: [
          {
            description: "Work",
            quantity: 1,
            unitPrice: 250,
          },
        ],
      });

    const paypal = {
      isConnected: () => true,
      createCheckout: async () => ({
        id: "ORDER-2",
        url: "https://paypal/checkout/ORDER-2",
      }),
      captureOrder: async () => ({
        completed: false,
        status: "PENDING",
      }),
    };

    const payments =
      new PaymentService(
        invoices,
        new FakeGateway(false),
        new PaymentRepository(),
        "https://app.example",
        paypal,
      );

    await payments.createCheckout(
      invoice.id,
      "paypal",
    );

    const outcome =
      await payments.capturePayPalReturn(
        "ORDER-2",
      );

    expect(outcome.completed).toBe(
      false,
    );
    expect(
      invoices.get(invoice.id)
        .status,
    ).toBe("sent");
  });

  it("shows both providers in status", () => {
    const clients =
      new ClientService();
    const invoices =
      new InvoiceService(clients);

    const payments =
      new PaymentService(
        invoices,
        new FakeGateway(true),
        new PaymentRepository(),
        "https://app.example",
        {
          isConnected: () => true,
          createCheckout:
            async () => ({
              id: "x",
              url: "u",
            }),
          captureOrder:
            async () => ({
              completed: false,
              status: "x",
            }),
        },
      );

    const status =
      payments.integrationStatus();

    expect(status.stripe).toBe(true);
    expect(status.paypal).toBe(true);
    expect(status.connected).toBe(
      true,
    );
  });
});
