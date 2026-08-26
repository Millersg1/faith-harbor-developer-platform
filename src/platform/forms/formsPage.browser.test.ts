// REAL-BROWSER fixture (Playwright/Chromium) for the /app/forms customer config
// UI. Opt-in: skipped unless RUN_BROWSER_TESTS=1. Excluded from tsconfig typecheck.
//   RUN_BROWSER_TESTS=1 npx vitest run src/platform/forms/formsPage.browser.test.ts
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
import { createPlatformApp } from "../createPlatformApp";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import { DripService } from "../drip/DripService";
import { PlatformFileRepository } from "../files/PlatformFileRepository";
import { PlatformFileService } from "../files/PlatformFileService";
import { MemoryStorageProvider } from "../files/StorageProvider";
import { PlatformFormRepository } from "./PlatformFormRepository";
import { PlatformFormService } from "./PlatformFormService";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";

const RUN = process.env.RUN_BROWSER_TESTS === "1";
const A = "/api/platform";

async function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
  const forms = new PlatformFormService(new PlatformFormRepository(), { leads });
  const drip = new DripService();
  const files = new PlatformFileService(new PlatformFileRepository(), new MemoryStorageProvider());
  const app = createPlatformApp({
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients, leads, forms, drip, files,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });
  const signup = await request(app).post("/auth/signup").send({ organizationName: "Acme", slug: "acme", email: "owner@acme.com", password: "password123" });
  const setCookie = ([] as string[]).concat(signup.headers["set-cookie"] as unknown as string[]);
  const token = (setCookie.find((c) => c.startsWith("aec_session=")) ?? setCookie[0] ?? "").split(";")[0].split("=");
  const seq = await request(app).post(`${A}/drip/sequences`).set("Cookie", setCookie).send({ name: "Welcome" });
  return { app, cookieName: token[0], cookieVal: token[1], sequenceName: seq.body.sequence?.name };
}

let browser: Browser | undefined;

describe.runIf(RUN)("/app/forms customer config UI — REAL browser", () => {
  beforeAll(async () => { const { chromium } = await import("playwright"); browser = await chromium.launch(); }, 60_000);
  afterAll(async () => { await Promise.race([browser?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 5_000))]); });

  it("renders accessibly at desktop/tablet/phone and configures a form through the UI", async () => {
    const built = await buildApp();
    const server = http.createServer(built.app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
        const ctx = await browser!.newContext({ viewport, reducedMotion: "reduce" });
        await ctx.addCookies([{ name: built.cookieName, value: built.cookieVal, domain: "127.0.0.1", path: "/" }]);
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (e) => jsErrors.push(e.message));
        await page.goto(`http://127.0.0.1:${port}/app/forms`, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(overflow, `overflow @${viewport.width}`).toBe(false);
        expect(jsErrors, `js @${viewport.width}`).toEqual([]);
        const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll("input,select,textarea")).filter((el) => { const id = el.getAttribute("id"); return !id || !document.querySelector(`label[for="${id}"]`); }).length);
        expect(unlabeled, `unlabeled @${viewport.width}`).toBe(0);
        await ctx.close();
      }

      // Configure a form entirely through the UI (desktop) and save.
      const ctx = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addCookies([{ name: built.cookieName, value: built.cookieVal, domain: "127.0.0.1", path: "/" }]);
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}/app/forms`, { waitUntil: "networkidle" });
      await page.fill("#name", "Pilot lead form");
      await page.fill("#fields", "email,Email,email,true");
      await page.fill("#origins", "https://inst.example");
      await page.check("#consentEnabled");
      await page.fill("#consentField", "consent");
      await page.fill("#consentWording", "I agree to receive marketing emails.");
      await page.fill("#consentVersion", "2025-08");
      // The sequence dropdown is populated ONLY from this tenant's sequences.
      await page.selectOption("#sequence", { label: built.sequenceName });
      await page.selectOption("#magnetMode", "redirect");
      await page.fill("#magnetTitle", "Guide");
      await page.fill("#magnetUrl", "https://inst.example/guide");
      await page.click("#form button[type=submit]");
      await page.waitForSelector(".msg.ok", { timeout: 5000 });
      await ctx.close();

      // Verify the settings persisted via the API.
      const list = await request(built.app).get(`${A}/forms`).set("Cookie", `${built.cookieName}=${built.cookieVal}`);
      const form = list.body.forms.find((f: { name: string }) => f.name === "Pilot lead form");
      expect(form.settings.allowedOrigins).toEqual(["https://inst.example"]);
      expect(form.settings.consent).toMatchObject({ enabled: true, wording: "I agree to receive marketing emails.", version: "2025-08" });
      expect(form.settings.consent.sequenceId).toBeTruthy();
      expect(form.settings.leadMagnet.mode).toBe("redirect");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 90_000);
});
