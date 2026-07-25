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
import { ClientUserRepository } from "./portal/ClientUserRepository";
import { ClientUserService } from "./portal/ClientUserService";
import { PortalSessionRepository } from "./portal/PortalSessionRepository";
import { PortalSessionService } from "./portal/PortalSessionService";
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
    clientUsers:
      new ClientUserService(
        new ClientUserRepository(),
        clients,
      ),
    portalSessions:
      new PortalSessionService(
        new PortalSessionRepository(),
      ),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    ownerCookie:
      signup.headers["set-cookie"],
  };
}

async function makeClient(
  app: ReturnType<
    typeof createPlatformApp
  >,
  cookie: string[],
  name: string,
): Promise<string> {
  const res = await request(app)
    .post("/api/platform/clients")
    .set("Cookie", cookie)
    .send({ name });

  return res.body.client.id;
}

describe("Client portal", () => {
  it("never leaks a client user across tenants", async () => {
    const repo =
      new ClientUserRepository();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "cu1",
          clientId: "c1",
          email: "x@a.com",
          passwordHash: "h",
          createdAt:
            new Date().toISOString(),
        }),
    );

    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);
  });

  it("lets a client sign in and see only their own data", async () => {
    const { app, ownerCookie } =
      await build();

    const clientA =
      await makeClient(
        app,
        ownerCookie,
        "Client A",
      );
    const clientB =
      await makeClient(
        app,
        ownerCookie,
        "Client B",
      );

    // A project for each client.
    await request(app)
      .post("/api/platform/projects")
      .set("Cookie", ownerCookie)
      .send({
        name: "A's project",
        clientId: clientA,
      });
    await request(app)
      .post("/api/platform/projects")
      .set("Cookie", ownerCookie)
      .send({
        name: "B's project",
        clientId: clientB,
      });

    // Owner creates a portal login for client A.
    const created = await request(app)
      .post(
        "/api/platform/portal-users",
      )
      .set("Cookie", ownerCookie)
      .send({
        clientId: clientA,
        email: "a@client.com",
        password: "portalpass1",
      });
    expect(created.status).toBe(201);
    expect(
      JSON.stringify(created.body),
    ).not.toContain("portalpass1");

    // The client signs in to the portal.
    const login = await request(app)
      .post(
        "/portal/api/auth/login",
      )
      .set("X-Org-Slug", "acme")
      .send({
        email: "a@client.com",
        password: "portalpass1",
      });
    expect(login.status).toBe(200);
    const portalCookie =
      login.headers[
        "set-cookie"
      ] as unknown as string[];

    const me = await request(app)
      .get("/portal/api/me")
      .set("Cookie", portalCookie);
    expect(me.body.client.name).toBe(
      "Client A",
    );

    // The portal shows ONLY client A's projects.
    const projects =
      await request(app)
        .get(
          "/portal/api/projects",
        )
        .set("Cookie", portalCookie);
    expect(
      projects.body.projects,
    ).toHaveLength(1);
    expect(
      projects.body.projects[0].name,
    ).toBe("A's project");
  });

  it("rejects wrong portal credentials and unauthenticated access", async () => {
    const { app, ownerCookie } =
      await build();
    const clientA =
      await makeClient(
        app,
        ownerCookie,
        "Client A",
      );
    await request(app)
      .post(
        "/api/platform/portal-users",
      )
      .set("Cookie", ownerCookie)
      .send({
        clientId: clientA,
        email: "a@client.com",
        password: "portalpass1",
      });

    const bad = await request(app)
      .post(
        "/portal/api/auth/login",
      )
      .set("X-Org-Slug", "acme")
      .send({
        email: "a@client.com",
        password: "wrong",
      });
    expect(bad.status).toBe(401);

    const noAuth = await request(app)
      .get("/portal/api/projects");
    expect(noAuth.status).toBe(401);
  });
});
