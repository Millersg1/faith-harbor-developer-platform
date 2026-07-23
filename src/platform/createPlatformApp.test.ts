import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

function build() {
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
  const branding =
    new BrandingService(
      new BrandingRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  return createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    signup,
  });
}

describe("createPlatformApp (composition root)", () => {
  it("serves health", async () => {
    const app = build();

    const res =
      await request(app).get(
        "/health",
      );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(
      "ok",
    );
  });

  it("runs the full onboarding + tenant workflow end to end", async () => {
    const app = build();

    // 1. Sign up -> creates org + owner, auto-logs-in.
    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName:
          "Acme Cloud",
        email: "owner@acme.com",
        password: "password123",
      });
    expect(signup.status).toBe(201);
    const slug =
      signup.body.organization.slug;
    const cookie =
      signup.headers["set-cookie"];

    // 2. /me works with the session cookie.
    const me = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);
    expect(me.body.user.role).toBe(
      "owner",
    );

    // 3. Owner sets branding.
    const put = await request(app)
      .put("/api/platform/branding")
      .set("Cookie", cookie)
      .send({
        primaryColor: "#0a2540",
      });
    expect(put.status).toBe(200);

    // 4. Branding is publicly readable by subdomain slug.
    const brand = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", slug);
    expect(
      brand.body.branding
        .primaryColor,
    ).toBe("#0a2540");

    // 5. Authenticated tenant-scoped API: create + list a client.
    await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "First Client" })
      .expect(201);

    const list = await request(app)
      .get("/api/platform/clients")
      .set("Cookie", cookie);
    expect(
      list.body.clients,
    ).toHaveLength(1);
  });

  it("404s an unknown route", async () => {
    const app = build();

    await request(app)
      .get("/nope")
      .expect(404);
  });
});
