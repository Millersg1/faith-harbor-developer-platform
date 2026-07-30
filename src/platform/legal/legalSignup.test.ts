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
import { PlatformLegalService } from "./PlatformLegalService";
import { LegalAcceptanceService } from "./LegalAcceptanceService";
import { LegalAcceptanceRepository } from "./LegalAcceptanceRepository";

function buildApp(
  legal: PlatformLegalService,
  legalAcceptance: LegalAcceptanceService,
) {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(
    new PlatformSessionRepository(),
  );
  const clients = new PlatformClientService(
    new PlatformClientRepository(),
  );
  return createPlatformApp({
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
    legal,
    legalAcceptance,
  });
}

async function publishRequired(legal: PlatformLegalService) {
  const t = await legal.createDraft({
    kind: "terms",
    title: "Terms of Service",
    summary: "s",
    bodyMarkdown: "terms v1",
  });
  await legal.publish(t.id);
  const p = await legal.createDraft({
    kind: "privacy",
    title: "Privacy Policy",
    summary: "s",
    bodyMarkdown: "privacy v1",
  });
  await legal.publish(p.id);
}

describe("signup — Terms/Privacy acceptance", () => {
  it("rejects signup without affirmative acceptance", async () => {
    const legal = new PlatformLegalService();
    await publishRequired(legal);
    const acceptance = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    const app = buildApp(legal, acceptance);

    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
        // acceptTerms omitted
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ACCEPTANCE_REQUIRED");
  });

  it("records the exact accepted versions on successful signup", async () => {
    const legal = new PlatformLegalService();
    await publishRequired(legal);
    const acceptance = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    const app = buildApp(legal, acceptance);

    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
        acceptTerms: true,
      });
    expect(res.status).toBe(201);
    const orgId = res.body.organization.id as string;
    const userId = res.body.user.id as string;

    await runWithTenant({ organizationId: orgId }, async () => {
      const rows = await acceptance.listForUser(userId);
      const kinds = rows
        .map((r) => `${r.documentKind}:${r.documentVersion}`)
        .sort();
      expect(kinds).toEqual(["privacy:1", "terms:1"]);
      expect(rows.every((r) => r.source === "signup")).toBe(true);
    });
  });

  it("does not require acceptance when no required document is published", async () => {
    // Terms/Privacy still drafts (not published) → acceptance not enforced.
    const legal = new PlatformLegalService();
    const acceptance = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    const app = buildApp(legal, acceptance);

    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
      });
    expect(res.status).toBe(201);
  });
});
