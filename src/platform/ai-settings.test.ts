import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
import { AiUsageRepository } from "./ai/AiUsageRepository";
import { OrganizationAiSettingsRepository } from "./ai/OrganizationAiSettingsRepository";
import { OrganizationAiSettingsService } from "./ai/OrganizationAiSettingsService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
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
      html: "<!doctype html><html><body>platform</body></html>",
      model: "gpt-4o-mini",
      usage: {
        inputTokens: 100,
        outputTokens: 200,
      },
    }),
  };

async function build() {
  const captured: {
    apiKey?: string;
    provider?: string;
  } = {};

  const factory: GeneratorFactory = (
    input,
  ) => {
    captured.apiKey = input.apiKey;
    captured.provider =
      input.provider;
    return {
      isConnected: () => true,
      generate: async () => ({
        html: "<!doctype html><html><body>byo</body></html>",
        model:
          input.model || "byo-model",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
      }),
    };
  };

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
  const websites =
    new PlatformWebsiteService(
      new PlatformWebsiteRepository(),
      platformGenerator,
      clients,
      aiSettings,
      aiUsage,
      factory,
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
    billing: new BillingService(),
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
    captured,
    users,
    ownerCookie:
      signup.headers["set-cookie"],
    orgId:
      signup.body.organization.id,
  };
}

async function makeAndGenerate(
  app: ReturnType<
    typeof createPlatformApp
  >,
  cookie: string[],
): Promise<void> {
  const created = await request(app)
    .post("/api/platform/websites")
    .set("Cookie", cookie)
    .send({
      name: "Acme",
      brief: "A shop.",
    });

  await request(app)
    .post(
      "/api/platform/websites/" +
        created.body.website.id +
        "/generate",
    )
    .set("Cookie", cookie)
    .expect(200);
}

describe("AI settings & usage metering", () => {
  it("stores a BYO key and never returns it in full", async () => {
    const { app, ownerCookie } =
      await build();

    const put = await request(app)
      .put("/api/platform/ai-settings")
      .set("Cookie", ownerCookie)
      .send({
        provider: "openai",
        apiKey:
          "sk-secret-1234567890",
      });
    expect(put.status).toBe(200);
    expect(
      put.body.settings.hasKey,
    ).toBe(true);
    expect(
      put.body.settings.keyHint,
    ).not.toContain("secret");
    expect(
      JSON.stringify(put.body),
    ).not.toContain(
      "sk-secret-1234567890",
    );

    const get = await request(app)
      .get("/api/platform/ai-settings")
      .set("Cookie", ownerCookie);
    expect(
      get.body.settings.provider,
    ).toBe("openai");
    expect(
      get.body.settings.hasKey,
    ).toBe(true);
  });

  it("forbids a non-owner from setting the key and rejects a bad key", async () => {
    const { app, ownerCookie, users, orgId } =
      await build();

    const bad = await request(app)
      .put("/api/platform/ai-settings")
      .set("Cookie", ownerCookie)
      .send({
        provider: "openai",
        apiKey: "short",
      });
    expect(bad.status).toBe(400);

    await runWithTenant(
      { organizationId: orgId },
      () =>
        users.create({
          email: "member@acme.com",
          password: "password123",
          role: "member",
        }),
    );
    const memberLogin =
      await request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "member@acme.com",
          password: "password123",
        });

    const denied = await request(app)
      .put("/api/platform/ai-settings")
      .set(
        "Cookie",
        memberLogin.headers[
          "set-cookie"
        ],
      )
      .send({
        provider: "openai",
        apiKey:
          "sk-1234567890abcd",
      });
    expect(denied.status).toBe(403);
  });

  it("meters platform-key generation as a platform cost", async () => {
    const { app, ownerCookie } =
      await build();

    await makeAndGenerate(
      app,
      ownerCookie,
    );

    const usage = await request(app)
      .get("/api/platform/ai-usage")
      .set("Cookie", ownerCookie);
    expect(
      usage.body.usage.generations,
    ).toBe(1);
    expect(
      usage.body.usage.inputTokens,
    ).toBe(100);
    // No tenant key → the platform bears the cost.
    expect(
      usage.body.platformCostUsd,
    ).toBeGreaterThan(0);
  });

  it("runs BYO-key generation on the tenant's key with zero platform cost", async () => {
    const { app, ownerCookie, captured } =
      await build();

    await request(app)
      .put("/api/platform/ai-settings")
      .set("Cookie", ownerCookie)
      .send({
        provider: "openai",
        apiKey:
          "sk-tenant-9876543210",
      })
      .expect(200);

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", ownerCookie)
      .send({ name: "Acme" });
    const gen = await request(app)
      .post(
        "/api/platform/websites/" +
          created.body.website.id +
          "/generate",
      )
      .set("Cookie", ownerCookie);
    expect(gen.status).toBe(200);

    // The tenant's own key drove the generation.
    expect(captured.apiKey).toBe(
      "sk-tenant-9876543210",
    );

    const preview = await request(app)
      .get(
        "/api/platform/websites/" +
          created.body.website.id +
          "/preview",
      )
      .set("Cookie", ownerCookie);
    expect(preview.text).toContain(
      "byo",
    );

    const usage = await request(app)
      .get("/api/platform/ai-usage")
      .set("Cookie", ownerCookie);
    expect(
      usage.body.usage.generations,
    ).toBe(1);
    // On their own key → not the platform's cost.
    expect(
      usage.body.platformCostUsd,
    ).toBe(0);
  });
});
