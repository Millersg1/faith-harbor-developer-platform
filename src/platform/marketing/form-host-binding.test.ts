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
import { createPlatformApp } from "../createPlatformApp";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import { PlatformFormRepository } from "../forms/PlatformFormRepository";
import { PlatformFormService } from "../forms/PlatformFormService";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";

const CONTACT_FIELDS = [
  { key: "name", type: "text" as const, label: "Name", required: true },
  { key: "email", type: "email" as const, label: "Email", required: true },
];

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
  const forms = new PlatformFormService(new PlatformFormRepository(), { leads });
  const txt: Record<string, string[][]> = {};
  const domains = new OrganizationDomainService(
    new OrganizationDomainRepository(),
    { txtResolver: async (host: string) => txt[host] ?? [] },
  );
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains,
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    forms,
    leads,
    baseDomain: "allelitecloud.com",
  });
  return { app, forms, leads, domains, txt };
}

async function makeOrg(app: ReturnType<typeof build>["app"], name: string) {
  const r = await request(app)
    .post("/auth/signup")
    .send({ organizationName: name, email: `o@${name}.test`, password: "password123" });
  return { id: r.body.organization.id as string, slug: r.body.organization.slug as string };
}

async function verifyDomain(
  b: ReturnType<typeof build>,
  orgId: string,
  domain: string,
) {
  await runWithTenant({ organizationId: orgId }, async () => {
    const added = await b.domains.add(domain);
    b.txt[verificationHost(added.domain)] = [
      [verificationValue(added.verificationToken)],
    ];
    await b.domains.verify(added.id);
  });
}

describe("public form host-binding — allowlist (apex / owner subdomain / owner verified domain)", () => {
  it("allows the owner subdomain, the apex, and the owner's VERIFIED custom domain", async () => {
    const b = build();
    const a = await makeOrg(b.app, "acme");
    await verifyDomain(b, a.id, "leads.acme-brand.test");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (await b.forms.create({ name: "Contact", fields: CONTACT_FIELDS })).slug;
    });
    for (const host of [
      `${a.slug}.allelitecloud.com`,
      "allelitecloud.com",
      "leads.acme-brand.test",
    ]) {
      const res = await request(b.app).get(`/api/public/forms/${slug}`).set("Host", host);
      expect(res.status, host).toBe(200);
    }
  });

  it("REJECTS unknown, unverified-custom-domain, malformed, and another-tenant hosts with a generic 404", async () => {
    const b = build();
    const a = await makeOrg(b.app, "acme");
    const other = await makeOrg(b.app, "beta");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (await b.forms.create({ name: "Contact", fields: CONTACT_FIELDS })).slug;
    });
    for (const host of [
      "totally-unknown.example", // unknown Host
      "unverified.acme-brand.test", // unverified custom domain
      "!!!malformed:::", // malformed
      `${other.slug}.allelitecloud.com`, // another tenant's subdomain
    ]) {
      const res = await request(b.app).get(`/api/public/forms/${slug}`).set("Host", host);
      expect(res.status, host).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/acme|beta|org/i);
    }
  });

  it("a forged X-Forwarded-Host cannot smuggle a foreign host (Host is authoritative)", async () => {
    const b = build();
    const a = await makeOrg(b.app, "acme");
    const other = await makeOrg(b.app, "beta");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (await b.forms.create({ name: "Contact", fields: CONTACT_FIELDS })).slug;
    });
    // Real Host is the owner's → allowed; forged XFH pointing at another tenant
    // is ignored.
    const ok = await request(b.app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", `${a.slug}.allelitecloud.com`)
      .set("X-Forwarded-Host", `${other.slug}.allelitecloud.com`);
    expect(ok.status).toBe(200);
    // Real Host is unknown → rejected, regardless of a valid-looking XFH.
    const bad = await request(b.app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "unknown.example")
      .set("X-Forwarded-Host", `${a.slug}.allelitecloud.com`);
    expect(bad.status).toBe(404);
  });
});

describe("host-binding vs CORS are independent", () => {
  it("an ALLOWED Origin on a permitted Host works; an unapproved Origin gets no CORS", async () => {
    const b = build();
    const a = await makeOrg(b.app, "acme");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (
        await b.forms.create({
          name: "Contact",
          fields: CONTACT_FIELDS,
          settings: { allowedOrigins: ["https://acme-site.example"] },
        })
      ).slug;
    });
    // Allowed Origin + apex Host → served with the echoed CORS origin.
    const ok = await request(b.app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "allelitecloud.com")
      .set("Origin", "https://acme-site.example");
    expect(ok.status).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://acme-site.example");
    // Unapproved Origin (still a permitted Host) → served, but NO CORS grant.
    const noCors = await request(b.app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "allelitecloud.com")
      .set("Origin", "https://evil.example");
    expect(noCors.status).toBe(200);
    expect(noCors.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("an ALLOWED Origin on an UNKNOWN Host still fails (Host != CORS authorization)", async () => {
    const b = build();
    const a = await makeOrg(b.app, "acme");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (
        await b.forms.create({
          name: "Contact",
          fields: CONTACT_FIELDS,
          settings: { allowedOrigins: ["https://acme-site.example"] },
        })
      ).slug;
    });
    const res = await request(b.app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "unknown.example")
      .set("Origin", "https://acme-site.example");
    expect(res.status).toBe(404); // host boundary wins, independent of CORS
  });
});

