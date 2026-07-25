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
import { BillingService } from "./billing/BillingService";
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
    billing: new BillingService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  async function signup(
    org: string,
    email: string,
  ) {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: org,
        email,
        password: "password123",
      });

    return {
      cookie: res.headers[
        "set-cookie"
      ] as unknown as string[],
      ownerId:
        res.body.user?.id ??
        undefined,
    };
  }

  return { app, signup };
}

describe("Team management", () => {
  it("lists, invites, and enforces the plan seat limit", async () => {
    const { app, signup } =
      await build();
    const { cookie } = await signup(
      "Acme",
      "owner@acme.com",
    );

    const list = await request(app)
      .get("/api/platform/team")
      .set("Cookie", cookie);
    expect(
      list.body.team,
    ).toHaveLength(1);

    // Essentials includes 2 seats; owner is 1, so one invite fits.
    const first = await request(app)
      .post("/api/platform/team")
      .set("Cookie", cookie)
      .send({
        email: "a@acme.com",
        password: "password123",
        role: "member",
      });
    expect(first.status).toBe(201);
    expect(
      first.body.member.role,
    ).toBe("member");

    // The next invite exceeds the seat limit.
    const over = await request(app)
      .post("/api/platform/team")
      .set("Cookie", cookie)
      .send({
        email: "b@acme.com",
        password: "password123",
      });
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe(
      "PLAN_LIMIT",
    );
  });

  it("changes roles but refuses to demote the last owner", async () => {
    const { app, signup } =
      await build();
    const { cookie, ownerId } =
      await signup(
        "Acme",
        "owner@acme.com",
      );

    const invited = await request(app)
      .post("/api/platform/team")
      .set("Cookie", cookie)
      .send({
        email: "a@acme.com",
        password: "password123",
        role: "member",
      });
    const memberId =
      invited.body.member.id;

    const promoted =
      await request(app)
        .patch(
          "/api/platform/team/" +
            memberId,
        )
        .set("Cookie", cookie)
        .send({ role: "admin" });
    expect(
      promoted.body.member.role,
    ).toBe("admin");

    // The sole owner can't demote themselves.
    const demote = await request(app)
      .patch(
        "/api/platform/team/" +
          ownerId,
      )
      .set("Cookie", cookie)
      .send({ role: "member" });
    expect(demote.status).toBe(400);
    expect(
      demote.body.error.code,
    ).toBe("LAST_OWNER");
  });

  it("blocks self-removal, non-owners, and cross-tenant access", async () => {
    const { app, signup } =
      await build();
    const { cookie, ownerId } =
      await signup(
        "Acme",
        "owner@acme.com",
      );

    // Can't remove yourself.
    const self = await request(app)
      .delete(
        "/api/platform/team/" +
          ownerId,
      )
      .set("Cookie", cookie);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe(
      "CANNOT_REMOVE_SELF",
    );

    // A member can't invite.
    await request(app)
      .post("/api/platform/team")
      .set("Cookie", cookie)
      .send({
        email: "m@acme.com",
        password: "password123",
        role: "member",
      })
      .expect(201);
    const memberLogin =
      await request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "m@acme.com",
          password: "password123",
        });
    const denied = await request(app)
      .post("/api/platform/team")
      .set(
        "Cookie",
        memberLogin.headers[
          "set-cookie"
        ],
      )
      .send({
        email: "x@acme.com",
        password: "password123",
      });
    expect(denied.status).toBe(403);

    // Another tenant only ever sees its own team.
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );
    const betaTeam = await request(app)
      .get("/api/platform/team")
      .set("Cookie", beta.cookie);
    expect(
      betaTeam.body.team,
    ).toHaveLength(1);
    expect(
      betaTeam.body.team[0].email,
    ).toBe("owner@beta.com");
  });
});
