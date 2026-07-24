import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformHostingRepository } from "./hosting/PlatformHostingRepository";
import { PlatformHostingService } from "./hosting/PlatformHostingService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

async function build() {
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
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects:
      new PlatformProjectService(
        new PlatformProjectRepository(),
        clients,
      ),
    invoices:
      new PlatformInvoiceService(
        new PlatformInvoiceRepository(),
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
    hosting:
      new PlatformHostingService(
        new PlatformHostingRepository(),
        clients,
      ),
    billing: new BillingService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  async function signup(
    name: string,
    email: string,
  ): Promise<string[]> {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: name,
        email,
        password: "password123",
      });

    return res.headers[
      "set-cookie"
    ] as unknown as string[];
  }

  return { app, signup };
}

describe("Platform hosting (websites)", () => {
  it("never leaks a hosting account across tenants", async () => {
    const repo =
      new PlatformHostingRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "h1",
          domain: "site-a.com",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }),
    );

    // Tenant B can't see, get, or delete tenant A's account.
    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);

    const bGet = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.get("h1"),
    );
    expect(bGet).toBeUndefined();

    await runWithTenant(
      { organizationId: "org-b" },
      () => repo.delete("h1"),
    );

    const stillThere =
      await runWithTenant(
        { organizationId: "org-a" },
        () => repo.get("h1"),
      );
    expect(stillThere).toBeDefined();
  });

  it("creates and lists a website", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const create = await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", owner)
      .send({ domain: "acme.com" });
    expect(create.status).toBe(201);
    expect(
      create.body.hosting.domain,
    ).toBe("acme.com");
    expect(
      create.body.hosting.status,
    ).toBe("pending");

    const list = await request(app)
      .get("/api/platform/hosting")
      .set("Cookie", owner);
    expect(
      list.body.hosting,
    ).toHaveLength(1);
  });

  it("gates websites by plan tier", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    // Essentials includes 1 website.
    await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", owner)
      .send({ domain: "one.com" })
      .expect(201);

    // The second exceeds the plan → 402.
    const blocked = await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", owner)
      .send({ domain: "two.com" });
    expect(blocked.status).toBe(402);
    expect(
      blocked.body.error.code,
    ).toBe("PLAN_LIMIT");

    // Upgrade to Professional (10 sites) → the second now succeeds.
    await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set("Cookie", owner)
      .send({ planId: "professional" })
      .expect(200);

    await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", owner)
      .send({ domain: "two.com" })
      .expect(201);
  });

  it("updates status and deletes; blocks cross-tenant access", async () => {
    const { app, signup } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );

    const created = await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", acme)
      .send({ domain: "acme.com" });
    const id =
      created.body.hosting.id;

    // Acme provisions it (pending → active).
    const activated =
      await request(app)
        .patch(
          "/api/platform/hosting/" +
            id,
        )
        .set("Cookie", acme)
        .send({ status: "active" });
    expect(
      activated.body.hosting.status,
    ).toBe("active");

    // Beta cannot see, update, or delete Acme's site.
    const betaList = await request(app)
      .get("/api/platform/hosting")
      .set("Cookie", beta);
    expect(
      betaList.body.hosting,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/hosting/" +
            id,
        )
        .set("Cookie", beta)
        .send({ status: "cancelled" });
    expect(betaPatch.status).toBe(404);

    await request(app)
      .delete(
        "/api/platform/hosting/" + id,
      )
      .set("Cookie", acme)
      .expect(200);
  });

  it("rejects an invalid domain and a client from another tenant", async () => {
    const { app, signup } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );

    const bad = await request(app)
      .post("/api/platform/hosting")
      .set("Cookie", acme)
      .send({ domain: "not a domain" });
    expect(bad.status).toBe(400);

    // A client that belongs to Acme, referenced by Beta, must be rejected.
    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });
    const clientId =
      client.body.client.id;

    const crossTenant =
      await request(app)
        .post(
          "/api/platform/hosting",
        )
        .set("Cookie", beta)
        .send({
          domain: "beta.com",
          clientId,
        });
    expect(crossTenant.status).toBe(
      400,
    );
    expect(
      crossTenant.body.error.code,
    ).toBe("UNKNOWN_CLIENT");
  });
});
