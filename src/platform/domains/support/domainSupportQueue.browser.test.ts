// REAL-BROWSER fixture (Playwright/Chromium) for the platform-admin domain
// SUPPORT QUEUE page. Opt-in: skipped unless RUN_BROWSER_TESTS=1. Excluded from
// tsconfig typecheck like the other *.browser.test.ts fixtures.
//   RUN_BROWSER_TESTS=1 npx vitest run src/platform/domains/support/domainSupportQueue.browser.test.ts
import http from "node:http";

import type { Browser } from "playwright";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizationService } from "../../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../../branding/BrandingRepository";
import { BrandingService } from "../../branding/BrandingService";
import { PlatformClientRepository } from "../../clients/PlatformClientRepository";
import { PlatformClientService } from "../../clients/PlatformClientService";
import { PlatformInvoiceRepository } from "../../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../../projects/PlatformProjectService";
import { createPlatformApp } from "../../createPlatformApp";
import { PlatformSessionRepository } from "../../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../../sessions/PlatformSessionService";
import { PlatformSignupService } from "../../signup/PlatformSignupService";
import { PlatformUserRepository } from "../../users/PlatformUserRepository";
import { PlatformUserService } from "../../users/PlatformUserService";
import { DomainSupportActionRepository } from "./DomainSupportActionRepository";
import { InMemorySupportQueueReader, type SupportQueueItem } from "./DomainSupportQueue";
import { DomainSupportQueueService } from "./DomainSupportQueueService";

const RUN = process.env.RUN_BROWSER_TESTS === "1";
const NOW = "2026-09-01T00:00:00Z";

const rows: SupportQueueItem[] = [
  { category: "registration_unknown", itemRef: "ord-1", organizationId: "org-a", state: "registration_unknown", since: NOW },
  { category: "delivery_unknown", itemRef: "ntc-1", organizationId: "org-b", state: "delivery_unknown", since: NOW },
];

async function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const admins = new PlatformAdminService();
  await admins.create({ email: "root@allelitecloud.com", password: "password123", name: "Root" });
  let seq = 0;
  const domainSupport = new DomainSupportQueueService({
    reader: new InMemorySupportQueueReader(rows),
    actions: new DomainSupportActionRepository(),
    now: () => NOW, newId: () => `act${++seq}`,
  });
  const app = createPlatformApp({
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins,
    adminSessions: new PlatformAdminSessionService(),
    domainSupport,
  });
  return app;
}

let browser: Browser | undefined;

describe.runIf(RUN)("domain support queue page — REAL browser", () => {
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await Promise.race([browser?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 5_000))]);
  });

  it(
    "renders accessibly with no overflow or JS errors at desktop, tablet, and phone",
    async () => {
      const app = await buildApp();
      // Log in to get the admin cookie so the queue populates with data.
      const login = await request(app).post("/platform/admin/api/login").send({ email: "root@allelitecloud.com", password: "password123" });
      const setCookie = ([] as string[]).concat(login.headers["set-cookie"] as unknown as string[]);
      const token = (setCookie.find((c) => c.startsWith("aec_admin=")) ?? "").split(";")[0].split("=")[1];
      expect(token).toBeTruthy();

      const server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      try {
        for (const viewport of [
          { width: 1280, height: 800 }, // desktop
          { width: 768, height: 1024 }, // tablet
          { width: 390, height: 844 },  // phone
        ]) {
          const ctx = await browser!.newContext({ viewport, reducedMotion: "reduce" });
          await ctx.addCookies([{ name: "aec_admin", value: token, domain: "127.0.0.1", path: "/" }]);
          const page = await ctx.newPage();
          const jsErrors: string[] = [];
          page.on("pageerror", (e) => jsErrors.push(e.message));
          await page.goto(`http://127.0.0.1:${port}/platform/admin/domain-ops`, { waitUntil: "networkidle" });

          // No horizontal overflow at any width.
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          expect(overflow, `overflow at ${viewport.width}`).toBe(false);
          // No uncaught JS.
          expect(jsErrors, `js errors at ${viewport.width}`).toEqual([]);
          // The read-only redaction notice is present.
          const notice = await page.textContent(".notice");
          expect(notice?.toLowerCase()).toContain("read-only support surface");
          // The seeded queue rows populated (data path works end to end).
          const rowCount = await page.locator("tbody#rows tr.row").count();
          expect(rowCount).toBe(2);
          // Every input has an accessible label.
          const unlabeled = await page.evaluate(() =>
            Array.from(document.querySelectorAll("select,textarea,input")).filter((el) => {
              const id = el.getAttribute("id");
              return !id || !document.querySelector(`label[for="${id}"]`);
            }).length);
          expect(unlabeled, `unlabeled fields at ${viewport.width}`).toBe(0);
          await ctx.close();
        }
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    },
    90_000,
  );
});
