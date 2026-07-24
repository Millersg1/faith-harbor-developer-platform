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
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

async function build() {
  // A DNS TXT resolver the test controls: `txtRecords` maps a lookup host
  // to its records, so verification never touches the real network.
  const txtRecords = new Map<
    string,
    string[][]
  >();
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
      new OrganizationDomainService(
        undefined,
        {
          txtResolver: async (host) =>
            txtRecords.get(host) ?? [],
        },
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
    users,
    txtRecords,
    ownerCookie:
      signup.headers["set-cookie"],
    orgId:
      signup.body.organization.id,
  };
}

describe("Custom domains", () => {
  it("lets an owner add, list, and remove a custom domain", async () => {
    const { app, ownerCookie } =
      await build();

    const add = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain:
          "cloud.acme-brand.com",
      });
    expect(add.status).toBe(201);
    expect(
      add.body.domain.domain,
    ).toBe("cloud.acme-brand.com");
    expect(
      add.body.domain.verified,
    ).toBe(false);

    const list = await request(app)
      .get("/api/platform/domains")
      .set("Cookie", ownerCookie);
    expect(
      list.body.domains,
    ).toHaveLength(1);

    const id =
      list.body.domains[0].id;
    await request(app)
      .delete(
        "/api/platform/domains/" + id,
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    const after = await request(app)
      .get("/api/platform/domains")
      .set("Cookie", ownerCookie);
    expect(
      after.body.domains,
    ).toHaveLength(0);
  });

  it("resolves a request by its Host only after the domain is verified", async () => {
    const { app, ownerCookie, txtRecords } =
      await build();

    const add = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain:
          "cloud.acme-brand.com",
      });
    const domain = add.body.domain;

    // Give Acme distinctive branding.
    await request(app)
      .put("/api/platform/branding")
      .set("Cookie", ownerCookie)
      .send({
        displayName: "Acme Cloud",
      });

    // Before verification the host must NOT resolve — an unproven domain
    // can't route to a tenant.
    const before = await request(app)
      .get("/api/platform/branding")
      .set(
        "Host",
        "cloud.acme-brand.com",
      );
    expect(before.status).toBe(400);

    // Publish the expected TXT record, then verify.
    txtRecords.set(
      "_aecloud-verify.cloud.acme-brand.com",
      [
        [
          "aecloud-verify=" +
            domain.verificationToken,
        ],
      ],
    );
    const verify = await request(app)
      .post(
        "/api/platform/domains/" +
          domain.id +
          "/verify",
      )
      .set("Cookie", ownerCookie);
    expect(verify.status).toBe(200);
    expect(
      verify.body.domain.verified,
    ).toBe(true);

    // Now a request arriving on the custom host resolves to Acme, with no
    // slug/header — just the domain.
    const byHost = await request(app)
      .get("/api/platform/branding")
      .set(
        "Host",
        "cloud.acme-brand.com",
      );
    expect(byHost.status).toBe(200);
    expect(
      byHost.body.branding
        .displayName,
    ).toBe("Acme Cloud");

    // An unregistered host is not a tenant.
    const unknown = await request(app)
      .get("/api/platform/branding")
      .set("Host", "nope.example.com");
    expect(unknown.status).toBe(400);
  });

  it("refuses to verify when the DNS TXT record is missing or wrong", async () => {
    const { app, ownerCookie, txtRecords } =
      await build();

    const add = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain:
          "cloud.acme-brand.com",
      });
    const domain = add.body.domain;

    // No TXT record at all → 409, stays unverified.
    const missing = await request(app)
      .post(
        "/api/platform/domains/" +
          domain.id +
          "/verify",
      )
      .set("Cookie", ownerCookie);
    expect(missing.status).toBe(409);

    // A record with the wrong token → still 409.
    txtRecords.set(
      "_aecloud-verify.cloud.acme-brand.com",
      [["aecloud-verify=not-the-token"]],
    );
    const wrong = await request(app)
      .post(
        "/api/platform/domains/" +
          domain.id +
          "/verify",
      )
      .set("Cookie", ownerCookie);
    expect(wrong.status).toBe(409);

    // Confirm it never flipped to verified.
    const list = await request(app)
      .get("/api/platform/domains")
      .set("Cookie", ownerCookie);
    expect(
      list.body.domains[0].verified,
    ).toBe(false);
  });

  it("blocks a domain already claimed by another tenant", async () => {
    const { app, ownerCookie } =
      await build();

    await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({
        domain: "shared.example.com",
      })
      .expect(201);

    const beta = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Beta",
        email: "o@beta.com",
        password: "password123",
      });

    const dup = await request(app)
      .post("/api/platform/domains")
      .set(
        "Cookie",
        beta.headers["set-cookie"],
      )
      .send({
        domain: "shared.example.com",
      });

    expect(dup.status).toBe(409);
  });

  it("rejects an invalid domain and forbids members from adding one", async () => {
    const { app, ownerCookie, users, orgId } =
      await build();

    const bad = await request(app)
      .post("/api/platform/domains")
      .set("Cookie", ownerCookie)
      .send({ domain: "not a domain" });
    expect(bad.status).toBe(400);

    // A member (not owner/admin) cannot add a domain.
    await runWithTenant(
      { organizationId: orgId },
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
      .post("/api/platform/domains")
      .set(
        "Cookie",
        memberLogin.headers[
          "set-cookie"
        ],
      )
      .send({
        domain: "x.example.com",
      });
    expect(denied.status).toBe(403);
  });
});
