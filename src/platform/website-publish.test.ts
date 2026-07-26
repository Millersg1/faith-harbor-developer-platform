import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainRepository } from "../tenancy/OrganizationDomainRepository";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
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
import type { WebsiteGenerator } from "./websites/WebsiteGenerator";

const stubGenerator: WebsiteGenerator =
  {
    isConnected: () => true,
    generate: async (brief) => ({
      html:
        "<!doctype html><html><body>PUBLISHED SITE: " +
        brief.name +
        "</body></html>",
      model: "stub",
    }),
  };

async function build() {
  const txtRecords = new Map<
    string,
    string[][]
  >();
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
      new OrganizationDomainService(
        new OrganizationDomainRepository(),
        {
          txtResolver: async (host) =>
            txtRecords.get(host) ??
            [],
        },
      ),
    websites:
      new PlatformWebsiteService(
        new PlatformWebsiteRepository(),
        stubGenerator,
        clients,
      ),
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
    txtRecords,
    ownerCookie:
      signup.headers["set-cookie"],
  };
}

async function verifiedDomain(
  app: ReturnType<
    typeof createPlatformApp
  >,
  cookie: string,
  txtRecords: Map<string, string[][]>,
  domain: string,
): Promise<void> {
  const add = await request(app)
    .post("/api/platform/domains")
    .set("Cookie", cookie)
    .send({ domain });
  txtRecords.set(
    "_aecloud-verify." + domain,
    [
      [
        "aecloud-verify=" +
          add.body.domain
            .verificationToken,
      ],
    ],
  );
  await request(app)
    .post(
      "/api/platform/domains/" +
        add.body.domain.id +
        "/verify",
    )
    .set("Cookie", cookie)
    .expect(200);
}

async function makeSite(
  app: ReturnType<
    typeof createPlatformApp
  >,
  cookie: string,
  generate: boolean,
): Promise<string> {
  const created = await request(app)
    .post("/api/platform/websites")
    .set("Cookie", cookie)
    .send({
      name: "Acme Cafe",
      brief: "A cafe.",
    });
  const id = created.body.website.id;

  if (generate) {
    await request(app)
      .post(
        "/api/platform/websites/" +
          id +
          "/generate",
      )
      .set("Cookie", cookie)
      .expect(200);
  }

  return id;
}

describe("Publishing a website to a domain", () => {
  it("serves a published site live on its verified domain, then stops on unpublish", async () => {
    const { app, ownerCookie, txtRecords } =
      await build();

    await verifiedDomain(
      app,
      ownerCookie,
      txtRecords,
      "acme-cafe.com",
    );
    const id = await makeSite(
      app,
      ownerCookie,
      true,
    );

    const pub = await request(app)
      .post(
        "/api/platform/websites/" +
          id +
          "/publish",
      )
      .set("Cookie", ownerCookie)
      .send({ domain: "acme-cafe.com" });
    expect(pub.status).toBe(200);
    expect(
      pub.body.website.status,
    ).toBe("published");

    // A public visitor on the domain gets the live site.
    const live = await request(app)
      .get("/")
      .set("Host", "acme-cafe.com");
    expect(live.status).toBe(200);
    expect(live.text).toContain(
      "PUBLISHED SITE: Acme Cafe",
    );

    // Unpublish → the domain no longer serves the site (landing instead).
    await request(app)
      .post(
        "/api/platform/websites/" +
          id +
          "/unpublish",
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    const after = await request(app)
      .get("/")
      .set("Host", "acme-cafe.com");
    expect(after.text).not.toContain(
      "PUBLISHED SITE",
    );
  });

  it("refuses to publish to an unverified domain or an empty site", async () => {
    const { app, ownerCookie, txtRecords } =
      await build();

    // Empty site (not generated) → cannot publish even to a verified domain.
    await verifiedDomain(
      app,
      ownerCookie,
      txtRecords,
      "acme-cafe.com",
    );
    const emptyId = await makeSite(
      app,
      ownerCookie,
      false,
    );
    const noContent = await request(app)
      .post(
        "/api/platform/websites/" +
          emptyId +
          "/publish",
      )
      .set("Cookie", ownerCookie)
      .send({ domain: "acme-cafe.com" });
    expect(noContent.status).toBe(400);
    expect(
      noContent.body.error.code,
    ).toBe("NO_CONTENT");

    // Generated site, but an unverified/unowned domain → blocked.
    const id = await makeSite(
      app,
      ownerCookie,
      true,
    );
    const bad = await request(app)
      .post(
        "/api/platform/websites/" +
          id +
          "/publish",
      )
      .set("Cookie", ownerCookie)
      .send({
        domain: "not-mine.com",
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe(
      "DOMAIN_NOT_VERIFIED",
    );
  });
});
