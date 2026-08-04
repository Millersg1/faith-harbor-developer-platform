import request from "supertest";
import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../branding/BrandingRepository";
import { BrandingService } from "../branding/BrandingService";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { createPlatformApp } from "../createPlatformApp";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { PrivacyRequestService } from "./PrivacyRequestService";

const M = "/api/platform/privacy-requests/manage";

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(
    new PlatformSessionRepository(),
  );
  const clients = new PlatformClientService(
    new PlatformClientRepository(),
  );
  const privacy = new PrivacyRequestService();
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    ),
    invoices: new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    ),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    privacy,
    baseDomain: "allelitecloud.com",
  });
  return { app, organizations, users, sessions, privacy };
}

const form = {
  name: "Dana Doe",
  email: "dana@example.com",
  category: "deletion",
  description: "Please delete my data.",
  acknowledge: true,
};

describe("privacy public intake — destination & abuse protection", () => {
  it("apex host creates a PLATFORM request; tenant subdomain creates a TENANT request", async () => {
    const b = build();
    const owner = await request(b.app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const slug = owner.body.organization.slug as string;

    // Apex -> platform
    const plat = await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "p@example.com" });
    expect(plat.status).toBe(200);
    expect(plat.body.message).toMatch(/verification email/i);
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(1);

    // Tenant subdomain -> tenant (scoped to that org)
    const ten = await request(b.app)
      .post("/privacy-requests")
      .set("Host", `${slug}.allelitecloud.com`)
      .send({ ...form, email: "t@example.com" });
    expect(ten.status).toBe(200);
    const orgId = owner.body.organization.id as string;
    expect(
      await b.privacy.list({ kind: "tenant", organizationId: orgId }),
    ).toHaveLength(1);
    // The tenant request is NOT in the platform list, and vice-versa.
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(1);
  });

  it("rate-limits repeated submissions with 429 + Retry-After", async () => {
    const { app } = build();
    let last = 200;
    for (let i = 0; i < 7; i++) {
      const r = await request(app)
        .post("/privacy-requests")
        .set("Host", "allelitecloud.com")
        .send({ ...form, email: "flood@example.com" });
      last = r.status;
      if (r.status === 429) {
        expect(r.headers["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(last).toBe(429);
  });

  it("is enumeration-resistant and validates input", async () => {
    const { app } = build();
    const bad = await request(app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "not-an-email" });
    expect(bad.status).toBe(400);
    // Generic message — no hint about accounts/users.
    expect(JSON.stringify(bad.body)).not.toMatch(/user|account|exists/i);
  });

  it("blocks cross-site submissions (CSRF)", async () => {
    const { app } = build();
    const r = await request(app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .set("Sec-Fetch-Site", "cross-site")
      .send(form);
    expect(r.status).toBe(403);
  });

  it("a forged X-Forwarded-Host cannot select a tenant (app uses Host)", async () => {
    const b = build();
    const owner = await request(b.app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const slug = owner.body.organization.slug as string;
    // Host is apex (platform); X-Forwarded-Host forges the tenant.
    await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .set("X-Forwarded-Host", `${slug}.allelitecloud.com`)
      .send({ ...form, email: "spoof@example.com" });
    // Landed as platform (Host wins), not tenant.
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(1);
    expect(
      await b.privacy.list({
        kind: "tenant",
        organizationId: owner.body.organization.id,
      }),
    ).toHaveLength(0);
  });
});

describe("privacy verify + status pages", () => {
  it("verifies via the emailed token and serves a redacted status page", async () => {
    const b = build();
    // Create through the service to obtain the raw token (as the email would).
    const { verifyToken } = await b.privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
    });
    const verify = await request(b.app).get(
      `/privacy-request/verify?token=${verifyToken}`,
    );
    expect(verify.status).toBe(200);
    expect(verify.text).toMatch(/Email verified/i);
    const m = verify.text.match(/status\?token=([a-f0-9]{64})/);
    expect(m).toBeTruthy();
    const statusToken = m![1];

    const status = await request(b.app).get(
      `/privacy-request/status?token=${statusToken}`,
    );
    expect(status.status).toBe(200);
    expect(status.text).toMatch(/Privacy request status/i);
    // A bad status token yields the "not valid" page, not data.
    const bad = await request(b.app).get(
      "/privacy-request/status?token=" + "0".repeat(64),
    );
    expect(bad.text).toMatch(/not valid/i);
  });
});

describe("privacy management API — roles & isolation", () => {
  it("owner manages; member denied; cross-tenant blocked; platform hidden from tenant", async () => {
    const b = build();
    const owner = await request(b.app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const cookie = owner.headers["set-cookie"] as unknown as string[];
    const orgId = owner.body.organization.id as string;
    const slug = owner.body.organization.slug as string;

    // A tenant request for this org + a platform request.
    await request(b.app).post("/privacy-requests").set("Host", `${slug}.allelitecloud.com`).send({ ...form, email: "t@example.com" });
    await request(b.app).post("/privacy-requests").set("Host", "allelitecloud.com").send({ ...form, email: "p@example.com" });

    // Owner lists ONLY its tenant request (platform request excluded).
    const list = await request(b.app).get(M).set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0].destination).toBe("tenant");

    // Member is denied.
    const memberToken = await runWithTenant(
      { organizationId: orgId },
      async () => {
        const mem = await b.users.create({
          email: "m@acme.com",
          password: "password123",
          role: "member",
        });
        return (await b.sessions.createForUser(mem)).token;
      },
    );
    const denied = await request(b.app)
      .get(M)
      .set("Cookie", [`aec_session=${memberToken}`]);
    expect(denied.status).toBe(403);

    // A second tenant cannot see the first tenant's request.
    const other = await request(b.app)
      .post("/auth/signup")
      .send({ organizationName: "Other", email: "o@other.com", password: "password123" });
    const otherList = await request(b.app)
      .get(M)
      .set("Cookie", other.headers["set-cookie"] as unknown as string[]);
    expect(otherList.body.requests).toHaveLength(0);
  });

  it("unauthenticated management is denied", async () => {
    const { app } = build();
    expect((await request(app).get(M)).status).toBe(401);
  });
});
