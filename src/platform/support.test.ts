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
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformTicketRepository } from "./support/PlatformTicketRepository";
import { PlatformTicketService } from "./support/PlatformTicketService";
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
    tickets:
      new PlatformTicketService(
        new PlatformTicketRepository(),
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

describe("Support tickets", () => {
  it("never leaks a ticket across tenants", async () => {
    const repo =
      new PlatformTicketRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "t1",
          subject: "A issue",
          status: "open",
          priority: "medium",
          createdAt: now,
          updatedAt: now,
        }),
    );

    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);

    const bGet = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.get("t1"),
    );
    expect(bGet).toBeUndefined();
  });

  it("creates, lists, and resolves a ticket", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/tickets")
      .set("Cookie", owner)
      .send({
        subject: "Email not working",
        priority: "high",
      });
    expect(created.status).toBe(201);
    expect(
      created.body.ticket.status,
    ).toBe("open");
    expect(
      created.body.ticket.priority,
    ).toBe("high");
    const id =
      created.body.ticket.id;

    const list = await request(app)
      .get("/api/platform/tickets")
      .set("Cookie", owner);
    expect(
      list.body.tickets,
    ).toHaveLength(1);

    const resolved =
      await request(app)
        .patch(
          "/api/platform/tickets/" +
            id,
        )
        .set("Cookie", owner)
        .send({ status: "resolved" });
    expect(
      resolved.body.ticket.status,
    ).toBe("resolved");
  });

  it("blocks cross-tenant access and a client from another tenant", async () => {
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
      .post("/api/platform/tickets")
      .set("Cookie", acme)
      .send({ subject: "Acme issue" });
    const id =
      created.body.ticket.id;

    // Beta can't see or update Acme's ticket.
    const betaList = await request(app)
      .get("/api/platform/tickets")
      .set("Cookie", beta);
    expect(
      betaList.body.tickets,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/tickets/" +
            id,
        )
        .set("Cookie", beta)
        .send({ status: "closed" });
    expect(betaPatch.status).toBe(404);

    // A ticket referencing another tenant's client is rejected.
    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });

    const cross = await request(app)
      .post("/api/platform/tickets")
      .set("Cookie", beta)
      .send({
        subject: "x",
        clientId:
          client.body.client.id,
      });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe(
      "UNKNOWN_CLIENT",
    );
  });
});
