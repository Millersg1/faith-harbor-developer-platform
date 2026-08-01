import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

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
import { TenantLegalService } from "./TenantLegalService";

const A = "/api/platform/legal-workspace";
const FULL = {
  legalName: "Acme LLC",
  publicName: "Acme",
  infoCollected: "Name and email.",
  infoUse: "To provide services.",
  privacyContact: "privacy@acme.example",
};

function build() {
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
    tenantLegal: new TenantLegalService(),
    baseDomain: "allelitecloud.com",
  });
  return { app, organizations, users, sessions };
}

async function signupOwner(app: ReturnType<typeof build>["app"]) {
  const res = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      email: "owner@acme.com",
      password: "password123",
    });
  return {
    cookie: res.headers["set-cookie"] as unknown as string[],
    orgId: res.body.organization.id as string,
    slug: res.body.organization.slug as string,
  };
}

describe("tenant legal workspace API — auth & roles", () => {
  it("requires authentication", async () => {
    const { app } = build();
    const res = await request(app).get(`${A}/questionnaire`);
    expect(res.status).toBe(401);
  });

  it("lets an owner save the questionnaire but forbids a member", async () => {
    const { app, users, sessions } = build();
    const owner = await signupOwner(app);

    const ok = await request(app)
      .put(`${A}/questionnaire`)
      .set("Cookie", owner.cookie)
      .send({ answers: FULL });
    expect(ok.status).toBe(200);
    expect(ok.body.answers.legalName).toBe("Acme LLC");

    // Create a member in the same org and sign them in.
    const memberToken = await runWithTenant(
      { organizationId: owner.orgId },
      async () => {
        const m = await users.create({
          email: "member@acme.com",
          password: "password123",
          name: "Mem",
          role: "member",
        });
        return (await sessions.createForUser(m)).token;
      },
    );
    const memberCookie = [`aec_session=${memberToken}`];

    // Member can READ.
    const read = await request(app)
      .get(`${A}/questionnaire`)
      .set("Cookie", memberCookie);
    expect(read.status).toBe(200);

    // Member cannot WRITE.
    const forbidden = await request(app)
      .put(`${A}/questionnaire`)
      .set("Cookie", memberCookie)
      .send({ answers: { legalName: "Hacker" } });
    expect(forbidden.status).toBe(403);
  });
});

describe("tenant legal workspace API — generate & publish", () => {
  it("generates, reviews, and publishes; blocks publish with missing facts", async () => {
    const { app } = build();
    const owner = await signupOwner(app);

    // Missing facts first -> generated body has TODO, publish blocked.
    await request(app)
      .put(`${A}/questionnaire`)
      .set("Cookie", owner.cookie)
      .send({ answers: { legalName: "Acme LLC" } });
    const gen1 = await request(app)
      .post(`${A}/documents/privacy/generate`)
      .set("Cookie", owner.cookie);
    expect(gen1.status).toBe(201);
    expect(gen1.body.missingFacts.length).toBeGreaterThan(0);
    await request(app)
      .post(`${A}/documents/${gen1.body.document.id}/review`)
      .set("Cookie", owner.cookie);
    const badPub = await request(app)
      .post(`${A}/documents/${gen1.body.document.id}/publish`)
      .set("Cookie", owner.cookie);
    expect(badPub.status).toBe(400);

    // Full answers -> generate v2, review, publish.
    await request(app)
      .put(`${A}/questionnaire`)
      .set("Cookie", owner.cookie)
      .send({ answers: FULL });
    const gen2 = await request(app)
      .post(`${A}/documents/privacy/generate`)
      .set("Cookie", owner.cookie);
    expect(gen2.body.missingFacts).toHaveLength(0);
    const id = gen2.body.document.id as string;
    await request(app)
      .post(`${A}/documents/${id}/review`)
      .set("Cookie", owner.cookie);
    const pub = await request(app)
      .post(`${A}/documents/${id}/publish`)
      .set("Cookie", owner.cookie)
      .send({ effectiveDate: "2026-08-01" });
    expect(pub.status).toBe(200);
    expect(pub.body.document.status).toBe("published");
  });
});

describe("tenant public legal pages — routing & safety", () => {
  let app: ReturnType<typeof build>["app"];
  let slug: string;

  beforeAll(async () => {
    const b = build();
    app = b.app;
    const owner = await signupOwner(app);
    slug = owner.slug;
    await request(app)
      .put(`${A}/questionnaire`)
      .set("Cookie", owner.cookie)
      .send({
        answers: {
          ...FULL,
          // XSS + unsafe link smuggled into an answer.
          infoUse:
            "We use it.\n\n<script>alert('x')</script>\n\n[bad](javascript:alert(1))",
        },
      });
    const gen = await request(app)
      .post(`${A}/documents/privacy/generate`)
      .set("Cookie", owner.cookie);
    const id = gen.body.document.id as string;
    await request(app)
      .post(`${A}/documents/${id}/review`)
      .set("Cookie", owner.cookie);
    await request(app)
      .post(`${A}/documents/${id}/publish`)
      .set("Cookie", owner.cookie);
  });

  it("serves the published page on the tenant subdomain, branded and safe", async () => {
    const res = await request(app)
      .get("/privacy")
      .set("Host", `${slug}.allelitecloud.com`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("html");
    expect(res.text).toContain("Acme"); // business name
    expect(res.text).toContain("Version 1");
    // XSS neutralized; unsafe link is not a real href.
    expect(res.text).not.toContain("<script>alert('x')</script>");
    expect(res.text).toContain("&lt;script&gt;");
    expect(res.text).not.toContain('href="javascript:');
  });

  it("returns 404 on the apex host (no tenant)", async () => {
    const res = await request(app)
      .get("/privacy")
      .set("Host", "allelitecloud.com");
    expect(res.status).toBe(404);
  });

  it("does not serve an unpublished kind (no leak) -> 404", async () => {
    const res = await request(app)
      .get("/terms")
      .set("Host", `${slug}.allelitecloud.com`);
    expect(res.status).toBe(404);
  });

  it("does not serve one tenant's doc on another tenant's subdomain", async () => {
    const other = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Other Co",
        email: "o@other.com",
        password: "password123",
      });
    const otherSlug = other.body.organization.slug as string;
    const res = await request(app)
      .get("/privacy")
      .set("Host", `${otherSlug}.allelitecloud.com`);
    // Other tenant never published a privacy doc.
    expect(res.status).toBe(404);
  });
});
