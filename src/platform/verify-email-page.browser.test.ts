// REAL-BROWSER test (Playwright/Chromium). Opt-in: it is skipped unless
// RUN_BROWSER_TESTS=1, because (a) CI images usually don't have a Chromium
// binary installed and (b) launching a browser adds CPU load that can tip the
// already-load-sensitive composition-root page test into a socket reset on the
// Windows forks pool. Run it explicitly:  RUN_BROWSER_TESTS=1 npx vitest run
// src/platform/verify-email-page.browser.test.ts
import http from "node:http";

import request from "supertest";
// `playwright` is a dev-only, opt-in dependency that isn't installed on
// browserless CI. Import its TYPES only (erased at runtime) and load the runtime
// module DYNAMICALLY inside the guarded describe, so collecting this file when
// RUN_BROWSER_TESTS is unset never requires the package. This file is also
// excluded from `tsconfig.json` typecheck for the same reason.
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.RUN_BROWSER_TESTS === "1";

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
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import {
  EmailVerificationService,
  EmailVerificationTokenRepository,
} from "./auth/EmailVerificationService";
import { PlatformUserVerificationStore } from "./auth/PlatformUserVerificationStore";
import type {
  DeliveryRequest,
  DeliveryResult,
  EmailDeliveryProvider,
} from "./email/EmailDeliveryProvider";

class FakeProvider implements EmailDeliveryProvider {
  readonly name = "fake";
  readonly sent: DeliveryRequest[] = [];
  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    this.sent.push(req);
    return {
      classification: "accepted",
      messageId: "mid",
      responseCategory: "accepted",
      acceptedCount: 1,
      rejectedCount: 0,
    };
  }
}

function buildApp() {
  const organizations = new OrganizationService();
  const userRepo = new PlatformUserRepository();
  const users = new PlatformUserService(userRepo);
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const emailProvider = new FakeProvider();
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    emailVerification: new EmailVerificationService(
      new PlatformUserVerificationStore(userRepo),
      new EmailVerificationTokenRepository(),
    ),
    emailProvider,
    transactionalSender: { from: "All Elite Cloud <verify@allelitecloud.com>" },
    baseDomain: "allelitecloud.com",
  });
  return { app, emailProvider };
}

describe.runIf(RUN)("verify-email fragment-exchange page — REAL browser", () => {
  let browser: Browser | undefined;
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it(
    "strips the token from history, POSTs it (never in a URL), loads no 3rd-party assets, and confirms",
    async () => {
      const { app, emailProvider } = buildApp();
      // Mint a real token: sign up, request verification, read the link.
      const signup = await request(app).post("/auth/signup").send({
        organizationName: "Acme",
        email: "owner@acme.com",
        password: "password123",
      });
      const cookie = signup.headers["set-cookie"] as unknown as string[];
      await request(app)
        .post("/api/platform/account/request-verification")
        .set("Cookie", cookie)
        .send({});
      const token = /#v=([A-Za-z0-9]+)/.exec(emailProvider.sent[0].text)![1];

      const server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const base = `http://127.0.0.1:${port}`;

      const requests: string[] = [];
      const page = await browser!.newPage();
      page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));

      try {
        await page.goto(`${base}/verify-email#v=${token}`, {
          waitUntil: "load",
        });
        // The success text only appears after the fragment→POST exchange runs.
        await page.waitForFunction(
          () => /verified/i.test(document.getElementById("m")?.textContent ?? ""),
          undefined,
          { timeout: 10_000 },
        );

        // 1) The fragment (and its token) was stripped from history.
        expect(page.url()).toBe(`${base}/verify-email`);
        const hash = await page.evaluate(() => location.hash);
        expect(hash).toBe("");

        // 2) The token NEVER appears in any request URL (it goes in the POST body).
        expect(requests.some((u) => u.includes(token))).toBe(false);
        // The confirming request was a POST to our endpoint.
        expect(requests.some((u) => u === `POST ${base}/verify-email`)).toBe(true);

        // 3) Every network request stayed same-origin — no third-party
        //    scripts, fonts, images, or analytics.
        expect(requests.every((u) => u.includes(`127.0.0.1:${port}`))).toBe(true);
      } finally {
        await page.close();
        await new Promise<void>((r) => server.close(() => r()));
      }
    },
    30_000,
  );
});
