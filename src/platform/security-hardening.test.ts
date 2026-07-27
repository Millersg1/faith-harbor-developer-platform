import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { createCsrfGuard } from "./security/CsrfGuard";

async function buildApp(
  secureCookie = false,
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
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
    secureCookie,
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("security headers", () => {
  it("sets baseline headers on every response", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/health",
    );

    expect(
      res.headers[
        "x-content-type-options"
      ],
    ).toBe("nosniff");
    expect(
      res.headers["x-frame-options"],
    ).toBe("SAMEORIGIN");
    expect(
      res.headers["referrer-policy"],
    ).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sends HSTS only when behind HTTPS (secureCookie)", async () => {
    const insecure =
      await buildApp(false);
    const r1 = await request(
      insecure.app,
    ).get("/health");
    expect(
      r1.headers[
        "strict-transport-security"
      ],
    ).toBeUndefined();

    const secure =
      await buildApp(true);
    const r2 = await request(
      secure.app,
    ).get("/health");
    expect(
      r2.headers[
        "strict-transport-security"
      ],
    ).toContain("max-age=");
  });
});

describe("CSRF guard", () => {
  it("blocks a cross-site state-changing request", async () => {
    const { app, cookie } =
      await buildApp();

    const res = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .set(
        "Sec-Fetch-Site",
        "cross-site",
      )
      .send({ name: "Evil" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(
      "CSRF_BLOCKED",
    );
  });

  it("blocks a mismatched Origin", async () => {
    const { app, cookie } =
      await buildApp();

    const res = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .set(
        "Origin",
        "https://evil.example.com",
      )
      .send({ name: "Evil" });

    expect(res.status).toBe(403);
  });

  it("allows a same-origin request (Origin host matches)", async () => {
    const { app, cookie } =
      await buildApp();

    const res = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .set("Host", "acme.allelitecloud.com")
      .set(
        "Origin",
        "https://acme.allelitecloud.com",
      )
      .send({ name: "Good" });

    expect(res.status).toBe(201);
  });

  it("allows requests with neither header (SameSite=Lax is the backstop)", async () => {
    const { app, cookie } =
      await buildApp();

    const res = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Good" });

    expect(res.status).toBe(201);
  });

  it("never blocks safe methods", () => {
    const guard = createCsrfGuard();
    let called = false;
    const req = {
      method: "GET",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    } as never;
    const res = {
      status() {
        throw new Error(
          "should not reject",
        );
      },
    } as never;

    guard(req, res, () => {
      called = true;
    });

    expect(called).toBe(true);
  });
});
