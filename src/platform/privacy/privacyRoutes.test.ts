import request from "supertest";
import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { OrganizationDomainRepository } from "../../tenancy/OrganizationDomainRepository";
import {
  verificationHost,
  verificationValue,
} from "../../tenancy/OrganizationDomain";
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
import type { PlatformEmailService } from "../email/PlatformEmailService";
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

  it("a spoofed Host cannot poison the emailed verification link", async () => {
    const sent: { to: string; subject: string; body: string }[] = [];
    const emailStub = {
      sendQuietly: async (r: {
        to: string;
        subject: string;
        body: string;
      }) => {
        sent.push(r);
      },
    } as unknown as PlatformEmailService;
    const organizations = new OrganizationService();
    const users = new PlatformUserService(new PlatformUserRepository());
    const sessions = new PlatformSessionService(
      new PlatformSessionRepository(),
    );
    const clients = new PlatformClientService(
      new PlatformClientRepository(),
    );
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
      privacy: new PrivacyRequestService(),
      email: emailStub,
      baseDomain: "allelitecloud.com",
    });
    // Forged host -> fail closed (404); no request created, no email sent.
    const forged = await request(app)
      .post("/privacy-requests")
      .set("Host", "evil.example.com")
      .send({ ...form, email: "victim@example.com" });
    expect(forged.status).toBe(404);
    expect(sent).toHaveLength(0);
    // Apex -> platform; the token-bearing link uses the configured base domain.
    const apex = await request(app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "p@example.com" });
    expect(apex.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain(
      "allelitecloud.com/privacy-request/verify?token=",
    );
    expect(sent[0].body).not.toContain("evil.example.com");
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

describe("privacy intake host boundary (fail-closed)", () => {
  it("rejects unknown, forged, and malformed hosts with 404", async () => {
    const { app } = build();
    for (const host of [
      "evil.example.com", // unknown
      "allelitecloud.com.evil.com", // look-alike / forged
      "notarealtenant.allelitecloud.com", // subdomain of a non-existent org
      "", // empty/malformed
      "@@bad@@", // malformed
    ]) {
      const r = await request(app)
        .post("/privacy-requests")
        .set("Host", host)
        .send(form);
      expect(r.status, `host=${host}`).toBe(404);
      const g = await request(app)
        .get("/privacy-request")
        .set("Host", host);
      expect(g.status, `GET host=${host}`).toBe(404);
    }
  });

  it("accepts the apex (platform) and a valid tenant subdomain; ignores a client destination/org", async () => {
    const b = build();
    const owner = await request(b.app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const slug = owner.body.organization.slug as string;
    const orgId = owner.body.organization.id as string;

    // Apex -> platform, even if the body tries to force a tenant org/destination.
    const apex = await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, organizationId: orgId, destination: "tenant" });
    expect(apex.status).toBe(200);
    const plat = await b.privacy.list({ kind: "platform" });
    expect(plat).toHaveLength(1);
    expect(plat[0].organizationId).toBeNull();

    // Tenant subdomain -> tenant, even if the body forges destination=platform.
    const ten = await request(b.app)
      .post("/privacy-requests")
      .set("Host", `${slug}.allelitecloud.com`)
      .send({ ...form, email: "t@example.com", destination: "platform", organizationId: "someone-else" });
    expect(ten.status).toBe(200);
    const tenants = await b.privacy.list({ kind: "tenant", organizationId: orgId });
    expect(tenants).toHaveLength(1);
    expect(tenants[0].organizationId).toBe(orgId);
    // The forged fields did not create a second platform request.
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(1);
  });

  it("accepts a VERIFIED custom domain as a tenant intake", async () => {
    // Build with a domains service whose DNS check we control.
    const txt: Record<string, string[][]> = {};
    const domains = new OrganizationDomainService(
      new OrganizationDomainRepository(),
      { txtResolver: async (h: string) => txt[h] ?? [] },
    );
    const organizations = new OrganizationService();
    const users = new PlatformUserService(new PlatformUserRepository());
    const sessions = new PlatformSessionService(new PlatformSessionRepository());
    const clients = new PlatformClientService(new PlatformClientRepository());
    const privacy = new PrivacyRequestService();
    const app = createPlatformApp({
      organizations, users, sessions,
      branding: new BrandingService(new BrandingRepository()),
      clients,
      projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
      invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
      signup: new PlatformSignupService(organizations, users, sessions),
      domains,
      admins: new PlatformAdminService(),
      adminSessions: new PlatformAdminSessionService(),
      privacy,
      baseDomain: "allelitecloud.com",
    });
    const owner = await request(app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const orgId = owner.body.organization.id as string;

    // Add + verify a custom domain for the org (DNS TXT stubbed).
    const domain = "legal.acmebrand.test";
    const rec = await runWithTenant({ organizationId: orgId }, async () => {
      const added = await domains.add(domain);
      txt[verificationHost(added.domain)] = [
        [verificationValue(added.verificationToken)],
      ];
      return domains.verify(added.id);
    });
    expect(rec.verified).toBe(true);

    // Intake on the verified custom domain -> tenant request for that org.
    const r = await request(app)
      .post("/privacy-requests")
      .set("Host", domain)
      .send({ ...form, email: "cd@example.com" });
    expect(r.status).toBe(200);
    const tenants = await privacy.list({ kind: "tenant", organizationId: orgId });
    expect(tenants).toHaveLength(1);
    // An UNVERIFIED look-alike domain is rejected.
    const bad = await request(app)
      .post("/privacy-requests")
      .set("Host", "legal.notmine.test")
      .send(form);
    expect(bad.status).toBe(404);
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
