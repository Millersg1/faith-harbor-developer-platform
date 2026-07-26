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
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { CalendarEventRepository } from "./calendar/CalendarEventRepository";
import {
  CalendarService,
  CalendarValidationError,
} from "./calendar/CalendarService";
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

describe("CalendarService", () => {
  it("creates events, stores UTC, and lists by range, tenant-scoped", async () => {
    const svc = new CalendarService(
      new CalendarEventRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const ev = await svc.create({
          title: "Kickoff",
          startAt:
            "2026-08-01T15:00:00Z",
        });
        // Stored as a UTC ISO instant.
        expect(ev.startAt).toBe(
          "2026-08-01T15:00:00.000Z",
        );

        await svc.create({
          title: "Later",
          startAt:
            "2026-09-01T10:00:00Z",
        });

        const august =
          await svc.list({
            from: "2026-08-01T00:00:00Z",
            to: "2026-08-31T23:59:59Z",
          });
        expect(
          august,
        ).toHaveLength(1);
        expect(august[0].title).toBe(
          "Kickoff",
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

  it("rejects an invalid start and an end-before-start", async () => {
    const svc = new CalendarService(
      new CalendarEventRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await expect(
          svc.create({
            title: "Bad",
            startAt: "not-a-date",
          }),
        ).rejects.toBeInstanceOf(
          CalendarValidationError,
        );

        await expect(
          svc.create({
            title: "Backwards",
            startAt:
              "2026-08-02T10:00:00Z",
            endAt:
              "2026-08-01T10:00:00Z",
          }),
        ).rejects.toBeInstanceOf(
          CalendarValidationError,
        );
      },
    );
  });

  it("updates and deletes", async () => {
    const svc = new CalendarService(
      new CalendarEventRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const ev = await svc.create({
          title: "Draft",
          startAt:
            "2026-08-01T15:00:00Z",
        });
        const updated =
          await svc.update(ev.id, {
            title: "Final",
          });
        expect(updated.title).toBe(
          "Final",
        );

        await svc.delete(ev.id);
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
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
  const calendar =
    new CalendarService(
      new CalendarEventRepository(),
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
    calendar,
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

describe("Calendar API", () => {
  it("creates and lists events for the tenant", async () => {
    const { app, cookie } =
      await buildApp();

    const created = await request(app)
      .post(
        "/api/platform/calendar/events",
      )
      .set("Cookie", cookie)
      .send({
        title: "Demo call",
        startAt:
          "2026-08-10T18:00:00Z",
      });
    expect(created.status).toBe(201);

    const list = await request(app)
      .get(
        "/api/platform/calendar/events",
      )
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(
      list.body.events,
    ).toHaveLength(1);
    expect(
      list.body.events[0].title,
    ).toBe("Demo call");
  });

  it("rejects an invalid event with 400", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post(
        "/api/platform/calendar/events",
      )
      .set("Cookie", cookie)
      .send({
        title: "Bad",
        startAt: "nope",
      });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/calendar/events",
    );
    expect(res.status).toBe(401);
  });
});
