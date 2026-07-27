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
import { AiEmployeeRepository } from "./ai/employees/AiEmployeeRepository";
import { AiEmployeeService } from "./ai/employees/AiEmployeeService";
import {
  getIndustryEdition,
  getWebsiteTemplate,
  listIndustryEditions,
  listWebsiteTemplates,
} from "./marketplace/MarketplaceCatalog";
import { buildDefaultAiTools } from "./ai/tools/defaultAiTools";

/** Every tool name the default catalogue can expose (all services present). */
function allToolNames(): Set<string> {
  const noop = async () => [];
  const tools = buildDefaultAiTools({
    leads: {
      list: noop,
      create: async () => ({
        id: "x",
        name: "x",
      }),
      update: async () => ({
        id: "x",
        name: "x",
      }),
    },
    clients: { list: noop },
    projects: {
      list: noop,
      create: async () => ({
        id: "x",
        name: "x",
      }),
    },
    invoices: { list: noop },
    tickets: {
      list: noop,
      create: async () => ({
        id: "x",
        subject: "x",
      }),
    },
    activity: {
      record: async () => ({}),
    },
    notifications: {
      create: async () => ({}),
    },
    resolveNotifyRecipients:
      async () => [],
  });

  return new Set(
    tools.map((t) => t.name),
  );
}

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

  it("industry editions reference real templates and known tools", () => {
    const editions =
      listIndustryEditions();
    expect(
      editions.length,
    ).toBeGreaterThan(0);

    for (const e of editions) {
      // Every edition's website template must exist.
      expect(
        getWebsiteTemplate(
          e.websiteTemplateId,
        ),
      ).toBeDefined();
      expect(
        e.employees.length,
      ).toBeGreaterThan(0);
    }

    expect(
      getIndustryEdition("restaurant"),
    ).toBeDefined();
    expect(
      getIndustryEdition("nope"),
    ).toBeUndefined();
  });

  it("every website template has a matching edition, and every edition has employees", () => {
    const templates =
      listWebsiteTemplates();
    const editions =
      listIndustryEditions();

    const editionTemplateIds = new Set(
      editions.map(
        (e) => e.websiteTemplateId,
      ),
    );

    // Every template is covered by an edition (the user requirement).
    for (const t of templates) {
      expect(
        editionTemplateIds.has(t.id),
      ).toBe(true);
    }

    // Every edition is well-formed: valid template + at least one employee,
    // each with a persona and at least one tool.
    for (const e of editions) {
      expect(
        getWebsiteTemplate(
          e.websiteTemplateId,
        ),
      ).toBeDefined();
      expect(
        e.employees.length,
      ).toBeGreaterThan(0);
      for (const emp of e.employees) {
        expect(
          emp.persona.length,
        ).toBeGreaterThan(10);
        expect(
          emp.toolNames.length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every edition employee references only real registry tools", () => {
    const known = allToolNames();

    for (const e of listIndustryEditions()) {
      for (const emp of e.employees) {
        for (const name of emp.toolNames) {
          expect(
            known.has(name),
          ).toBe(true);
        }
      }
    }
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
    aiEmployees:
      new AiEmployeeService(
        new AiEmployeeRepository(),
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

  it("applies an industry edition: website draft + AI employees", async () => {
    const { app, cookie } =
      await buildApp();

    const applied = await request(app)
      .post(
        "/api/platform/marketplace/editions/restaurant/apply",
      )
      .set("Cookie", cookie)
      .send({});
    expect(applied.status).toBe(201);
    expect(
      applied.body.website.id,
    ).toBeTruthy();
    expect(
      applied.body.employeesCreated,
    ).toBe(2);

    // The website draft and the employees actually exist now.
    const sites = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", cookie);
    expect(
      sites.body.websites,
    ).toHaveLength(1);

    const emps = await request(app)
      .get(
        "/api/platform/ai/employees",
      )
      .set("Cookie", cookie);
    expect(
      emps.body.employees,
    ).toHaveLength(2);
  });

  it("404s an unknown edition", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post(
        "/api/platform/marketplace/editions/nope/apply",
      )
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(404);
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
