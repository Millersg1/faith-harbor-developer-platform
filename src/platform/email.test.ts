import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import type { EmailTransport } from "../communications/EmailTransport";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformEmailRepository } from "./email/PlatformEmailRepository";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

async function build(
  email: PlatformEmailService,
) {
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
    email,
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

describe("Platform email", () => {
  it("sends via a configured transport and records the outbox", async () => {
    const sent: string[] = [];
    const transport: EmailTransport = {
      send: async (m) => {
        sent.push(m.to);
        return {
          status: "sent",
          provider: "stub",
        };
      },
    };
    const email =
      new PlatformEmailService(
        new PlatformEmailRepository(),
        transport,
        { connected: true },
      );
    const { app, ownerCookie } =
      await build(email);

    const res = await request(app)
      .post("/api/platform/emails")
      .set("Cookie", ownerCookie)
      .send({
        to: "someone@example.com",
        subject: "Hello",
        body: "Hi there",
      });
    expect(res.status).toBe(201);
    expect(res.body.email.status).toBe(
      "sent",
    );
    expect(sent).toContain(
      "someone@example.com",
    );

    const list = await request(app)
      .get("/api/platform/emails")
      .set("Cookie", ownerCookie);
    expect(list.body.connected).toBe(
      true,
    );
    expect(
      list.body.emails,
    ).toHaveLength(1);
  });

  it("records as 'logged' when no provider is configured", async () => {
    // Default service = LoggingEmailTransport, connected:false.
    const email =
      new PlatformEmailService(
        new PlatformEmailRepository(),
      );
    const { app, ownerCookie } =
      await build(email);

    const res = await request(app)
      .post("/api/platform/emails")
      .set("Cookie", ownerCookie)
      .send({
        to: "someone@example.com",
        subject: "Hi",
        body: "Body",
      });
    expect(res.status).toBe(201);
    expect(res.body.email.status).toBe(
      "logged",
    );

    const list = await request(app)
      .get("/api/platform/emails")
      .set("Cookie", ownerCookie);
    expect(list.body.connected).toBe(
      false,
    );
  });

  it("rejects an invalid recipient", async () => {
    const email =
      new PlatformEmailService(
        new PlatformEmailRepository(),
      );
    const { app, ownerCookie } =
      await build(email);

    const res = await request(app)
      .post("/api/platform/emails")
      .set("Cookie", ownerCookie)
      .send({
        to: "not-an-email",
        subject: "x",
        body: "y",
      });
    expect(res.status).toBe(400);
  });
});
