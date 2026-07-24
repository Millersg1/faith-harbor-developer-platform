import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
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
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import {
  DisconnectedWebsiteGenerator,
  extractHtml,
  OpenAiWebsiteGenerator,
  type GeneratorFetch,
  type WebsiteGenerator,
} from "./websites/WebsiteGenerator";

/** A stub generator that echoes the brief into a fake HTML document. */
const stubGenerator: WebsiteGenerator = {
  isConnected: () => true,
  generate: async (brief) => ({
    html:
      "<!doctype html><html><head><title>" +
      brief.name +
      "</title></head><body><h1>" +
      brief.name +
      "</h1><p>" +
      brief.description +
      "</p></body></html>",
    model: "stub",
  }),
};

async function build(
  generator: WebsiteGenerator = stubGenerator,
) {
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
    websites:
      new PlatformWebsiteService(
        new PlatformWebsiteRepository(),
        generator,
        clients,
      ),
    billing: new BillingService(),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  async function signup(
    name: string,
    email: string,
  ): Promise<string[]> {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: name,
        email,
        password: "password123",
      });

    return res.headers[
      "set-cookie"
    ] as unknown as string[];
  }

  return { app, signup };
}

describe("Website builder", () => {
  it("extracts HTML from a model response, fenced or plain", () => {
    expect(
      extractHtml(
        "```html\n<!doctype html><html></html>\n```",
      ),
    ).toContain("<!doctype html>");
    expect(
      extractHtml(
        "<html><body>hi</body></html>",
      ),
    ).toContain("<body>hi</body>");
    expect(
      extractHtml(
        "Sorry, I can't do that.",
      ),
    ).toBe("");
  });

  it("never leaks a website across tenants", async () => {
    const repo =
      new PlatformWebsiteRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "w1",
          name: "Site A",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        }),
    );

    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);

    const bGet = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.get("w1"),
    );
    expect(bGet).toBeUndefined();
  });

  it("creates, generates, and previews a site", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", owner)
      .send({
        name: "Acme Bakery",
        brief:
          "A Miami bakery for Cuban pastries.",
      });
    expect(created.status).toBe(201);
    expect(
      created.body.website.hasContent,
    ).toBe(false);
    const id =
      created.body.website.id;

    const list = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", owner);
    expect(
      list.body.generationAvailable,
    ).toBe(true);

    const generated =
      await request(app)
        .post(
          "/api/platform/websites/" +
            id +
            "/generate",
        )
        .set("Cookie", owner);
    expect(generated.status).toBe(200);
    expect(
      generated.body.website
        .hasContent,
    ).toBe(true);

    const preview = await request(app)
      .get(
        "/api/platform/websites/" +
          id +
          "/preview",
      )
      .set("Cookie", owner);
    expect(preview.status).toBe(200);
    expect(preview.text).toContain(
      "Acme Bakery",
    );
    // The AI-generated body is served sandboxed (no script, no origin).
    expect(
      preview.headers[
        "content-security-policy"
      ],
    ).toContain("sandbox");
    expect(
      preview.headers[
        "x-content-type-options"
      ],
    ).toBe("nosniff");
  });

  it("returns 503 when AI generation isn't configured", async () => {
    const { app, signup } =
      await build(
        new DisconnectedWebsiteGenerator(),
      );
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", owner)
      .send({ name: "Acme" });

    const list = await request(app)
      .get("/api/platform/websites")
      .set("Cookie", owner);
    expect(
      list.body.generationAvailable,
    ).toBe(false);

    const gen = await request(app)
      .post(
        "/api/platform/websites/" +
          created.body.website.id +
          "/generate",
      )
      .set("Cookie", owner);
    expect(gen.status).toBe(503);
    expect(gen.body.error.code).toBe(
      "AI_NOT_CONFIGURED",
    );
  });

  it("gates sites by plan and blocks another tenant's client", async () => {
    const { app, signup } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );

    // Essentials includes 1 site.
    await request(app)
      .post("/api/platform/websites")
      .set("Cookie", acme)
      .send({ name: "One" })
      .expect(201);

    const blocked = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", acme)
      .send({ name: "Two" });
    expect(blocked.status).toBe(402);

    // A Beta site referencing an Acme client is rejected.
    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });

    const cross = await request(app)
      .post("/api/platform/websites")
      .set("Cookie", beta)
      .send({
        name: "Cross",
        clientId:
          client.body.client.id,
      });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe(
      "UNKNOWN_CLIENT",
    );
  });

  it("drives the OpenAI generator through a stub fetch", async () => {
    const fetchStub: GeneratorFetch =
      async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: "gpt-4o-mini",
            choices: [
              {
                message: {
                  content:
                    "```html\n<!doctype html><html><body>Bakery</body></html>\n```",
                },
              },
            ],
          }),
      });

    const generator =
      new OpenAiWebsiteGenerator(
        { apiKey: "sk-test" },
        fetchStub,
      );

    const result =
      await generator.generate({
        name: "Bakery",
        description: "A bakery.",
      });

    expect(result.html).toContain(
      "<body>Bakery</body>",
    );
    expect(result.model).toBe(
      "gpt-4o-mini",
    );
  });
});
