import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../../app";

describe("Public storefront", () => {
  it("serves the storefront page", async () => {
    const app = createApp();

    const res = await request(app).get(
      "/store",
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "html",
    );
    expect(res.text).toContain(
      "Web Hosting Plans",
    );
  });

  it("lists active shared plans publicly (no auth)", async () => {
    const app = createApp();

    const res = await request(app).get(
      "/api/public/hosting/plans?kind=shared",
    );

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(4);
    expect(
      res.body.plans[0].name,
    ).toBe("Starter NVMe");
  });

  it("accepts a signup and creates a pending order", async () => {
    const app = createApp();

    const res = await request(app)
      .post(
        "/api/public/hosting/signup",
      )
      .send({
        planSlug: "starter-nvme",
        domain: "newcustomer.com",
        firstName: "Pat",
        lastName: "Lee",
        email: "pat@newcustomer.com",
      });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeTruthy();
    expect(res.body.status).toBe(
      "pending",
    );
    // Payments are not connected under test, so no checkout URL.
    expect(
      res.body.checkoutUrl,
    ).toBeUndefined();

    // The customer became a client, and an order exists.
    const clients = await request(
      app,
    ).get("/api/v1/clients");
    expect(
      clients.body.clients.some(
        (c: { email?: string }) =>
          c.email ===
          "pat@newcustomer.com",
      ),
    ).toBe(true);
  });

  it("rejects an invalid signup", async () => {
    const app = createApp();

    const res = await request(app)
      .post(
        "/api/public/hosting/signup",
      )
      .send({
        planSlug: "starter-nvme",
        domain: "x.com",
        email: "not-an-email",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(
      "INVALID_SIGNUP",
    );
  });

  it("rejects an unknown plan", async () => {
    const app = createApp();

    const res = await request(app)
      .post(
        "/api/public/hosting/signup",
      )
      .send({
        planSlug: "does-not-exist",
        domain: "newcustomer.com",
        email: "pat@newcustomer.com",
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(
      "PLAN_NOT_FOUND",
    );
  });
});
