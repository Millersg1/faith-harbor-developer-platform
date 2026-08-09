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
import { PlatformAuditService } from "../audit/PlatformAuditService";
import { PlatformAuditRepository } from "../audit/PlatformAuditRepository";
import { PrivacyRequestService } from "./PrivacyRequestService";

const M = "/api/platform/privacy-requests/manage";

function build(email?: PlatformEmailService) {
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
    ...(email ? { email } : {}),
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
      connected: () => true,
      send: async (r: { to: string; subject: string; body: string }) => {
        sent.push(r);
        return { status: "sent" };
      },
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
    // Token travels in the URL FRAGMENT (never a query string), so it can't
    // reach an access log or Referer. The link uses the trusted base domain.
    expect(sent[0].body).toContain(
      "allelitecloud.com/privacy-request/verify#v=",
    );
    expect(sent[0].body).not.toContain("verify?token=");
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

describe("privacy verify + status pages (fragment-exchange, no token in URL)", () => {
  it("GET verify is a neutral exchange page that consumes no token", async () => {
    const b = build();
    const { verifyToken } = await b.privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
    });
    const page = await request(b.app).get("/privacy-request/verify");
    expect(page.status).toBe(200);
    // Neutral page: never contains a token; sets the anti-leak headers.
    expect(page.text).not.toContain(verifyToken);
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.headers["cache-control"]).toMatch(/no-store/);
    expect(page.headers["x-robots-tag"]).toMatch(/noindex/);
    // The token is still single-use afterwards (the GET did not consume it).
    const ok = await b.privacy.verifyEmail(verifyToken);
    expect("record" in ok).toBe(true);
  });

  it("POST verify exchanges the token for a status cookie and a clean redirect", async () => {
    const b = build();
    const { verifyToken } = await b.privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
    });
    const verify = await request(b.app)
      .post("/privacy-request/verify")
      .set("Host", "allelitecloud.com")
      .send({ token: verifyToken });
    expect(verify.status).toBe(200);
    expect(verify.body.ok).toBe(true);
    expect(verify.body.redirect).toBe("/privacy-request/status");
    // The response body NEVER echoes the raw status token, and the redirect
    // target carries no token.
    expect(JSON.stringify(verify.body)).not.toContain(verifyToken);
    // An HttpOnly, SameSite=Strict status-session cookie was set.
    const setCookie = (verify.headers["set-cookie"] as unknown as string[]) ?? [];
    const cookie = setCookie.find((c) => c.startsWith("pr_status="));
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    // Loading the clean status URL with that cookie renders the redacted view.
    const status = await request(b.app)
      .get("/privacy-request/status")
      .set("Cookie", cookie!.split(";")[0]);
    expect(status.status).toBe(200);
    expect(status.text).toMatch(/Privacy request status/i);
    expect(status.headers["cache-control"]).toMatch(/no-store/);

    // Re-using the verification token fails (single-use). The hash is cleared
    // on first use, so a replay is simply "invalid" (even stronger than a
    // recognized "already_used").
    const again = await request(b.app)
      .post("/privacy-request/verify")
      .send({ token: verifyToken });
    expect(again.body.ok).toBe(false);
    expect(["invalid", "already_used"]).toContain(again.body.reason);
  });

  it("status exchange trades a #s= token for the cookie; bad token reveals nothing", async () => {
    const b = build();
    const created = await b.privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
    });
    const verified = await b.privacy.verifyEmail(created.verifyToken);
    const statusToken = "statusToken" in verified ? verified.statusToken : "";

    // Exchange endpoint sets the cookie without returning any requester data.
    const ex = await request(b.app)
      .post("/privacy-request/status/exchange")
      .set("Host", "allelitecloud.com")
      .send({ token: statusToken });
    expect(ex.status).toBe(200);
    expect(ex.body.ok).toBe(true);
    expect(JSON.stringify(ex.body)).not.toMatch(/dana|delete|Dana/i);

    // No cookie + no fragment -> neutral placeholder (no data, not an error).
    const placeholder = await request(b.app).get("/privacy-request/status");
    expect(placeholder.status).toBe(200);
    expect(placeholder.text).toMatch(/Looking up your request|status link/i);
    expect(placeholder.text).not.toContain(statusToken);

    // A bad status token in the exchange is rejected, no data leaked.
    const bad = await request(b.app)
      .post("/privacy-request/status/exchange")
      .send({ token: "0".repeat(64) });
    expect(bad.body.ok).toBe(false);
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

describe("privacy PLATFORM-admin management", () => {
  const A = "/platform/admin/api";
  it("admin manages platform requests; requires admin session; tenant hidden", async () => {
    const organizations = new OrganizationService();
    const users = new PlatformUserService(new PlatformUserRepository());
    const sessions = new PlatformSessionService(
      new PlatformSessionRepository(),
    );
    const clients = new PlatformClientService(
      new PlatformClientRepository(),
    );
    const admins = new PlatformAdminService();
    await admins.create({
      email: "root@allelitecloud.com",
      password: "password123",
    });
    const privacy = new PrivacyRequestService();
    const platformAudit = new PlatformAuditService(
      new PlatformAuditRepository(),
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
      admins,
      adminSessions: new PlatformAdminSessionService(),
      privacy,
      platformAudit,
      baseDomain: "allelitecloud.com",
    });
    // A VERIFIED platform request (verified via the service to reach 'received')
    // + a tenant request (subdomain).
    const owner = await request(app)
      .post("/auth/signup")
      .send({ organizationName: "Acme", email: "o@acme.com", password: "password123" });
    const { verifyToken } = await privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
      email: "p@example.com",
    });
    await privacy.verifyEmail(verifyToken); // -> received
    await request(app).post("/privacy-requests").set("Host", `${owner.body.organization.slug}.allelitecloud.com`).send({ ...form, email: "t@example.com" });

    // Requires an admin session.
    expect((await request(app).get(`${A}/privacy-requests`)).status).toBe(401);
    const login = await request(app)
      .post(`${A}/login`)
      .send({ email: "root@allelitecloud.com", password: "password123" });
    const cookie = login.headers["set-cookie"] as unknown as string[];

    // Admin sees ONLY the platform request (tenant request excluded).
    const list = await request(app).get(`${A}/privacy-requests`).set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0].organizationId).toBeNull();

    // Admin can transition it.
    const id = list.body.requests[0].id as string;
    const t = await request(app)
      .post(`${A}/privacy-requests/${id}/transition`)
      .set("Cookie", cookie)
      .send({ to: "in_review" });
    expect(t.status).toBe(200);
    expect(t.body.request.status).toBe("in_review");

    // The action is recorded in the DURABLE, queryable platform audit trail
    // (not just a console line), with compact metadata and NO PII.
    const audit = await request(app)
      .get(`${A}/privacy-requests/${id}/audit`)
      .set("Cookie", cookie);
    expect(audit.status).toBe(200);
    expect(audit.body.events.length).toBeGreaterThanOrEqual(1);
    const ev = audit.body.events[0];
    expect(ev.action).toBe("privacy_request.status_changed");
    expect(ev.targetId).toBe(id);
    expect(ev.metadata.newStatus).toBe("in_review");
    // No requester PII anywhere in the audit payload.
    expect(JSON.stringify(audit.body)).not.toMatch(/dana|p@example|delete my data/i);
    // The audit endpoint requires an admin session.
    expect(
      (await request(app).get(`${A}/privacy-requests/${id}/audit`)).status,
    ).toBe(401);
  });
});

// A capturing email stub with configurable delivery behaviour.
function emailStub(opts: {
  connected?: boolean;
  fail?: boolean;
  status?: "sent" | "logged" | "failed";
}) {
  const sent: { to: string; subject: string; body: string }[] = [];
  const stub = {
    connected: () => opts.connected ?? true,
    send: async (r: { to: string; subject: string; body: string }) => {
      if (opts.fail) throw new Error("smtp down");
      sent.push(r);
      return { status: opts.status ?? "sent", error: undefined };
    },
    sendQuietly: async (r: { to: string; subject: string; body: string }) => {
      if (!opts.fail) sent.push(r);
    },
  } as unknown as PlatformEmailService;
  return { stub, sent };
}
const tokenFrom = (body: string): string =>
  (body.match(/[a-f0-9]{64}/) ?? [""])[0];

describe("privacy verification-email delivery state (honest & persisted)", () => {
  it("records 'logged' (NOT sent) when no email provider is configured", async () => {
    const b = build(); // no email dependency at all
    await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "noprovider@example.com" });
    const [rec] = await b.privacy.list({ kind: "platform" });
    expect(rec.verifyEmailState).toBe("logged");
    expect(rec.verifyEmailAttempts).toBe(1);
  });

  it("records 'sent' when a connected provider accepts the message", async () => {
    const { stub } = emailStub({ connected: true, status: "sent" });
    const b = build(stub);
    await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "ok@example.com" });
    const [rec] = await b.privacy.list({ kind: "platform" });
    expect(rec.verifyEmailState).toBe("sent");
  });

  it("records 'failed' when the transport throws — never claims it was sent", async () => {
    const { stub, sent } = emailStub({ connected: true, fail: true });
    const b = build(stub);
    const res = await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "fails@example.com" });
    // The requester still gets a generic response (no enumeration, no false
    // "sent" claim to them either).
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    const [rec] = await b.privacy.list({ kind: "platform" });
    expect(rec.verifyEmailState).toBe("failed");
    expect(rec.verifyEmailError).toBeTruthy();
    // The persisted error must never contain a raw token or the description.
    expect(rec.verifyEmailError).not.toMatch(/[a-f0-9]{64}/);
  });
});

describe("privacy verification resend (rotate token, no duplicate, no enumeration)", () => {
  it("rotates the token on the existing request; the old link stops working", async () => {
    const { stub, sent } = emailStub({ connected: true, status: "sent" });
    const b = build(stub);
    await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "resend@example.com" });
    expect(sent).toHaveLength(1);
    const firstToken = tokenFrom(sent[0].body);

    const resend = await request(b.app)
      .post("/privacy-requests/resend")
      .set("Host", "allelitecloud.com")
      .send({ email: "resend@example.com" });
    expect(resend.status).toBe(200);
    expect(resend.body.message).toMatch(/if a pending request/i);
    expect(sent).toHaveLength(2);
    const secondToken = tokenFrom(sent[1].body);
    expect(secondToken).not.toBe(firstToken);

    // No duplicate request was created.
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(1);

    // The OLD token no longer verifies; the NEW one does.
    const old = await b.privacy.verifyEmail(firstToken);
    expect("error" in old).toBe(true);
    const now = await b.privacy.verifyEmail(secondToken);
    expect("record" in now).toBe(true);
  });

  it("stays generic for an unknown email and creates nothing (no enumeration)", async () => {
    const { stub, sent } = emailStub({ connected: true });
    const b = build(stub);
    const resend = await request(b.app)
      .post("/privacy-requests/resend")
      .set("Host", "allelitecloud.com")
      .send({ email: "nobody@example.com" });
    expect(resend.status).toBe(200);
    expect(resend.body.message).toMatch(/if a pending request/i);
    expect(sent).toHaveLength(0);
    expect(await b.privacy.list({ kind: "platform" })).toHaveLength(0);
  });

  it("does not resend for an already-verified request", async () => {
    const { stub, sent } = emailStub({ connected: true, status: "sent" });
    const b = build(stub);
    const created = await b.privacy.create({
      destination: "platform",
      organizationId: null,
      ...form,
      email: "verified@example.com",
    });
    await b.privacy.verifyEmail(created.verifyToken); // now verified
    const resend = await request(b.app)
      .post("/privacy-requests/resend")
      .set("Host", "allelitecloud.com")
      .send({ email: "verified@example.com" });
    expect(resend.status).toBe(200);
    // Generic response, but nothing re-sent (already verified).
    expect(sent).toHaveLength(0);
  });

  it("rate-limits resend abuse (429 after the threshold)", async () => {
    const { stub } = emailStub({ connected: true });
    const b = build(stub);
    await request(b.app)
      .post("/privacy-requests")
      .set("Host", "allelitecloud.com")
      .send({ ...form, email: "abuse@example.com" });
    let sawLimited = false;
    for (let i = 0; i < 6; i++) {
      const r = await request(b.app)
        .post("/privacy-requests/resend")
        .set("Host", "allelitecloud.com")
        .send({ email: "abuse@example.com" });
      if (r.status === 429) sawLimited = true;
    }
    expect(sawLimited).toBe(true);
  });
});
