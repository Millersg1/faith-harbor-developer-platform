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
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { PlatformSignupService } from "./PlatformSignupService";

function setup() {
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
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  return {
    organizations,
    users,
    sessions,
    signup,
  };
}

describe("PlatformSignupService", () => {
  it("creates an organization and its owner and logs them in", async () => {
    const { signup, sessions } =
      setup();

    const result =
      await signup.signup({
        organizationName: "Acme",
        ownerEmail: "owner@acme.com",
        ownerPassword: "password123",
      });

    expect(
      result.organization.slug,
    ).toBe("acme");
    expect(result.owner.role).toBe(
      "owner",
    );
    expect(
      "passwordHash" in result.owner,
    ).toBe(false);
    expect(
      result.session,
    ).toBeDefined();

    const validated =
      await sessions.validate(
        result.session?.token ?? "",
      );
    expect(
      validated?.organizationId,
    ).toBe(result.organization.id);
  });

  it("lets the new owner authenticate afterwards", async () => {
    const { signup, users } = setup();

    const result =
      await signup.signup({
        organizationName: "Beta",
        ownerEmail: "o@beta.com",
        ownerPassword: "password123",
      });

    const user = await runWithTenant(
      {
        organizationId:
          result.organization.id,
      },
      () =>
        users.authenticate(
          "o@beta.com",
          "password123",
        ),
    );

    expect(user.email).toBe(
      "o@beta.com",
    );
  });

  it("rejects a weak password without creating an org", async () => {
    const { signup, organizations } =
      setup();

    await expect(
      signup.signup({
        organizationName: "Gamma",
        ownerEmail: "o@g.com",
        ownerPassword: "short",
      }),
    ).rejects.toThrow(/at least/i);

    expect(
      await organizations.getBySlug(
        "gamma",
      ),
    ).toBeUndefined();
  });

  it("rejects a duplicate organization slug", async () => {
    const { signup } = setup();

    await signup.signup({
      organizationName: "Dup",
      ownerEmail: "a@d.com",
      ownerPassword: "password123",
    });

    await expect(
      signup.signup({
        organizationName: "Dup",
        ownerEmail: "b@d.com",
        ownerPassword: "password123",
      }),
    ).rejects.toThrow(
      /already in use/i,
    );
  });

  it("rolls back the organization when owner creation fails", async () => {
    const organizations =
      new OrganizationService();

    // A user service whose create always fails, to force the failure
    // path *after* the org has been created.
    const failingUsers = {
      create: async () => {
        throw new Error(
          "owner creation exploded",
        );
      },
    } as unknown as PlatformUserService;

    const signup =
      new PlatformSignupService(
        organizations,
        failingUsers,
      );

    await expect(
      signup.signup({
        organizationName:
          "Rollback",
        ownerEmail: "o@r.com",
        ownerPassword: "password123",
      }),
    ).rejects.toThrow(/exploded/);

    // The org was rolled back — nothing left behind.
    expect(
      await organizations.getBySlug(
        "rollback",
      ),
    ).toBeUndefined();
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
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  const app = express();
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({
      users,
      sessions,
      signup,
      tenantMiddleware:
        createTenantMiddleware(
          organizations,
        ),
      requireUser:
        createRequireUser({
          sessions,
          users,
        }),
    }),
  );

  return app;
}

describe("Signup over HTTP", () => {
  it("signs up, auto-logs-in, and /me returns the owner", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
        name: "The Owner",
      });

    expect(res.status).toBe(201);
    expect(
      res.body.organization.slug,
    ).toBe("acme");
    expect(res.body.user.email).toBe(
      "owner@acme.com",
    );

    const cookie =
      res.headers["set-cookie"];
    expect(cookie).toBeDefined();

    const me = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe(
      "owner",
    );
  });

  it("can then log in through the tenant", async () => {
    const app = await buildApp();

    await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Beta",
        email: "o@beta.com",
        password: "password123",
      })
      .expect(201);

    const login = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "beta")
      .send({
        email: "o@beta.com",
        password: "password123",
      });

    expect(login.status).toBe(200);
  });

  it("409 on duplicate org, 400 on missing fields", async () => {
    const app = await buildApp();

    await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Dup",
        email: "a@d.com",
        password: "password123",
      })
      .expect(201);

    await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Dup",
        email: "b@d.com",
        password: "password123",
      })
      .expect(409);

    await request(app)
      .post("/auth/signup")
      .send({ email: "x@y.com" })
      .expect(400);
  });
});
