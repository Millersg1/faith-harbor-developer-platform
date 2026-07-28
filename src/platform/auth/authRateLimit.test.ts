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
import type { AuditService } from "../audit/AuditService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { RateLimiter } from "../security/RateLimiter";
import { createAuthRouter } from "./authRouter";
import { PasswordResetRepository } from "./PasswordResetRepository";
import { PasswordResetService } from "./PasswordResetService";
import { createRequireUser } from "./requireUser";

/** A limiter capped at `max` in a window long enough to never reset mid-test. */
function limiter(max: number): RateLimiter {
  return new RateLimiter({
    max,
    windowMs: 60_000,
  });
}

type AuditRecord = Parameters<
  AuditService["record"]
>[0];

async function buildApp(options: {
  limiters?: Partial<
    Parameters<
      typeof createAuthRouter
    >[0]
  >;
  trustProxy?: boolean;
} = {}) {
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
  const passwordReset =
    new PasswordResetService(
      new PasswordResetRepository(),
      users,
    );

  const audits: AuditRecord[] = [];
  const audit = {
    record: async (
      input: AuditRecord,
    ) => {
      audits.push(input);
    },
  } as unknown as AuditService;

  const email = {
    sendQuietly: async () => undefined,
  } as unknown as never;

  const app = express();
  if (options.trustProxy) {
    app.set("trust proxy", 1);
  }
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({
      users,
      sessions,
      signup:
        new PlatformSignupService(
          organizations,
          users,
          sessions,
        ),
      passwordReset,
      email,
      audit,
      baseDomain:
        "staging.allelitecloud.com",
      tenantMiddleware:
        createTenantMiddleware(
          organizations,
        ),
      requireUser:
        createRequireUser({
          sessions,
          users,
        }),
      ...options.limiters,
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

  return { app, audits, users };
}

describe("Auth rate limiting — signup", () => {
  it("throttles signup per IP (not per email, so enumeration is bounded) with 429 + Retry-After", async () => {
    const { app } = await buildApp({
      limiters: {
        signupLimiter: limiter(2),
      },
    });

    const attempt = (n: number) =>
      request(app)
        .post("/auth/signup")
        .send({
          organizationName: `Org ${n}`,
          slug: `org-${n}`,
          email: `new${n}@x.com`,
          password: "password123",
        });

    // Two different emails from the same source are allowed…
    expect(
      (await attempt(1)).status,
    ).toBeLessThan(400);
    expect(
      (await attempt(2)).status,
    ).toBeLessThan(400);
    // …the third (still a fresh email) is blocked: the bucket is per-IP, so an
    // attacker can't probe unlimited addresses to enumerate accounts.
    const blocked = await attempt(3);
    expect(blocked.status).toBe(429);
    expect(
      blocked.headers["retry-after"],
    ).toBeDefined();
    expect(
      blocked.body.error.code,
    ).toBe("RATE_LIMITED");
  });
});

describe("Auth rate limiting — login", () => {
  it("clears only the account's failure bucket on a successful login", async () => {
    const { app } = await buildApp({
      limiters: {
        loginLimiter: limiter(3),
        loginIpLimiter: limiter(100),
      },
    });
    const login = (pw: string) =>
      request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "owner@acme.com",
          password: pw,
        });

    // Two failures (account bucket = 2 of 3)…
    expect(
      (await login("wrong")).status,
    ).toBe(401);
    expect(
      (await login("wrong")).status,
    ).toBe(401);
    // …a success resets that account's bucket…
    expect(
      (await login("password123"))
        .status,
    ).toBe(200);
    // …so three more failures are still 401 (a fresh window), never 429.
    expect(
      (await login("wrong")).status,
    ).toBe(401);
    expect(
      (await login("wrong")).status,
    ).toBe(401);
    expect(
      (await login("wrong")).status,
    ).toBe(401);
  });

  it("keeps the wider per-IP bucket even across a successful login (spray stays bounded)", async () => {
    const { app } = await buildApp({
      limiters: {
        loginLimiter: limiter(100),
        loginIpLimiter: limiter(3),
      },
    });
    const login = (
      email: string,
      pw: string,
    ) =>
      request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({ email, password: pw });

    expect(
      (await login("a@x.com", "wrong"))
        .status,
    ).toBe(401);
    expect(
      (await login("b@x.com", "wrong"))
        .status,
    ).toBe(401);
    // A genuine success (IP bucket now at 3) does NOT reset the IP counter…
    expect(
      (
        await login(
          "owner@acme.com",
          "password123",
        )
      ).status,
    ).toBe(200);
    // …so the next attempt from the same IP, any account, is blocked.
    expect(
      (await login("c@x.com", "wrong"))
        .status,
    ).toBe(429);
  });
});

describe("Auth rate limiting — forgot password", () => {
  it("throttles reset requests and never reveals whether an email exists", async () => {
    const { app } = await buildApp({
      limiters: {
        resetLimiter: limiter(1),
      },
    });
    const forgot = (email: string) =>
      request(app)
        .post("/auth/forgot-password")
        .set("X-Org-Slug", "acme")
        .send({ email });

    // Existing and unknown emails return the SAME response (no enumeration).
    // They hit different IP+email buckets, so both pass on the first try.
    const known = await forgot(
      "owner@acme.com",
    );
    const unknown = await forgot(
      "nobody@acme.com",
    );
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(
      unknown.body,
    );
    // A second request on the same IP+email key (max 1) is throttled.
    const blocked = await forgot(
      "owner@acme.com",
    );
    expect(blocked.status).toBe(429);
    expect(
      blocked.headers["retry-after"],
    ).toBeDefined();
  });
});

describe("Auth rate limiting — reset submission", () => {
  it("bounds token brute-force per IP across many different tokens", async () => {
    const { app } = await buildApp({
      limiters: {
        resetSubmitLimiter: limiter(3),
        resetSubmitTokenLimiter:
          limiter(100),
      },
    });
    const submit = (token: string) =>
      request(app)
        .post("/auth/reset-password")
        .set("X-Org-Slug", "acme")
        .send({
          token,
          newPassword: "password123",
        });

    // Four DISTINCT tokens: the per-IP bucket (3) blocks the fourth even
    // though each token is unique — this is the brute-force bound.
    expect(
      (await submit("tok-a")).status,
    ).not.toBe(429);
    expect(
      (await submit("tok-b")).status,
    ).not.toBe(429);
    expect(
      (await submit("tok-c")).status,
    ).not.toBe(429);
    expect(
      (await submit("tok-d")).status,
    ).toBe(429);
  });

  it("also bounds hammering a single token via its fingerprint", async () => {
    const { app } = await buildApp({
      limiters: {
        resetSubmitLimiter: limiter(100),
        resetSubmitTokenLimiter:
          limiter(2),
      },
    });
    const submit = () =>
      request(app)
        .post("/auth/reset-password")
        .set("X-Org-Slug", "acme")
        .send({
          token: "same-token",
          newPassword: "password123",
        });

    expect(
      (await submit()).status,
    ).not.toBe(429);
    expect(
      (await submit()).status,
    ).not.toBe(429);
    // Third hit on the same token fingerprint is blocked.
    expect(
      (await submit()).status,
    ).toBe(429);
  });
});

describe("Auth rate limiting — proxy behavior", () => {
  it("keys off the forwarded client IP under trust proxy = 1", async () => {
    const { app } = await buildApp({
      trustProxy: true,
      limiters: {
        loginIpLimiter: limiter(2),
        loginLimiter: limiter(100),
      },
    });
    const login = (xff: string) =>
      request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .set("X-Forwarded-For", xff)
        .send({
          email: "owner@acme.com",
          password: "wrong",
        });

    // Same forwarded client IP shares a bucket → third is throttled.
    expect(
      (await login("9.9.9.9")).status,
    ).toBe(401);
    expect(
      (await login("9.9.9.9")).status,
    ).toBe(401);
    expect(
      (await login("9.9.9.9")).status,
    ).toBe(429);
    // A different forwarded IP is a fresh bucket (per-client limiting works).
    // In production Apache sets this header and the app binds to loopback, so
    // a client cannot forge it — see platformServer bind + 04_SECURITY.md.
    expect(
      (await login("8.8.8.8")).status,
    ).toBe(401);
  });
});

describe("Auth rate limiting — audit safety", () => {
  it("records throttle events without any password, token, or reset secret", async () => {
    const { app, audits } =
      await buildApp({
        limiters: {
          loginLimiter: limiter(1),
          resetSubmitLimiter:
            limiter(1),
          resetSubmitTokenLimiter:
            limiter(1),
        },
      });

    const secretPw =
      "SuperSecretPassw0rd!";
    const secretToken =
      "abcdef0123456789-reset-token";

    // Force a login throttle and a reset-submit throttle.
    await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: secretPw,
      });
    await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "owner@acme.com",
        password: secretPw,
      });
    await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token: secretToken,
        newPassword: secretPw,
      });
    await request(app)
      .post("/auth/reset-password")
      .set("X-Org-Slug", "acme")
      .send({
        token: secretToken,
        newPassword: secretPw,
      });

    const blob = JSON.stringify(audits);
    // No secret material anywhere in the audit trail.
    expect(blob).not.toContain(
      secretPw,
    );
    expect(blob).not.toContain(
      secretToken,
    );

    // Throttle events carry only scope + ip.
    const throttles = audits.filter(
      (a) =>
        a.action ===
        "auth.rate_limited",
    );
    expect(
      throttles.length,
    ).toBeGreaterThan(0);
    for (const t of throttles) {
      expect(t.metadata).toEqual({
        scope: expect.any(String),
      });
    }
  });
});
