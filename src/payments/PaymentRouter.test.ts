import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

describe("PaymentRouter", () => {
  it("reports Stripe as not connected by default", async () => {
    const app = createApp();

    const response = await request(
      app,
    ).get(
      "/api/v1/payments/status",
    );

    expect(response.status).toBe(200);
    expect(response.body.connected)
      .toBe(false);
  });

  it("cannot create a checkout without Stripe configured", async () => {
    const app = createApp();

    const client = await request(app)
      .post("/api/v1/clients")
      .send({
        companyName: "Grace Chapel",
        primaryContact:
          "Pastor John",
      });

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId: client.body.id,
        status: "sent",
        lineItems: [
          {
            description: "Work",
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });

    const response = await request(
      app,
    ).post(
      `/api/v1/payments/invoices/${invoice.body.id}/checkout`,
    );

    // Not configured (or missing APP_URL) — either way, not created.
    expect(
      response.status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("rejects a webhook with no valid signature", async () => {
    const app = createApp();

    const response = await request(
      app,
    )
      .post("/webhooks/stripe")
      .set(
        "Content-Type",
        "application/json",
      )
      .send({
        type: "checkout.session.completed",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code)
      .toBe("WEBHOOK_REJECTED");
  });
});
