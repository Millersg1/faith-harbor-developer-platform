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
import { createPlatformApp } from "./createPlatformApp";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { RateLimiter } from "./security/RateLimiter";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

describe("RateLimiter", () => {
  it("allows up to max then blocks, and reports retry-after", () => {
    let clock = 1_000;
    const rl = new RateLimiter({
      max: 3,
      windowMs: 10_000,
      now: () => clock,
    });

    expect(
      rl.hit("k").allowed,
    ).toBe(true);
    expect(
      rl.hit("k").allowed,
    ).toBe(true);
    expect(
      rl.hit("k").allowed,
    ).toBe(true);
    const blocked = rl.hit("k");
    expect(blocked.allowed).toBe(
      false,
    );
    expect(
      blocked.retryAfterMs,
    ).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    let clock = 1_000;
    const rl = new RateLimiter({
      max: 1,
      windowMs: 10_000,
      now: () => clock,
    });

    expect(
      rl.hit("k").allowed,
    ).toBe(true);
    expect(
      rl.hit("k").allowed,
    ).toBe(false);

    clock += 10_001;
    expect(
      rl.hit("k").allowed,
    ).toBe(true);
  });

  it("keys are independent", () => {
    const rl = new RateLimiter({
      max: 1,
      windowMs: 10_000,
    });
    expect(
      rl.hit("a").allowed,
    ).toBe(true);
    expect(
      rl.hit("b").allowed,
    ).toBe(true);
    expect(
      rl.hit("a").allowed,
    ).toBe(false);
  });

  it("reset() clears a key", () => {
    const rl = new RateLimiter({
      max: 1,
      windowMs: 10_000,
    });
    rl.hit("a");
    expect(
      rl.hit("a").allowed,
    ).toBe(false);
    rl.reset("a");
    expect(
      rl.hit("a").allowed,
    ).toBe(true);
  });
});

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
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );

  return createPlatformApp({
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
  });
}

describe("Login rate limiting", () => {
  it("returns 429 after too many login attempts", async () => {
    const app = build();

    let sawLimited = false;
    // Default limiter is 10/15min per IP+email; the 11th should be blocked.
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post("/auth/login")
        .set("X-Org-Slug", "acme")
        .send({
          email: "attacker@x.com",
          password: "wrong",
        });

      if (res.status === 429) {
        sawLimited = true;
        expect(
          res.headers[
            "retry-after"
          ],
        ).toBeDefined();
        break;
      }
    }

    expect(sawLimited).toBe(true);
  });
});
