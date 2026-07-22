import express from "express";
import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { createTenantMiddleware } from "../tenancy/tenantMiddleware";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApiRouter } from "./PlatformApiRouter";

async function buildApp() {
  const organizations =
    new OrganizationService();

  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );

  const app = express();
  app.use(express.json());
  app.use(
    createTenantMiddleware(
      organizations,
    ),
  );
  app.use(
    "/api/platform",
    createPlatformApiRouter({
      clients,
    }),
  );

  await organizations.create({
    name: "Acme",
    slug: "acme",
  });
  await organizations.create({
    name: "Beta",
    slug: "beta",
  });

  return app;
}

describe("Platform API tenant isolation (HTTP)", () => {
  it("scopes every request to the tenant in its host/header", async () => {
    const app = await buildApp();

    // Acme creates a client.
    const created = await request(app)
      .post("/api/platform/clients")
      .set("X-Org-Slug", "acme")
      .send({ name: "Alice" });
    expect(created.status).toBe(201);

    // Acme sees its client; Beta sees nothing.
    const acme = await request(app)
      .get("/api/platform/clients")
      .set("X-Org-Slug", "acme");
    expect(
      acme.body.clients,
    ).toHaveLength(1);

    const beta = await request(app)
      .get("/api/platform/clients")
      .set("X-Org-Slug", "beta");
    expect(
      beta.body.clients,
    ).toHaveLength(0);

    // Beta creates its own; the two never mix.
    await request(app)
      .post("/api/platform/clients")
      .set("X-Org-Slug", "beta")
      .send({ name: "Bob" })
      .expect(201);

    const acmeAgain = await request(
      app,
    )
      .get("/api/platform/clients")
      .set("X-Org-Slug", "acme");
    expect(
      acmeAgain.body.clients.map(
        (c: { name: string }) =>
          c.name,
      ),
    ).toEqual(["Alice"]);
  });

  it("rejects an unknown organization", async () => {
    const app = await buildApp();

    const res = await request(app)
      .get("/api/platform/clients")
      .set("X-Org-Slug", "nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(
      "UNKNOWN_ORG",
    );
  });

  it("rejects a request with no tenant", async () => {
    const app = await buildApp();

    const res = await request(
      app,
    ).get("/api/platform/clients");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(
      "NO_TENANT",
    );
  });

  it("validates the client body", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/platform/clients")
      .set("X-Org-Slug", "acme")
      .send({ email: "x@y.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(
      "INVALID_CLIENT",
    );
  });
});
