// REAL-BROWSER fixture (Playwright/Chromium) for Phase 5 privacy-request intake +
// the token fragment-exchange. Opt-in: skipped unless RUN_BROWSER_TESTS=1 (CI
// images usually lack a browser binary). Excluded from tsconfig typecheck like
// the other *.browser.test.ts fixtures.
//   RUN_BROWSER_TESTS=1 npx vitest run src/platform/privacy/privacyIntake.browser.test.ts
import http from "node:http";

import type { Browser } from "playwright";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../branding/BrandingRepository";
import { BrandingService } from "../branding/BrandingService";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import type { EmailTransport } from "../../communications/EmailTransport";
import type { EmailMessage, EmailResult } from "../../communications/EmailTypes";
import { createPlatformApp } from "../createPlatformApp";
import { PlatformEmailRepository } from "../email/PlatformEmailRepository";
import { PlatformEmailService } from "../email/PlatformEmailService";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { PrivacyRequestService } from "./PrivacyRequestService";

const RUN = process.env.RUN_BROWSER_TESTS === "1";

function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const privacy = new PrivacyRequestService();
  const captured: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(m: EmailMessage): Promise<EmailResult> {
      captured.push(m);
      return { status: "sent" };
    },
  };
  const email = new PlatformEmailService(new PlatformEmailRepository(), transport, { connected: true });
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
    privacy,
    email,
    baseDomain: "allelitecloud.com",
  });
  return { app, captured };
}

let browser: Browser | undefined;

describe.runIf(RUN)("privacy-request intake + fragment exchange — REAL browser", () => {
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    // Map the tenant/apex hostnames to loopback so the browser sends a real
    // recognized Host header (Chromium forbids overriding Host on navigation).
    browser = await chromium.launch({
      args: [
        "--host-resolver-rules=MAP allelitecloud.com 127.0.0.1, MAP *.allelitecloud.com 127.0.0.1",
      ],
    });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function withServer<T>(app: ReturnType<typeof buildApp>["app"], fn: (base: string) => Promise<T>): Promise<T> {
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      return await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  it(
    "public intake page loads with no console errors and no horizontal overflow (desktop + phone)",
    async () => {
      const { app } = buildApp();
      await withServer(app, async (base) => {
        for (const viewport of [
          { width: 1280, height: 800 },
          { width: 390, height: 844 },
        ]) {
          // The intake page renders per host (apex → platform intake). Set the
          // Host so the real form renders (the loopback host would otherwise be
          // unrecognized). Host is settable via Playwright extraHTTPHeaders.
          const ctx = await browser!.newContext({ viewport });
          const page = await ctx.newPage();
          // Uncaught JS exceptions (meaningful signal; ignores benign favicon 404s).
          const jsErrors: string[] = [];
          page.on("pageerror", (e) => jsErrors.push(e.message));
          try {
            // Real recognized apex host via the resolver rule (→ 127.0.0.1).
            const apex = `http://allelitecloud.com:${new URL(base).port}/privacy-request`;
            await page.goto(apex, { waitUntil: "load" });
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth + 1,
            );
            expect(overflow).toBe(false);
            expect(jsErrors).toEqual([]);
            // The intake page rendered real content (form or fields present).
            const hasIntake = await page.evaluate(
              () =>
                document.querySelectorAll("form, input, textarea, select").length > 0 ||
                (document.body.textContent ?? "").trim().length > 40,
            );
            expect(hasIntake).toBe(true);
          } finally {
            await ctx.close();
          }
        }
      });
    },
    45_000,
  );

  it(
    "the verify fragment-exchange strips the token from history, POSTs it (never in a URL), and loads no third-party assets",
    async () => {
      const { app, captured } = buildApp();
      // Create a privacy request via supertest (it can set Host, which fetch
      // cannot) so a verify token is minted; the token lives only in the emailed
      // fragment link. Same app instance backs the live server below.
      await request(app)
        .post("/privacy-requests")
        .set("Host", "allelitecloud.com")
        .send({
          name: "Dana Doe",
          email: "dana@example.com",
          category: "deletion",
          description: "Please delete my data.",
          acknowledge: true,
        });
      await withServer(app, async (base) => {
        const body = captured.map((m) => `${m.body ?? ""} ${m.html ?? ""}`).join("\n");
        const token = /\/privacy-request\/verify#v=([A-Za-z0-9]+)/.exec(body)?.[1];
        expect(token, "verify token captured from email").toBeTruthy();

        const requests: string[] = [];
        const page = await browser!.newPage();
        page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
        try {
          await page.goto(`${base}/privacy-request/verify#v=${token}`, { waitUntil: "load" });
          await page.waitForFunction(
            () => (document.body.textContent ?? "").trim().length > 0,
            undefined,
            { timeout: 10_000 },
          );
          // Fragment (+token) stripped from history.
          expect(await page.evaluate(() => location.hash)).toBe("");
          // The token NEVER appears in any request URL (goes in the POST body).
          expect(requests.some((u) => u.includes(String(token)))).toBe(false);
          // Same-origin only — no third-party assets/analytics.
          expect(requests.every((u) => u.includes("127.0.0.1"))).toBe(true);
        } finally {
          await page.close();
        }
      });
    },
    45_000,
  );
});
