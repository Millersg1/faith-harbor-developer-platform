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
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { createAuthRouter } from "./authRouter";
import { createRequireUser } from "./requireUser";

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

  const app = express();
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({
      users,
      sessions,
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

  const org =
    await organizations.create({
      name: "Acme",
      slug: "acme",
    });

  await runWithTenant(
    { organizationId: org.id },
    () =>
      users.create({
        email: "owner@acme.com",
        password: "password123",
        role: "owner",
      }),
  );

  return app;
}

function tokenFromLogin(
  res: request.Response,
): string {
  const cookie = (
    res.headers[
      "set-cookie"
    ] as unknown as string[]
  )[0];

  return (
    /aec_session=([^;]+)/.exec(
      cookie,
    )?.[1] ?? ""
  );
}

describe("Auth login sessions (HTTP)", () => {
  it("logs in, reads the current user, and logs out", async () => {
    const app = await buildApp();

    const login = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "password123",
      });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(
      "owner@acme.com",
    );
    expect(
      "passwordHash" in
        login.body.user,
    ).toBe(false);
    expect(
      login.headers["set-cookie"],
    ).toBeDefined();

    const cookie =
      login.headers["set-cookie"];

    const me = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(
      "owner@acme.com",
    );
    expect(
      me.body.user.organizationId,
    ).toBeTruthy();

    await request(app)
      .post("/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    // The session is revoked; the same cookie no longer works.
    const after = await request(app)
      .get("/auth/me")
      .set("Cookie", cookie);
    expect(after.status).toBe(401);
  });

  it("also accepts the token via Authorization: Bearer", async () => {
    const app = await buildApp();

    const login = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "password123",
      });

    const token =
      tokenFromLogin(login);

    const me = await request(app)
      .get("/auth/me")
      .set(
        "Authorization",
        `Bearer ${token}`,
      );

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(
      "owner@acme.com",
    );
  });

  it("rejects wrong credentials with 401", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: "wrong-password",
      });

    expect(res.status).toBe(401);
  });

  it("requires a session for /me", async () => {
    const app = await buildApp();

    await request(app)
      .get("/auth/me")
      .expect(401);
  });

  it("requires a tenant to log in", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "owner@acme.com",
        password: "password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(
      "NO_TENANT",
    );
  });
});
