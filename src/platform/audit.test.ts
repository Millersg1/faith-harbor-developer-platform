import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { AuditRepository } from "./audit/AuditRepository";
import { AuditService } from "./audit/AuditService";
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

describe("AuditService", () => {
  it("records and lists events, tenant-scoped", async () => {
    const svc = new AuditService(
      new AuditRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.record({
          action: "auth.login",
          actorId: "u1",
          outcome: "success",
          ip: "1.2.3.4",
        });
        const list =
          await svc.list();
        expect(list).toHaveLength(1);
        expect(list[0].action).toBe(
          "auth.login",
        );
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
  });

  it("never throws from record()", async () => {
    // A repository that always fails must not surface an error.
    const brokenRepo = {
      create: async () => {
        throw new Error("db down");
      },
      list: async () => [],
    } as unknown as AuditRepository;
    const svc = new AuditService(
      brokenRepo,
    );

    await expect(
      svc.record({
        action: "auth.login",
      }),
    ).resolves.toBeUndefined();
  });
});

async function buildApp() {
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
  const audit = new AuditService(
    new AuditRepository(),
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
    audit,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("Audit API", () => {
  it("records login success and failure, visible to owner", async () => {
    const { app, cookie } =
      await buildApp();

    // Successful login → auth.login
    await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "password123",
      })
      .expect(200);

    // Failed login → auth.login_failed
    await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "wrong",
      })
      .expect(401);

    const audit = await request(app)
      .get("/api/platform/audit")
      .set("Cookie", cookie);
    expect(audit.status).toBe(200);
    const actions =
      audit.body.events.map(
        (e: { action: string }) =>
          e.action,
      );
    expect(actions).toContain(
      "auth.login",
    );
    expect(actions).toContain(
      "auth.login_failed",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/audit",
    );
    expect(res.status).toBe(401);
  });
});
