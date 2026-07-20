import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

describe("BrandRouter", () => {
  it("creates and lists brands", async () => {
    const app = createApp();

    const created = await request(
      app,
    )
      .post("/api/v1/brands")
      .send({
        name: "All Elite Hosting",
        domain:
          "allelitehosting.com",
        fromEmail:
          "hello@allelitehosting.com",
        emailSignature:
          "The All Elite Hosting Team",
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe(
      "All Elite Hosting",
    );

    const list = await request(
      app,
    ).get("/api/v1/brands");

    expect(list.body.count).toBe(1);
    expect(
      list.body.brands[0].fromEmail,
    ).toBe(
      "hello@allelitehosting.com",
    );
  });

  it("tags a client with a brand", async () => {
    const app = createApp();

    const brand = await request(app)
      .post("/api/v1/brands")
      .send({
        name: "Faith Harbor Web Hosting",
      });

    const client = await request(app)
      .post("/api/v1/clients")
      .send({
        companyName:
          "Grace Chapel",
        primaryContact:
          "Pastor John",
        brandId: brand.body.id,
      });

    expect(client.body.brandId).toBe(
      brand.body.id,
    );
  });

  it("updates a brand's signature and from-address in place", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/v1/brands")
      .send({
        name: "SaaS Surface",
        fromEmail: "hello@saassurface.com",
        emailSignature: "Old signature",
      });

    const id = created.body.id;

    const updated = await request(app)
      .put(`/api/v1/brands/${id}`)
      .send({
        name: "SaaS Surface",
        fromEmail: "hello@saassurface.com",
        emailSignature:
          "— The SaaS Surface Team",
      });

    expect(updated.status).toBe(200);
    expect(
      updated.body.emailSignature,
    ).toBe("— The SaaS Surface Team");

    // Persisted, not just echoed.
    const list = await request(app).get(
      "/api/v1/brands",
    );

    expect(
      list.body.brands[0].emailSignature,
    ).toBe("— The SaaS Surface Team");
    expect(
      list.body.brands[0].fromEmail,
    ).toBe("hello@saassurface.com");
  });

  it("rejects a brand with no name", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/v1/brands")
      .send({ domain: "x.com" });

    expect(res.status).toBe(400);
  });
});
