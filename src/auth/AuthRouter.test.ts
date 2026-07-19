import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

import { AuthService } from "./AuthService";

function createAuthedApp(
  overrides: {
    maxAttempts?: number;
  } = {},
) {
  const authService =
    new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
      maxAttempts:
        overrides.maxAttempts,
    });

  return createApp(
    undefined,
    undefined,
    authService,
  );
}

describe("Authentication gate", () => {
  it("blocks the API without a session", async () => {
    const app = createAuthedApp();

    const response =
      await request(app)
        .get(
          "/api/v1/departments",
        );

    expect(response.status)
      .toBe(401);

    expect(
      response.body.error.code,
    ).toBe("UNAUTHENTICATED");
  });

  it("keeps the login and health routes public", async () => {
    const app = createAuthedApp();

    const health =
      await request(app)
        .get("/health");

    expect(health.status)
      .toBe(200);

    const me =
      await request(app)
        .get("/api/v1/auth/me");

    expect(me.status)
      .toBe(401);

    expect(me.body.authenticated)
      .toBe(false);
  });

  it("rejects invalid credentials", async () => {
    const app = createAuthedApp();

    const response =
      await request(app)
        .post(
          "/api/v1/auth/login",
        )
        .send({
          email:
            "director@example.com",
          password: "wrong",
        });

    expect(response.status)
      .toBe(401);

    expect(response.body.authenticated)
      .toBe(false);
  });

  it("logs in and reaches the API with the session cookie", async () => {
    const app = createAuthedApp();

    const agent =
      request.agent(app);

    const login =
      await agent
        .post(
          "/api/v1/auth/login",
        )
        .send({
          email:
            "Director@Example.com",
          password: "secret-pass",
        });

    expect(login.status)
      .toBe(200);

    expect(login.body.authenticated)
      .toBe(true);

    expect(login.body.user.email)
      .toBe(
        "director@example.com",
      );

    // The session cookie now grants API access.
    const departments =
      await agent.get(
        "/api/v1/departments",
      );

    expect(departments.status)
      .toBe(200);

    const me =
      await agent.get(
        "/api/v1/auth/me",
      );

    expect(me.status)
      .toBe(200);

    expect(me.body.authenticated)
      .toBe(true);
  });

  it("logs out and loses API access", async () => {
    const app = createAuthedApp();

    const agent =
      request.agent(app);

    await agent
      .post("/api/v1/auth/login")
      .send({
        email:
          "director@example.com",
        password: "secret-pass",
      });

    await agent.post(
      "/api/v1/auth/logout",
    );

    const departments =
      await agent.get(
        "/api/v1/departments",
      );

    expect(departments.status)
      .toBe(401);
  });

  it("rate limits repeated failed logins", async () => {
    const app = createAuthedApp({
      maxAttempts: 3,
    });

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post(
          "/api/v1/auth/login",
        )
        .send({
          email:
            "director@example.com",
          password: "wrong",
        });
    }

    const blocked =
      await request(app)
        .post(
          "/api/v1/auth/login",
        )
        .send({
          email:
            "director@example.com",
          password: "secret-pass",
        });

    expect(blocked.status)
      .toBe(429);

    expect(
      blocked.body.error.code,
    ).toBe("TOO_MANY_ATTEMPTS");
  });

  it("leaves the API open when no auth service is configured", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/departments",
        );

    expect(response.status)
      .toBe(200);
  });
});
