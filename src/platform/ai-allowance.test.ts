import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { AiUsageRepository } from "./ai/AiUsageRepository";
import { OrganizationAiSettingsRepository } from "./ai/OrganizationAiSettingsRepository";
import { OrganizationAiSettingsService } from "./ai/OrganizationAiSettingsService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
import { SubscriptionRepository } from "./billing/SubscriptionRepository";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { PlatformWebsiteRepository } from "./websites/PlatformWebsiteRepository";
import {
  PlatformWebsiteService,
  type GeneratorFactory,
} from "./websites/PlatformWebsiteService";
import type { WebsiteGenerator } from "./websites/WebsiteGenerator";

const platformGenerator: WebsiteGenerator =
  {
    isConnected: () => true,
    generate: async () => ({
      html: "<!doctype html><html><body>x</body></html>",
      model: "gpt-4o-mini",
      usage: {
        inputTokens: 50,
        outputTokens: 50,
      },
    }),
  };

const byoFactory: GeneratorFactory =
  () => ({
    isConnected: () => true,
    generate: async () => ({
      html: "<!doctype html><html><body>byo</body></html>",
      model: "byo",
      usage: {
        inputTokens: 5,
        outputTokens: 5,
      },
    }),
  });

async function build() {
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
  const aiSettings =
    new OrganizationAiSettingsService(
      new OrganizationAiSettingsRepository(),
    );
  const aiUsage =
    new AiUsageRepository();
  const billing = new BillingService(
    new SubscriptionRepository(),
  );
  const websites =
    new PlatformWebsiteService(
      new PlatformWebsiteRepository(),
      platformGenerator,
      clients,
      aiSettings,
      aiUsage,
      billing,
      byoFactory,
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
    websites,
    aiSettings,
    aiUsage,
    billing,
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

describe("AI allowance caps", () => {
  it("caps platform-AI generations at the plan's monthly allowance", async () => {
    const { app, ownerCookie } =
      await build();

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", ownerCookie)
      .send({ name: "Acme" });
    const id =
      created.body.website.id;

    // Essentials includes 15/month. The first 15 succeed.
    for (let i = 0; i < 15; i++) {
      await request(app)
        .post(
          "/api/platform/websites/" +
            id +
            "/generate",
        )
        .set("Cookie", ownerCookie)
        .expect(200);
    }

    // The 16th is blocked with an upgrade prompt.
    const over = await request(app)
      .post(
        "/api/platform/websites/" +
          id +
          "/generate",
      )
      .set("Cookie", ownerCookie);
    expect(over.status).toBe(402);
    expect(over.body.error.code).toBe(
      "AI_ALLOWANCE_REACHED",
    );

    // Usage reflects the cap.
    const usage = await request(app)
      .get("/api/platform/ai-usage")
      .set("Cookie", ownerCookie);
    expect(
      usage.body.aiAllowance,
    ).toBe(15);
    expect(
      usage.body
        .platformGenerationsUsed,
    ).toBe(15);
  });

  it("does not cap a tenant running on their own key", async () => {
    const { app, ownerCookie } =
      await build();

    await request(app)
      .put("/api/platform/ai-settings")
      .set("Cookie", ownerCookie)
      .send({
        provider: "openai",
        apiKey: "sk-own-1234567890",
      })
      .expect(200);

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", ownerCookie)
      .send({ name: "Acme" });
    const id =
      created.body.website.id;

    // Well past the platform allowance — all succeed on the tenant's key.
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post(
          "/api/platform/websites/" +
            id +
            "/generate",
        )
        .set("Cookie", ownerCookie)
        .expect(200);
    }

    // None of it counts against the platform allowance.
    const usage = await request(app)
      .get("/api/platform/ai-usage")
      .set("Cookie", ownerCookie);
    expect(
      usage.body
        .platformGenerationsUsed,
    ).toBe(0);
    expect(
      usage.body.platformCostUsd,
    ).toBe(0);
  });
});
