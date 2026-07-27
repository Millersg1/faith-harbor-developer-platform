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
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { PlatformWebsiteRepository } from "./websites/PlatformWebsiteRepository";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import {
  getWebsiteTemplate,
  listWebsiteTemplates,
} from "./marketplace/MarketplaceCatalog";

describe("MarketplaceCatalog", () => {
  it("exposes a non-empty catalogue with unique ids and briefs", () => {
    const templates =
      listWebsiteTemplates();
    expect(
      templates.length,
    ).toBeGreaterThan(0);

    const ids = new Set(
      templates.map((t) => t.id),
    );
    expect(ids.size).toBe(
      templates.length,
    );

    for (const t of templates) {
      expect(
        t.brief.length,
      ).toBeGreaterThan(20);
      expect(t.accentColor).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
    }

    expect(
      getWebsiteTemplate(
        "restaurant-classic",
      ),
    ).toBeDefined();
    expect(
      getWebsiteTemplate("nope"),
    ).toBeUndefined();
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
    websites:
      new PlatformWebsiteService(
        new PlatformWebsiteRepository(),
        undefined,
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
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

describe("Marketplace API", () => {
  it("lists website templates", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .get(
        "/api/platform/marketplace/website-templates",
      )
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(
      res.body.templates.length,
    ).toBeGreaterThan(0);
  });

  it("uses a template to create a seeded website draft", async () => {
    const { app, cookie } =
      await buildApp();

    const used = await request(app)
      .post(
        "/api/platform/marketplace/website-templates/restaurant-classic/use",
      )
      .set("Cookie", cookie)
      .send({});
    expect(used.status).toBe(201);
    expect(
      used.body.website.status,
    ).toBe("draft");
    // The draft carries the template's brief so the AI builder can generate it.
    expect(
      used.body.website.brief.length,
    ).toBeGreaterThan(20);

    const list = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", cookie);
    expect(
      list.body.websites,
    ).toHaveLength(1);
  });

  it("404s an unknown template", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post(
        "/api/platform/marketplace/website-templates/nope/use",
      )
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/marketplace/website-templates",
    );
    expect(res.status).toBe(401);
  });
});
