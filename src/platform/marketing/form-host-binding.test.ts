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
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    forms,
    leads,
    baseDomain: "allelitecloud.com",
  });
  return { app, forms, leads };
}

async function makeOrg(app: ReturnType<typeof build>["app"], name: string) {
  const r = await request(app)
    .post("/auth/signup")
    .send({ organizationName: name, email: `o@${name}.test`, password: "password123" });
  return { id: r.body.organization.id as string, slug: r.body.organization.slug as string };
}

describe("public form host-binding (fail-closed, no cross-tenant)", () => {
  it("serves config on the OWNER's subdomain, the apex, and unknown hosts; 404 on another tenant's host", async () => {
    const { app, forms } = build();
    const a = await makeOrg(app, "acme");
    const b = await makeOrg(app, "beta");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (await forms.create({ name: "Contact", fields: CONTACT_FIELDS })).slug;
    });

    // Owner's own subdomain → allowed.
    const own = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", `${a.slug}.allelitecloud.com`);
    expect(own.status).toBe(200);

    // Apex host (external embedding) → allowed per the documented rule.
    const apex = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "allelitecloud.com");
    expect(apex.status).toBe(200);

    // Unknown/unverified host → resolves to no tenant → allowed (still the
    // owner's form), and never leaks tenant existence.
    const unknown = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", "totally-unknown.example");
    expect(unknown.status).toBe(200);

    // ANOTHER tenant's host + this slug → fail closed with the SAME generic 404.
    const cross = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Host", `${b.slug}.allelitecloud.com`);
    expect(cross.status).toBe(404);
    expect(JSON.stringify(cross.body)).not.toMatch(/acme|beta|org/i);
  });

  it("a cross-tenant host on SUBMIT fails closed and creates no lead", async () => {
    const { app, forms, leads } = build();
    const a = await makeOrg(app, "acme");
    const b = await makeOrg(app, "beta");
    let slug = "";
    await runWithTenant({ organizationId: a.id }, async () => {
      slug = (await forms.create({ name: "Contact", fields: CONTACT_FIELDS })).slug;
    });
    const res = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .set("Host", `${b.slug}.allelitecloud.com`)
      .send({ data: { name: "X", email: "x@example.com" } });
    expect(res.status).toBe(404);
    // No lead was created in EITHER tenant.
    await runWithTenant({ organizationId: a.id }, async () => {
      expect(await leads.list()).toHaveLength(0);
    });
    await runWithTenant({ organizationId: b.id }, async () => {
      expect(await leads.list()).toHaveLength(0);
    });
  });

  it("an unknown slug is a generic 404 regardless of host (no existence leak)", async () => {
    const { app } = build();
    const a = await makeOrg(app, "acme");
    const viaOwner = await request(app)
      .get("/api/public/forms/does-not-exist")
      .set("Host", `${a.slug}.allelitecloud.com`);
    const viaApex = await request(app)
      .get("/api/public/forms/does-not-exist")
      .set("Host", "allelitecloud.com");
    expect(viaOwner.status).toBe(404);
    expect(viaApex.status).toBe(404);
  });
});
