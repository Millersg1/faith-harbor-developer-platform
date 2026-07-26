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
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformLeadRepository } from "./crm/PlatformLeadRepository";
import { PlatformLeadService } from "./crm/PlatformLeadService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { SearchService } from "./search/SearchService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

describe("SearchService", () => {
  it("finds records across modules, grouped, scoped to the tenant", async () => {
    const clients =
      new PlatformClientService(
        new PlatformClientRepository(),
      );
    const leads =
      new PlatformLeadService(
        new PlatformLeadRepository(),
        clients,
      );
    const search = new SearchService({
      clients,
      leads,
    });

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await clients.create({
          name: "Riverside Bakery",
          email:
            "hello@riverside.com",
        });
        await leads.create({
          name: "Riverside Prospect",
          company: "Riverside LLC",
        });
        await clients.create({
          name: "Unrelated Co",
        });

        const groups =
          await search.search(
            "riverside",
          );
        const byType =
          Object.fromEntries(
            groups.map((g) => [
              g.type,
              g,
            ]),
          );
        expect(
          byType.client.results,
        ).toHaveLength(1);
        expect(
          byType.client.results[0]
            .title,
        ).toBe("Riverside Bakery");
        expect(
          byType.client.results[0]
            .url,
        ).toBe("/app#clients");
        expect(
          byType.lead.results,
        ).toHaveLength(1);
      },
    );

    // Another tenant sees nothing for the same query.
    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        const groups =
          await search.search(
            "riverside",
          );
        expect(groups).toHaveLength(0);
      },
    );
  });

  it("ignores very short queries", async () => {
    const clients =
      new PlatformClientService(
        new PlatformClientRepository(),
      );
    const search = new SearchService({
      clients,
    });

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await clients.create({
          name: "Acme",
        });
        expect(
          await search.search("a"),
        ).toHaveLength(0);
      },
    );
  });

  it("ranks prefix matches above substring matches", async () => {
    const clients =
      new PlatformClientService(
        new PlatformClientRepository(),
      );
    const search = new SearchService({
      clients,
    });

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await clients.create({
          name: "Northwind Traders",
        });
        await clients.create({
          name: "Old North Church",
        });

        const groups =
          await search.search("north");
        const titles =
          groups[0].results.map(
            (r) => r.title,
          );
        expect(titles[0]).toBe(
          "Northwind Traders",
        );
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
  const projects =
    new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    );
  const search = new SearchService({
    clients,
    users,
    projects,
  });

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects,
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
    search,
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

describe("Search API", () => {
  it("returns grouped results for the signed-in tenant", async () => {
    const { app, cookie } =
      await buildApp();

    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Zephyr Design" });

    const res = await request(app)
      .get(
        "/api/platform/search?q=zephyr",
      )
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(
      res.body.groups.length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      res.body.groups[0].results[0]
        .title,
    ).toBe("Zephyr Design");
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/search?q=zephyr",
    );
    expect(res.status).toBe(401);
  });
});
