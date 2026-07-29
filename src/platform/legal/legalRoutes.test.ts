import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

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
import { platformLegalSeeds } from "./content/platformLegalContent";

async function buildApp(legal: PlatformLegalService) {
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
  });
}

describe("legal routes — published vs draft visibility", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const legal = new PlatformLegalService();
    await legal.seedIfEmpty(platformLegalSeeds());
    app = await buildApp(legal);
  });

  it("serves the /legal index listing all policies", async () => {
    const res = await request(app).get("/legal");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Cookie Policy");
    expect(res.text).toContain("Terms of Service");
    // Unpublished ones are marked, not linked to draft content.
    expect(res.text).toContain("being finalized");
  });

  it("serves a published document with metadata", async () => {
    const res = await request(app).get("/legal/cookies");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("html");
    expect(res.text).toContain("Cookie Policy");
    expect(res.text).toContain("Version 1");
    expect(res.text).toContain("strictly-necessary");
  });

  it("never exposes a draft body on a public route", async () => {
    const res = await request(app).get("/legal/terms");
    expect(res.status).toBe(200);
    expect(res.text).toContain("being finalized");
    // The draft body carries owner-only notes that must never render publicly.
    expect(res.text).not.toContain("OWNER DECISION REQUIRED");
  });

  it("falls through to 404 for an unknown legal slug", async () => {
    const res = await request(app).get("/legal/not-a-real-policy");
    expect(res.status).toBe(404);
  });
});

describe("legal routes — safe rendering", () => {
  it("escapes script/HTML in a document body when served", async () => {
    const legal = new PlatformLegalService();
    const draft = await legal.createDraft({
      kind: "cookies",
      title: "Cookie Policy",
      summary: "safe summary",
      bodyMarkdown:
        "Normal text.\n\n<script>alert('xss')</script>\n\n[bad](javascript:alert(1))",
    });
    await legal.publish(draft.id);
    const app = await buildApp(legal);

    const res = await request(app).get("/legal/cookies");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>alert('xss')</script>");
    expect(res.text).toContain("&lt;script&gt;");
    // The js-scheme link must never become a real href (inert text is fine).
    expect(res.text).not.toContain('href="javascript:');
  });
});
