import request from "supertest";
import { describe, expect, it } from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
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
import { PlatformTicketRepository } from "./support/PlatformTicketRepository";
import { PlatformTicketService } from "./support/PlatformTicketService";
import { createPlatformApp } from "./createPlatformApp";
import { DashboardService } from "./dashboard/DashboardService";
import { WorkspacePreferencesService } from "./preferences/WorkspacePreferencesService";
import { WorkspacePreferencesRepository } from "./preferences/WorkspacePreferencesRepository";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

describe("DashboardService", () => {
  it("reports null for unwired metrics, never a misleading zero", async () => {
    const service = new DashboardService({
      counts: {
        clients: async () => 3,
        // leads, projects, etc. intentionally omitted (unwired).
      },
    });

    const s = await service.summary();

    expect(s.metrics.clients).toBe(3);
    expect(s.metrics.leads).toBeNull();
    expect(s.metrics.activeProjects).toBeNull();
    expect(s.billing).toBeNull();
  });

  it("treats a throwing count getter as null (never crashes)", async () => {
    const service = new DashboardService({
      counts: {
        clients: async () => {
          throw new Error("db down");
        },
      },
    });

    const s = await service.summary();
    expect(s.metrics.clients).toBeNull();
  });

  it("includes a billing summary when wired", async () => {
    const service = new DashboardService({
      counts: {},
      billing: async () => ({
        planId: "business",
        planName: "Cloud Business",
        status: "active",
        priceCents: 9900,
        interval: "month",
        currentPeriodEnd: null,
        limits: { seats: 10 },
      }),
    });

    const s = await service.summary();
    expect(s.billing?.planName).toBe("Cloud Business");
    expect(s.billing?.currentPeriodEnd).toBeNull();
  });
});

describe("WorkspacePreferencesService", () => {
  it("returns safe defaults when nothing is stored", async () => {
    const service = new WorkspacePreferencesService(
      new WorkspacePreferencesRepository(),
    );

    const prefs = await runWithTenant({ organizationId: "org-a" }, () =>
      service.get(),
    );

    expect(prefs.onboardingDismissed).toBe(false);
    expect(prefs.organizationId).toBe("org-a");
  });

  it("persists an update and never leaks across tenants", async () => {
    const repo = new WorkspacePreferencesRepository();
    const service = new WorkspacePreferencesService(repo);

    await runWithTenant({ organizationId: "org-a" }, () =>
      service.update({
        onboardingDismissed: true,
      }),
    );

    const a = await runWithTenant({ organizationId: "org-a" }, () =>
      service.get(),
    );
    const b = await runWithTenant({ organizationId: "org-b" }, () =>
      service.get(),
    );

    expect(a.onboardingDismissed).toBe(true);
    // Tenant B never saved anything → still the safe default.
    expect(b.onboardingDismissed).toBe(false);
  });
});

async function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    ),
    invoices: new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    ),
    tickets: new PlatformTicketService(new PlatformTicketRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    preferences: new WorkspacePreferencesService(
      new WorkspacePreferencesRepository(),
    ),
    baseDomain: "allelitecloud.com",
  });

  return app;
}

async function signup(
  app: ReturnType<typeof createPlatformApp>,
  slug: string,
  email: string,
) {
  const res = await request(app).post("/auth/signup").send({
    organizationName: slug,
    slug,
    email,
    password: "password123",
  });
  return res.headers["set-cookie"];
}

describe("Dashboard API (HTTP)", () => {
  it("returns real tenant-scoped counts", async () => {
    const app = await buildApp();
    const cookie = await signup(app, "acme", "owner@acme.com");

    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Client One" });
    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Client Two" });

    const res = await request(app)
      .get("/api/platform/dashboard")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.metrics.clients).toBe(2);
    // Projects wired but none created → 0 (not null).
    expect(res.body.metrics.activeProjects).toBe(0);
    // Leads not wired for this app → null (honest unavailable).
    expect(res.body.metrics.leads).toBeNull();
    // Billing not wired → null.
    expect(res.body.billing).toBeNull();
  });

  it("never leaks another tenant's counts", async () => {
    const app = await buildApp();
    const a = await signup(app, "alpha", "o@alpha.com");
    const b = await signup(app, "beta", "o@beta.com");

    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", a)
      .send({ name: "Alpha Client" });

    const resB = await request(app)
      .get("/api/platform/dashboard")
      .set("Cookie", b);

    // Beta has its own (empty) scope — Alpha's client must not appear.
    expect(resB.body.metrics.clients).toBe(0);
  });

  it("requires authentication", async () => {
    const app = await buildApp();
    await request(app).get("/api/platform/dashboard").expect(401);
  });
});

describe("Workspace preferences API (HTTP)", () => {
  it("owner can persist onboardingDismissed and read it back", async () => {
    const app = await buildApp();
    const cookie = await signup(app, "acme", "owner@acme.com");

    const patched = await request(app)
      .patch("/api/platform/preferences")
      .set("Cookie", cookie)
      .send({
        onboardingDismissed: true,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.preferences.onboardingDismissed).toBe(true);

    const got = await request(app)
      .get("/api/platform/preferences")
      .set("Cookie", cookie);
    expect(got.body.preferences.onboardingDismissed).toBe(true);
  });

  it("rejects a preference change from a member (403)", async () => {
    const app = await buildApp();
    const ownerCookie = await signup(app, "acme", "owner@acme.com");

    // Owner invites a member.
    await request(app)
      .post("/api/platform/team")
      .set("Cookie", ownerCookie)
      .send({
        email: "member@acme.com",
        password: "password123",
        role: "member",
      });

    const memberLogin = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "member@acme.com",
        password: "password123",
      });
    const memberCookie = memberLogin.headers["set-cookie"];

    // Member may READ preferences...
    await request(app)
      .get("/api/platform/preferences")
      .set("Cookie", memberCookie)
      .expect(200);

    // ...but NOT change the shared workspace preference.
    await request(app)
      .patch("/api/platform/preferences")
      .set("Cookie", memberCookie)
      .send({
        onboardingDismissed: true,
      })
      .expect(403);
  });

  it("requires authentication", async () => {
    const app = await buildApp();
    await request(app).get("/api/platform/preferences").expect(401);
  });
});
