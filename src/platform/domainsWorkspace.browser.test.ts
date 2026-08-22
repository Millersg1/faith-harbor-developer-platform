// REAL-BROWSER acceptance (Playwright/Chromium) for the Stage 11 owner/admin
// domains workspace. Opt-in: skipped unless RUN_BROWSER_TESTS=1 (CI images
// usually lack a browser binary). Excluded from tsconfig typecheck like the
// other *.browser.test.ts fixtures.
//   RUN_BROWSER_TESTS=1 npx vitest run src/platform/domainsWorkspace.browser.test.ts
import http from "node:http";

import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { OrganizationService } from "../tenancy/OrganizationService";
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

const RUN = process.env.RUN_BROWSER_TESTS === "1";

function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  return createPlatformApp({
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
  });
}

const WIDTHS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 375, height: 812 },
];

let browser: Browser | undefined;

describe.runIf(RUN)("domains workspace — REAL browser accessibility", () => {
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    // Guard the close: Chromium teardown can hang on some hosts (Windows), and a
    // blocked teardown must not fail an otherwise-green acceptance run.
    try {
      await Promise.race([
        browser?.close(),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    } catch {
      /* ignore teardown errors */
    }
  }, 30_000);

  async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
    const server = http.createServer(buildApp());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      return await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  for (const vp of WIDTHS) {
    it(`is accessible + non-overflowing at ${vp.name} (${vp.width}px)`, async () => {
      await withServer(async (base) => {
        const ctx = await browser!.newContext({
          viewport: { width: vp.width, height: vp.height },
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        await page.goto(`${base}/app/domains`, { waitUntil: "networkidle" });

        // Landmarks + heading structure.
        expect(await page.locator("main#mainContent").count()).toBe(1);
        expect(await page.locator("h1").first().textContent()).toContain("Domain registration");
        // A labelled search control.
        const label = page.locator('label[for="q"]');
        expect(await label.count()).toBe(1);
        expect(await page.locator("#q").count()).toBe(1);
        // Live status region for screen readers.
        expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThan(0);
        // Skip link is the first focusable element.
        await page.keyboard.press("Tab");
        const firstFocus = await page.evaluate(() => document.activeElement?.textContent ?? "");
        expect(firstFocus).toContain("Skip to main content");
        // Keyboard focus is visible (an outline is applied on :focus-visible).
        await page.locator("#q").focus();
        const outline = await page.locator("#q").evaluate((el) => getComputedStyle(el).outlineStyle);
        expect(outline).not.toBe("none");
        // No horizontal overflow at this width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);

        await ctx.close();
      });
    }, 60_000);
  }
});
