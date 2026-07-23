import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

function build() {
  const organizations =
    new OrganizationService();
  const users =
    new PlatformUserService(
      new PlatformUserRepository(),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(),
    );
  const branding =
    new BrandingService(
      new BrandingRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const projects =
    new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    );
  const invoices =
    new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    );
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  return createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    projects,
    invoices,
    signup,
    domains:
      new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
  });
}

describe("createPlatformApp (composition root)", () => {
  it("serves health", async () => {
    const app = build();

    const res =
      await request(app).get(
        "/health",
      );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(
      "ok",
    );
  });

  it("runs the full onboarding + tenant workflow end to end", async () => {
    const app = build();

    // 1. Sign up -> creates org + owner, auto-logs-in.
    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName:
          "Acme Cloud",
        email: "owner@acme.com",
        password: "password123",
      });
    expect(signup.status).toBe(201);
    const slug =
      signup.body.organization.slug;
    const cookie =
      signup.headers["set-cookie"];

    // 2. /me works with the session cookie.
    const me = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);
    expect(me.body.user.role).toBe(
      "owner",
    );

    // 3. Owner sets branding.
    const put = await request(app)
      .put("/api/platform/branding")
      .set("Cookie", cookie)
      .send({
        primaryColor: "#0a2540",
      });
    expect(put.status).toBe(200);

    // 4. Branding is publicly readable by subdomain slug.
    const brand = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", slug);
    expect(
      brand.body.branding
        .primaryColor,
    ).toBe("#0a2540");

    // 5. Authenticated tenant-scoped API: create + list a client.
    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "First Client" })
      .expect(201);

    const list = await request(app)
      .get("/api/platform/clients")
      .set("Cookie", cookie);
    expect(
      list.body.clients,
    ).toHaveLength(1);
  });

  it("manages projects and invoices for the tenant", async () => {
    const app = build();

    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "o@acme.com",
        password: "password123",
      });
    const cookie =
      signup.headers["set-cookie"];

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Client A" });
    const clientId =
      client.body.client.id;

    // Project referencing the client.
    const project = await request(app)
      .post("/api/platform/projects")
      .set("Cookie", cookie)
      .send({
        name: "Website",
        clientId,
      });
    expect(project.status).toBe(201);
    expect(
      project.body.project.clientId,
    ).toBe(clientId);

    // Invoice with a line item -> per-tenant number + computed amount.
    const invoice = await request(app)
      .post("/api/platform/invoices")
      .set("Cookie", cookie)
      .send({
        clientId,
        lineItems: [
          {
            description: "Design",
            quantity: 2,
            unitPrice: 100,
          },
        ],
      });
    expect(invoice.status).toBe(201);
    expect(
      invoice.body.invoice.number,
    ).toBe("INV-0001");
    expect(
      invoice.body.invoice.amount,
    ).toBe(200);

    // Cross-tenant reference guard surfaces as a 400.
    const bad = await request(app)
      .post("/api/platform/invoices")
      .set("Cookie", cookie)
      .send({
        clientId: "does-not-exist",
        lineItems: [
          {
            description: "x",
            quantity: 1,
            unitPrice: 1,
          },
        ],
      });
    expect(bad.status).toBe(400);

    const projects = await request(
      app,
    )
      .get("/api/platform/projects")
      .set("Cookie", cookie);
    expect(
      projects.body.projects,
    ).toHaveLength(1);
  });

  it("404s an unknown API route", async () => {
    const app = build();

    await request(app)
      .get("/api/nope")
      .expect(404);
  });

  it("serves the web UI pages as HTML", async () => {
    const app = build();

    const pages: Array<
      [string, string]
    > = [
      ["/", "AllEliteCloud"],
      ["/login", "Sign in"],
      [
        "/signup",
        "Create your organization",
      ],
      ["/app", "Dashboard"],
    ];

    for (const [
      path,
      needle,
    ] of pages) {
      const res = await request(
        app,
      ).get(path);

      expect(res.status).toBe(200);
      expect(
        res.headers["content-type"],
      ).toContain("html");
      expect(res.text).toContain(
        needle,
      );
    }
  });
});
