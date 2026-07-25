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
import { PlatformBrandRepository } from "./brands/PlatformBrandRepository";
import { PlatformBrandService } from "./brands/PlatformBrandService";
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
    brands: new PlatformBrandService(
      new PlatformBrandRepository(),
    ),
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

  return { app, signup, users };
}

describe("Brands", () => {
  it("never leaks a brand across tenants", async () => {
    const repo =
      new PlatformBrandRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "b1",
          name: "Brand A",
          createdAt: now,
          updatedAt: now,
        }),
    );

    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);
  });

  it("creates, lists, and updates a brand", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/brands")
      .set("Cookie", owner)
      .send({
        name: "All Elite Hosting",
        domain:
          "allelitehosting.com",
      });
    expect(created.status).toBe(201);
    const id = created.body.brand.id;

    const list = await request(app)
      .get("/api/platform/brands")
      .set("Cookie", owner);
    expect(
      list.body.brands,
    ).toHaveLength(1);

    const renamed = await request(app)
      .patch(
        "/api/platform/brands/" + id,
      )
      .set("Cookie", owner)
      .send({ name: "Elite Cloud" });
    expect(renamed.body.brand.name).toBe(
      "Elite Cloud",
    );
  });

  it("blocks cross-tenant access and forbids members from adding", async () => {
    const { app, signup, users } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/brands")
      .set("Cookie", acme)
      .send({ name: "Acme Brand" });
    const id = created.body.brand.id;

    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );
    const betaList = await request(app)
      .get("/api/platform/brands")
      .set("Cookie", beta);
    expect(
      betaList.body.brands,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/brands/" +
            id,
        )
        .set("Cookie", beta)
        .send({ name: "Hijack" });
    expect(betaPatch.status).toBe(404);

    // A member (not owner/admin) cannot add a brand.
    const acmeOrg = await request(app)
      .get("/auth/me")
      .set("Cookie", acme);
    await runWithTenant(
      {
        organizationId:
          acmeOrg.body.organization
            .id,
      },
      () =>
        users.create({
          email: "member@acme.com",
          password: "password123",
          role: "member",
        }),
    );
    const memberLogin =
      await request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "member@acme.com",
          password: "password123",
        });
    const denied = await request(app)
      .post("/api/platform/brands")
      .set(
        "Cookie",
        memberLogin.headers[
          "set-cookie"
        ],
      )
      .send({ name: "Nope" });
    expect(denied.status).toBe(403);
  });
});
