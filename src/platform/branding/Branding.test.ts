import express from "express";
import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../../tenancy/OrganizationService";
import { runWithTenant } from "../../tenancy/TenantContext";
import { createTenantMiddleware } from "../../tenancy/tenantMiddleware";
import { createAuthRouter } from "../auth/authRouter";
import { createRequireUser } from "../auth/requireUser";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { BrandingRepository } from "./BrandingRepository";
import { BrandingService } from "./BrandingService";
import { createBrandingRouter } from "./BrandingRouter";

const A = { organizationId: "org-a" };
const B = { organizationId: "org-b" };

describe("BrandingService", () => {
  it("returns an empty default for a tenant with no branding", async () => {
    const branding =
      new BrandingService(
        new BrandingRepository(),
      );

    const result =
      await runWithTenant(A, () =>
        branding.get(),
      );

    expect(
      result.organizationId,
    ).toBe("org-a");
    expect(
      result.primaryColor,
    ).toBeUndefined();
  });

  it("isolates branding per tenant", async () => {
    const branding =
      new BrandingService(
        new BrandingRepository(),
      );

    await runWithTenant(A, () =>
      branding.update({
        primaryColor: "#111111",
      }),
    );
    await runWithTenant(B, () =>
      branding.update({
        primaryColor: "#222222",
      }),
    );

    expect(
      (
        await runWithTenant(A, () =>
          branding.get(),
        )
      ).primaryColor,
    ).toBe("#111111");
    expect(
      (
        await runWithTenant(B, () =>
          branding.get(),
        )
      ).primaryColor,
    ).toBe("#222222");
  });

  it("merges partial updates and clears fields with an empty string", async () => {
    const branding =
      new BrandingService(
        new BrandingRepository(),
      );

    await runWithTenant(A, () =>
      branding.update({
        primaryColor: "#111111",
      }),
    );
    await runWithTenant(A, () =>
      branding.update({
        displayName: "Acme Cloud",
      }),
    );

    let result =
      await runWithTenant(A, () =>
        branding.get(),
      );
    expect(result.primaryColor).toBe(
      "#111111",
    );
    expect(result.displayName).toBe(
      "Acme Cloud",
    );

    await runWithTenant(A, () =>
      branding.update({
        displayName: "",
      }),
    );

    result = await runWithTenant(
      A,
      () => branding.get(),
    );
    expect(
      result.displayName,
    ).toBeUndefined();
    // The unrelated field is untouched.
    expect(result.primaryColor).toBe(
      "#111111",
    );
  });

  it("validates colors and support email", async () => {
    const branding =
      new BrandingService(
        new BrandingRepository(),
      );

    await expect(
      runWithTenant(A, () =>
        branding.update({
          primaryColor: "red",
        }),
      ),
    ).rejects.toThrow(/hex color/i);

    await expect(
      runWithTenant(A, () =>
        branding.update({
          supportEmail: "nope",
        }),
      ),
    ).rejects.toThrow(/valid email/i);
  });
});

async function buildApp() {
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
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  const tenantMiddleware =
    createTenantMiddleware(
      organizations,
    );
  const requireUser =
    createRequireUser({
      sessions,
      users,
    });

  const app = express();
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({
      users,
      sessions,
      signup,
      tenantMiddleware,
      requireUser,
    }),
  );
  app.use(
    "/api/platform",
    createBrandingRouter({
      branding,
      tenantMiddleware,
      requireUser,
    }),
  );

  return { app, users };
}

describe("Branding API (RBAC over HTTP)", () => {
  it("serves branding publicly and lets an owner update it", async () => {
    const { app } = await buildApp();

    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
      });
    const ownerCookie =
      signup.headers["set-cookie"];

    // Public read (no auth) via the tenant subdomain/header.
    const publicRead = await request(
      app,
    )
      .get("/api/platform/branding")
      .set("X-Org-Slug", "acme");
    expect(publicRead.status).toBe(
      200,
    );

    // Owner updates.
    const put = await request(app)
      .put("/api/platform/branding")
      .set("Cookie", ownerCookie)
      .send({
        displayName: "Acme Cloud",
        primaryColor: "#123456",
      });
    expect(put.status).toBe(200);
    expect(
      put.body.branding.primaryColor,
    ).toBe("#123456");

    // The public read now reflects it.
    const after = await request(app)
      .get("/api/platform/branding")
      .set("X-Org-Slug", "acme");
    expect(
      after.body.branding.displayName,
    ).toBe("Acme Cloud");
  });

  it("forbids a member from updating branding", async () => {
    const { app, users } =
      await buildApp();

    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
      });
    const orgId =
      signup.body.organization.id;

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
    const memberCookie =
      memberLogin.headers[
        "set-cookie"
      ];

    const put = await request(app)
      .put("/api/platform/branding")
      .set("Cookie", memberCookie)
      .send({
        displayName: "Hijack",
      });

    expect(put.status).toBe(403);
  });

  it("requires auth to update, and validates input", async () => {
    const { app } = await buildApp();

    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
      });
    const ownerCookie =
      signup.headers["set-cookie"];

    await request(app)
      .put("/api/platform/branding")
      .send({ displayName: "x" })
      .expect(401);

    const bad = await request(app)
      .put("/api/platform/branding")
      .set("Cookie", ownerCookie)
      .send({ primaryColor: "red" });
    expect(bad.status).toBe(400);
  });
});
