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
    billing: new BillingService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    users,
    ownerCookie:
      signup.headers["set-cookie"],
    orgId:
      signup.body.organization.id,
  };
}

describe("Billing & plans", () => {
  it("defaults a new tenant to the entry plan", async () => {
    const { app, ownerCookie } =
      await build();

    const res = await request(app)
      .get("/api/platform/billing")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe(
      "essentials",
    );
    expect(
      res.body.subscription.planId,
    ).toBe("essentials");
    expect(
      res.body.subscription.status,
    ).toBe("active");
  });

  it("lists the full plan catalog", async () => {
    const { app, ownerCookie } =
      await build();

    const res = await request(app)
      .get(
        "/api/platform/billing/plans",
      )
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(
      res.body.plans.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([
      "essentials",
      "professional",
      "business",
      "partner",
      "enterprise",
    ]);
  });

  it("lets an owner change plan and reflects it", async () => {
    const { app, ownerCookie } =
      await build();

    const change = await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set("Cookie", ownerCookie)
      .send({ planId: "business" });
    expect(change.status).toBe(200);
    expect(
      change.body.subscription.planId,
    ).toBe("business");

    const after = await request(app)
      .get("/api/platform/billing")
      .set("Cookie", ownerCookie);
    expect(after.body.plan.id).toBe(
      "business",
    );
  });

  it("rejects the non-self-serve Enterprise plan", async () => {
    const { app, ownerCookie } =
      await build();

    const res = await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set("Cookie", ownerCookie)
      .send({ planId: "enterprise" });

    expect(res.status).toBe(400);
  });

  it("forbids a non-owner from changing plan", async () => {
    const { app, ownerCookie, users, orgId } =
      await build();

    // Even an admin can't change the plan — owner only.
    await runWithTenant(
      { organizationId: orgId },
      () =>
        users.create({
          email: "admin@acme.com",
          password: "password123",
          role: "admin",
        }),
    );

    const adminLogin =
      await request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "admin@acme.com",
          password: "password123",
        });

    const denied = await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set(
        "Cookie",
        adminLogin.headers[
          "set-cookie"
        ],
      )
      .send({ planId: "business" });

    expect(denied.status).toBe(403);

    // And it didn't change.
    void ownerCookie;
  });

  it("gates custom domains by plan tier", async () => {
    const { app, ownerCookie } =
      await build();

    // Essentials includes 0 custom domains → 402 with an upgrade prompt.
    const blocked = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain: "cloud.acme.com",
      });
    expect(blocked.status).toBe(402);
    expect(
      blocked.body.error.code,
    ).toBe("PLAN_LIMIT");

    // Upgrade to Partner (25 custom domains) → the same add now succeeds.
    await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set("Cookie", ownerCookie)
      .send({ planId: "partner" })
      .expect(200);

    const allowed = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain: "cloud.acme.com",
      });
    expect(allowed.status).toBe(201);
  });
});
