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
import { PlatformLeadRepository } from "./crm/PlatformLeadRepository";
import { PlatformLeadService } from "./crm/PlatformLeadService";
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
    leads: new PlatformLeadService(
      new PlatformLeadRepository(),
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

describe("CRM sales leads", () => {
  it("never leaks a lead across tenants", async () => {
    const repo =
      new PlatformLeadRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "l1",
          name: "Lead A",
          status: "new",
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

  it("creates a lead with a value and advances its stage", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/leads")
      .set("Cookie", owner)
      .send({
        name: "Jane Doe",
        company: "Beta Co",
        estimatedValue: 5000,
      });
    expect(created.status).toBe(201);
    expect(
      created.body.lead.status,
    ).toBe("new");
    expect(
      created.body.lead
        .estimatedValue,
    ).toBe(5000);
    const id = created.body.lead.id;

    const won = await request(app)
      .patch(
        "/api/platform/leads/" + id,
      )
      .set("Cookie", owner)
      .send({ status: "won" });
    expect(won.body.lead.status).toBe(
      "won",
    );
  });

  it("blocks cross-tenant access and another tenant's client", async () => {
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
      .post("/api/platform/leads")
      .set("Cookie", acme)
      .send({ name: "Acme Lead" });
    const id = created.body.lead.id;

    const betaList = await request(app)
      .get("/api/platform/leads")
      .set("Cookie", beta);
    expect(
      betaList.body.leads,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/leads/" +
            id,
        )
        .set("Cookie", beta)
        .send({ status: "lost" });
    expect(betaPatch.status).toBe(404);

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });

    const cross = await request(app)
      .post("/api/platform/leads")
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
