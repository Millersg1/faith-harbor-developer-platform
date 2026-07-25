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
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProductRepository } from "./products/PlatformProductRepository";
import { PlatformProductService } from "./products/PlatformProductService";
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
    products:
      new PlatformProductService(
        new PlatformProductRepository(),
        clients,
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

  return { app, signup };
}

describe("Products", () => {
  it("never leaks a product across tenants", async () => {
    const repo =
      new PlatformProductRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "pd1",
          name: "App A",
          status: "planning",
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

  it("creates, advances stage, and enforces isolation + client guard", async () => {
    const { app, signup } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );

    const created = await request(app)
      .post("/api/platform/products")
      .set("Cookie", acme)
      .send({
        name: "My App",
        language: "TypeScript",
      });
    expect(created.status).toBe(201);
    expect(
      created.body.product.status,
    ).toBe("planning");
    const id =
      created.body.product.id;

    const active = await request(app)
      .patch(
        "/api/platform/products/" +
          id,
      )
      .set("Cookie", acme)
      .send({ status: "active" });
    expect(
      active.body.product.status,
    ).toBe("active");

    const betaList = await request(app)
      .get("/api/platform/products")
      .set("Cookie", beta);
    expect(
      betaList.body.products,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/products/" +
            id,
        )
        .set("Cookie", beta)
        .send({ status: "archived" });
    expect(betaPatch.status).toBe(404);

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });
    const cross = await request(app)
      .post("/api/platform/products")
      .set("Cookie", beta)
      .send({
        name: "x",
        clientId:
          client.body.client.id,
      });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe(
      "UNKNOWN_CLIENT",
    );
  });
});
