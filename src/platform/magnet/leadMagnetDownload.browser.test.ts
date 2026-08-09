// REAL-BROWSER fixture (Playwright/Chromium) for the lead-magnet secure download
// exchange. Opt-in: skipped unless RUN_BROWSER_TESTS=1 (CI images usually lack a
// browser binary; launching one also adds load). Run explicitly:
//   RUN_BROWSER_TESTS=1 npx vitest run src/platform/magnet/leadMagnetDownload.browser.test.ts
import http from "node:http";

import express from "express";
// Type-only import (erased at runtime); the runtime module loads dynamically
// inside the guarded describe so collecting this file without playwright never
// requires the package.
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";
import {
  LeadMagnetDownloadSessionRepository,
  LeadMagnetDownloadSessionService,
} from "./LeadMagnetDownloadSessionService";
import { createLeadMagnetDownloadRouter, type MagnetFileSource } from "./leadMagnetDownloadRouter";

const RUN = process.env.RUN_BROWSER_TESTS === "1";

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj<<>>endobj\n", "latin1");

function buildApp() {
  const capabilities = new LeadMagnetCapabilityService(new LeadMagnetCapabilityRepository());
  const sessions = new LeadMagnetDownloadSessionService(new LeadMagnetDownloadSessionRepository());
  const files: MagnetFileSource = {
    async get() {
      return { name: "The Guide.pdf" };
    },
    async download() {
      return { file: { name: "The Guide.pdf" }, data: PDF };
    },
  };
  const app = express();
  app.use(createLeadMagnetDownloadRouter({ capabilities, sessions, files }));
  return { app, capabilities };
}

let browser: Browser | undefined;

describe.runIf(RUN)("lead-magnet download exchange — REAL browser", () => {
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function withServer<T>(app: express.Express, fn: (base: string) => Promise<T>): Promise<T> {
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
    "strips the fragment, POSTs the token (never in a URL), downloads the PDF, and loads no third-party assets",
    async () => {
      const { app, capabilities } = buildApp();
      const { token } = await runWithTenant({ organizationId: "orgA" }, () =>
        capabilities.mint({ organizationId: "orgA", formId: "form1", fulfillmentId: "ful1", fileId: "file1" }),
      );
      await withServer(app, async (base) => {
        const requests: string[] = [];
        const page = await browser!.newPage();
        page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
        try {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15_000 }),
            page.goto(`${base}/magnet#d=${token}`, { waitUntil: "load" }),
          ]);
          // The download is the PDF, forced as an attachment with a safe name.
          expect(download.suggestedFilename()).toBe("The_Guide.pdf");
          // Fragment (and token) stripped from history.
          expect(page.url()).toBe(`${base}/magnet`);
          expect(await page.evaluate(() => location.hash)).toBe("");
          // The token NEVER appears in any request URL (it goes in the POST body).
          expect(requests.some((u) => u.includes(token))).toBe(false);
          expect(requests.some((u) => u === `POST ${base}/magnet`)).toBe(true);
          // Every request stayed same-origin — no third-party assets/analytics.
          expect(requests.every((u) => u.includes("127.0.0.1"))).toBe(true);
        } finally {
          await page.close();
        }
      });
    },
    45_000,
  );

  it(
    "works on a mobile viewport with reduced motion (accessible, self-contained)",
    async () => {
      const { app, capabilities } = buildApp();
      const { token } = await runWithTenant({ organizationId: "orgA" }, () =>
        capabilities.mint({ organizationId: "orgA", formId: "form1", fulfillmentId: "ful2", fileId: "file1" }),
      );
      await withServer(app, async (base) => {
        const context = await browser!.newContext({
          viewport: { width: 390, height: 844 }, // iPhone-ish
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        try {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15_000 }),
            page.goto(`${base}/magnet#d=${token}`, { waitUntil: "load" }),
          ]);
          expect(download.suggestedFilename()).toBe("The_Guide.pdf");
          // The status control is present + labelled for assistive tech.
          expect(await page.getAttribute("#m", "role")).toBe("status");
        } finally {
          await context.close();
        }
      });
    },
    45_000,
  );

  it(
    "a forged capability shows a generic failure and downloads nothing",
    async () => {
      const { app } = buildApp();
      await withServer(app, async (base) => {
        const page = await browser!.newPage();
        let downloaded = false;
        page.on("download", () => {
          downloaded = true;
        });
        try {
          await page.goto(`${base}/magnet#d=${"f".repeat(64)}`, { waitUntil: "load" });
          await page.waitForFunction(
            () => /invalid|expired|already/i.test(document.getElementById("m")?.textContent ?? ""),
            undefined,
            { timeout: 10_000 },
          );
          expect(downloaded).toBe(false);
        } finally {
          await page.close();
        }
      });
    },
    45_000,
  );
});
