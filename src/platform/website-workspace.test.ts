import request from "supertest";
import { describe, expect, it } from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
import { ActivityService } from "./events/ActivityService";
import { AiEmployeeRepository } from "./ai/employees/AiEmployeeRepository";
import { AiEmployeeService } from "./ai/employees/AiEmployeeService";
import { AiUsageRepository } from "./ai/AiUsageRepository";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { createPlatformApp } from "./createPlatformApp";
import { listIndustryEditions } from "./marketplace/MarketplaceCatalog";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { PlatformWebsiteRepository } from "./websites/PlatformWebsiteRepository";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import { WebsiteGenerationLockRepository } from "./websites/WebsiteGenerationLockRepository";
import type { WebsiteGenerator } from "./websites/WebsiteGenerator";

const fastGenerator: WebsiteGenerator = {
  isConnected: () => true,
  generate: async (brief) => ({
    html: "<!doctype html><title>" + brief.name + "</title>",
    model: "stub",
  }),
};

interface BuildOpts {
  generator?: WebsiteGenerator;
  aiEmployees?: AiEmployeeService;
  activity?: ActivityService;
  aiUsage?: AiUsageRepository;
}

async function build(opts: BuildOpts = {}) {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const branding = new BrandingService(new BrandingRepository());
  const aiUsage = opts.aiUsage ?? new AiUsageRepository();

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    projects: new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    ),
    invoices: new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    ),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    websites: new PlatformWebsiteService(
      new PlatformWebsiteRepository(),
      opts.generator ?? fastGenerator,
      clients,
      undefined,
      aiUsage,
      new BillingService(),
      undefined,
      new WebsiteGenerationLockRepository(),
    ),
    aiEmployees: opts.aiEmployees,
    activity: opts.activity,
    billing: new BillingService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app).post("/auth/signup").send({
    organizationName: "Acme",
    slug: "acme",
    email: "owner@acme.com",
    password: "password123",
  });
  const cookie = signup.headers["set-cookie"];

  // Upgrade to a plan with room for several sites so limit gating doesn't
  // interfere with these behavior tests (limit enforcement is covered
  // elsewhere).
  await request(app)
    .post("/api/platform/billing/plan")
    .set("Cookie", cookie)
    .send({ planId: "business" });

  return { app, cookie, branding, aiUsage };
}

const freeEdition = () =>
  listIndustryEditions().find((e) => e.tier !== "premium")!;

describe("Website generation idempotency", () => {
  it("rejects a concurrent duplicate generation and meters AI usage once", async () => {
    // A generator that blocks until released, so two requests overlap.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // Resolves the moment the generator is first entered (i.e. the lock is
    // held) — so the second request is sent only once overlap is guaranteed,
    // making the test deterministic under any load (no timing sleep).
    let entered: () => void = () => {};
    const enteredP = new Promise<void>(
      (r) => {
        entered = r;
      },
    );
    const blocking: WebsiteGenerator = {
      isConnected: () => true,
      generate: async (brief) => {
        entered();
        await gate;
        return {
          html: "<title>" + brief.name + "</title>",
          model: "stub",
        };
      },
    };
    const { app, cookie, aiUsage } = await build({
      generator: blocking,
    });

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", cookie)
      .send({
        name: "Site",
        brief: "A shop",
      });
    const id = created.body.website.id;

    // Fire the first request; it acquires the lock and blocks inside generate().
    const first = request(app)
      .post(`/api/platform/websites/${id}/generate`)
      .set("Cookie", cookie)
      .then((r) => r);
    await enteredP;

    // The second request now definitely finds the lock held → 409.
    const second = await request(app)
      .post(`/api/platform/websites/${id}/generate`)
      .set("Cookie", cookie);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(
      "GENERATION_IN_PROGRESS",
    );

    release();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);

    // AI usage metered exactly once for the one generation that ran.
    const metered = await runWithTenant(
      {
        organizationId: (
          await request(app).get("/auth/me").set("Cookie", cookie)
        ).body.organization.id,
      },
      () =>
        aiUsage.platformCountSince(
          "website_generation",
          "1970-01-01T00:00:00.000Z",
        ),
    );
    expect(metered).toBe(1);
  });

  it("allows a deliberate later regeneration as a new operation", async () => {
    const { app, cookie } = await build();
    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", cookie)
      .send({ name: "Site" });
    const id = created.body.website.id;

    await request(app)
      .post(`/api/platform/websites/${id}/generate`)
      .set("Cookie", cookie)
      .expect(200);
    // A second, sequential generation succeeds (the lock was released).
    await request(app)
      .post(`/api/platform/websites/${id}/generate`)
      .set("Cookie", cookie)
      .expect(200);
  });
});

describe("Website provenance (source persistence)", () => {
  it("records sourceTemplateId for a standalone template, and null for a direct build", async () => {
    const { app, cookie } = await build();

    const direct = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", cookie)
      .send({ name: "Direct" });
    expect(direct.body.website.sourceTemplateId).toBeFalsy();
    expect(direct.body.website.sourceEditionId).toBeFalsy();

    const templates = await request(app)
      .get("/api/platform/marketplace/website-templates")
      .set("Cookie", cookie);
    const tpl = templates.body.templates[0];
    const used = await request(app)
      .post(`/api/platform/marketplace/website-templates/${tpl.id}/use`)
      .set("Cookie", cookie)
      .send({});
    expect(used.status).toBe(201);

    const list = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", cookie);
    const fromTpl = list.body.websites.find(
      (w: { sourceTemplateId?: string }) => w.sourceTemplateId === tpl.id,
    );
    expect(fromTpl).toBeTruthy();
    expect(fromTpl.sourceEditionId).toBeFalsy();
  });

  it("records sourceEditionId and its template when an edition is applied", async () => {
    const aiEmployees = new AiEmployeeService(new AiEmployeeRepository());
    const { app, cookie } = await build({ aiEmployees });
    const ed = freeEdition();

    await request(app)
      .post(`/api/platform/marketplace/editions/${ed.id}/apply`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    const list = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", cookie);
    const site = list.body.websites.find(
      (w: { sourceEditionId?: string }) => w.sourceEditionId === ed.id,
    );
    expect(site).toBeTruthy();
    expect(site.sourceTemplateId).toBe(ed.websiteTemplateId);
  });
});

describe("Edition apply: explicit branding + accurate result", () => {
  it("does NOT change organization branding unless explicitly requested", async () => {
    const aiEmployees = new AiEmployeeService(new AiEmployeeRepository());
    const { app, cookie } = await build({ aiEmployees });
    const ed = freeEdition();

    const res = await request(app)
      .post(`/api/platform/marketplace/editions/${ed.id}/apply`)
      .set("Cookie", cookie)
      .send({}) // no applyBranding
      .expect(201);

    expect(res.body.accentApplied).toBe(false);
    const branding = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", "acme")
      .set("Cookie", cookie);
    expect(branding.body.branding.primaryColor).toBeFalsy();
  });

  it("changes branding only when applyBranding is explicitly true", async () => {
    const aiEmployees = new AiEmployeeService(new AiEmployeeRepository());
    const { app, cookie } = await build({ aiEmployees });
    const ed = freeEdition();

    const res = await request(app)
      .post(`/api/platform/marketplace/editions/${ed.id}/apply`)
      .set("Cookie", cookie)
      .send({ applyBranding: true })
      .expect(201);

    expect(res.body.accentApplied).toBe(true);
    const branding = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", "acme")
      .set("Cookie", cookie);
    expect(branding.body.branding.primaryColor).toBe(ed.accentColor);
  });

  it("reports employeesRequested and a partial count when some employees fail", async () => {
    // An employee service whose 2nd create throws.
    let n = 0;
    const flaky = {
      create: async (emp: unknown) => {
        n += 1;
        if (n === 2) {
          throw new Error("boom");
        }
        return emp as never;
      },
      list: async () => [],
    } as unknown as AiEmployeeService;
    const { app, cookie } = await build({
      aiEmployees: flaky,
    });
    const ed = freeEdition();

    const res = await request(app)
      .post(`/api/platform/marketplace/editions/${ed.id}/apply`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    expect(res.body.employeesRequested).toBe(ed.employees.length);
    expect(res.body.employeesCreated).toBe(ed.employees.length - 1);
  });
});

describe("Template vs edition distinction", () => {
  it("using a standalone template creates NO employees and does not change branding", async () => {
    const aiEmployees = new AiEmployeeService(new AiEmployeeRepository());
    const { app, cookie } = await build({ aiEmployees });

    const templates = await request(app)
      .get("/api/platform/marketplace/website-templates")
      .set("Cookie", cookie);
    const tpl = templates.body.templates[0];
    await request(app)
      .post(`/api/platform/marketplace/website-templates/${tpl.id}/use`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    const emps = await request(app)
      .get("/api/platform/ai/employees")
      .set("Cookie", cookie);
    expect((emps.body.employees || []).length).toBe(0);
    const branding = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", "acme")
      .set("Cookie", cookie);
    expect(branding.body.branding.primaryColor).toBeFalsy();
  });
});

describe("Website activity events", () => {
  it("records website.created and marketplace_edition.applied", async () => {
    const activity = new ActivityService();
    const aiEmployees = new AiEmployeeService(new AiEmployeeRepository());
    const { app, cookie } = await build({
      activity,
      aiEmployees,
    });

    await request(app)
      .post("/api/platform/websites")
      .set("Cookie", cookie)
      .send({ name: "Logged" })
      .expect(201);
    const ed = freeEdition();
    await request(app)
      .post(`/api/platform/marketplace/editions/${ed.id}/apply`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    const feed = await request(app)
      .get("/api/platform/activity")
      .set("Cookie", cookie);
    const types = (feed.body.events || []).map((e: { type: string }) => e.type);
    expect(types).toContain("website.created");
    expect(types).toContain("marketplace_edition.applied");
  });
});
