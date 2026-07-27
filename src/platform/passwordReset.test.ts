import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import type { EmailMessage } from "../communications/EmailTypes";
import type { EmailTransport } from "../communications/EmailTransport";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { PasswordResetRepository } from "./auth/PasswordResetRepository";
import { PasswordResetService } from "./auth/PasswordResetService";
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

function build() {
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

  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: async (m) => {
      sent.push(m);

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

  const passwordReset =
    new PasswordResetService(
      new PasswordResetRepository(),
      users,
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
    passwordReset,
    email,
    domains:
      new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  return { app, sent };
}

async function signup(
  app: ReturnType<
    typeof build
  >["app"],
  organizationName: string,
  slug: string,
  email: string,
) {
  await request(app)
    .post("/auth/signup")
    .send({
      organizationName,
      slug,
      email,
      password: "password123",
    });
}

/**
 * Pulls the /reset?token=... value out of a reset email body.
 */
function tokenFrom(
  body: string,
): string {
  const match = body.match(
    /token=([A-Za-z0-9%]+)/,
  );

  return match
    ? decodeURIComponent(match[1])
    : "";
}

describe("Password reset", () => {
  it("emails a link and lets the user set a new password", async () => {
    const { app, sent } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );

    const forgot = await request(app)
      .post("/auth/forgot-password")
      .set("X-Org-Slug", "acme")
      .send({ email: "owner@acme.com" });
    expect(forgot.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(
      "owner@acme.com",
    );

    const token = tokenFrom(
      sent[0].body,
    );
    expect(token.length).toBeGreaterThan(
      10,
    );
    // The link is built server-side on the base host with the tenant slug as an
    // `org` param (not a request-derived host).
    expect(sent[0].body).toContain(
      "https://allelitecloud.com/reset",
    );
    expect(sent[0].body).toContain(
      "org=acme",
    );

    const reset = await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token,
        newPassword: "brand-new-pass",
      });
    expect(reset.status).toBe(200);

    // New password works…
    const good = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "brand-new-pass",
      });
    expect(good.status).toBe(200);

    // …and the old one no longer does.
    const bad = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "password123",
      });
    expect(bad.status).toBe(401);
  });

  it("ignores a forged Host header when building the reset link", async () => {
    const { app, sent } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );

    await request(app)
      .post("/auth/forgot-password")
      .set("X-Org-Slug", "acme")
      .set("Host", "evil.attacker.com")
      .send({
        email: "owner@acme.com",
      });

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain(
      "https://allelitecloud.com/reset",
    );
    expect(sent[0].body).toContain(
      "org=acme",
    );
    expect(sent[0].body).not.toContain(
      "evil.attacker.com",
    );
  });

  it("responds the same for an unknown email and sends nothing", async () => {
    const { app, sent } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );

    const res = await request(app)
      .post("/auth/forgot-password")
      .set("X-Org-Slug", "acme")
      .send({
        email: "nobody@acme.com",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("rejects an invalid token", async () => {
    const { app } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );

    const res = await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token: "not-a-real-token",
        newPassword: "brand-new-pass",
      });
    expect(res.status).toBe(400);
  });

  it("burns the token after one use", async () => {
    const { app, sent } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );

    await request(app)
      .post("/auth/forgot-password")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
      });
    const token = tokenFrom(
      sent[0].body,
    );

    const first = await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token,
        newPassword: "brand-new-pass",
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token,
        newPassword: "another-pass-99",
      });
    expect(second.status).toBe(400);
  });

  it("won't let a token from one org reset a password in another", async () => {
    const { app, sent } = build();
    await signup(
      app,
      "Acme",
      "acme",
      "owner@acme.com",
    );
    await signup(
      app,
      "Globex",
      "globex",
      "owner@globex.com",
    );

    // Mint a reset token for Acme's owner.
    await request(app)
      .post("/auth/forgot-password")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
      });
    const token = tokenFrom(
      sent[0].body,
    );

    // Try to consume it in Globex's tenant.
    const res = await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "globex")
      .send({
        token,
        newPassword: "hijacked-pass-9",
      });
    expect(res.status).toBe(400);

    // Acme's owner still can't sign in with the attempted new password.
    const login = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "hijacked-pass-9",
      });
    expect(login.status).toBe(401);
  });
});
