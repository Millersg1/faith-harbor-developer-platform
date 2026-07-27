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
import { createPlatformApp } from "./createPlatformApp";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { OnboardingService } from "./onboarding/OnboardingService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

describe("OnboardingService", () => {
  it("only shows steps it can actually measure", async () => {
    const service = new OnboardingService(
      {
        client: async () => false,
        team: async () => true,
      },
    );

    const c = await service.checklist();

    // Only the two wired steps appear; the rest are omitted, not faked.
    expect(c.total).toBe(2);
    expect(
      c.steps.map((s) => s.id).sort(),
    ).toEqual(["client", "team"]);
    expect(c.completed).toBe(1);
    expect(c.percent).toBe(50);
    expect(c.allDone).toBe(false);
  });

  it("reports 100% and allDone when every measured step is done", async () => {
    const service = new OnboardingService(
      {
        client: async () => true,
        website: async () => true,
      },
    );

    const c = await service.checklist();

    expect(c.completed).toBe(2);
    expect(c.total).toBe(2);
    expect(c.percent).toBe(100);
    expect(c.allDone).toBe(true);
  });

  it("treats a throwing signal as not done, never a crash", async () => {
    const service = new OnboardingService(
      {
        client: async () => {
          throw new Error("db down");
        },
      },
    );

    const c = await service.checklist();

    expect(c.steps[0].done).toBe(false);
    expect(c.allDone).toBe(false);
  });

  it("is empty (0%) when nothing is measurable", async () => {
    const service =
      new OnboardingService({});

    const c = await service.checklist();

    expect(c.total).toBe(0);
    expect(c.percent).toBe(0);
    expect(c.allDone).toBe(false);
  });

  it("keeps steps in the defined onboarding order", async () => {
    const service = new OnboardingService(
      {
        // Deliberately out of order in the map.
        team: async () => false,
        brand: async () => false,
        website: async () => false,
      },
    );

    const c = await service.checklist();

    expect(
      c.steps.map((s) => s.id),
    ).toEqual([
      "brand",
      "website",
      "team",
    ]);
  });
});

describe("Onboarding API (HTTP)", () => {
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

    // Signals over the real (tenant-scoped) services, exactly as the server
    // wires them. Evaluated inside the request's tenant context.
    const onboarding =
      new OnboardingService({
        client: () =>
          clients
            .list()
            .then((r) => r.length > 0),
        team: () =>
          users
            .list()
            .then((r) => r.length >= 2),
      });

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
      signup:
        new PlatformSignupService(
          organizations,
          users,
          sessions,
        ),
      domains:
        new OrganizationDomainService(),
      admins:
        new PlatformAdminService(),
      adminSessions:
        new PlatformAdminSessionService(),
      onboarding,
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

  it("returns the checklist for a signed-in tenant", async () => {
    const { app, cookie } =
      await buildApp();

    const res = await request(app)
      .get("/api/platform/onboarding")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const client = res.body.steps.find(
      (s: { id: string }) =>
        s.id === "client",
    );
    expect(client.done).toBe(false);
  });

  it("flips a step to done once the real data exists", async () => {
    const { app, cookie } =
      await buildApp();

    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({
        name: "First Client",
        email: "c@x.com",
      })
      .expect(201);

    const res = await request(app)
      .get("/api/platform/onboarding")
      .set("Cookie", cookie);

    const client = res.body.steps.find(
      (s: { id: string }) =>
        s.id === "client",
    );
    expect(client.done).toBe(true);
    expect(res.body.completed).toBe(1);
  });

  it("requires authentication", async () => {
    const { app } = await buildApp();

    await request(app)
      .get("/api/platform/onboarding")
      .expect(401);
  });
});
