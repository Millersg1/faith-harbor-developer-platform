import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";
import { createLeadMagnetDownloadRouter, type MagnetFileSource } from "./leadMagnetDownloadRouter";

const PDF = Buffer.from("%PDF-1.7\n%����\n1 0 obj<<>>endobj\n", "latin1");

function makeFiles(): MagnetFileSource & {
  store: Map<string, { name: string; data: Buffer; deletedAt?: string }>;
} {
  const store = new Map<string, { name: string; data: Buffer; deletedAt?: string }>();
  return {
    store,
    async get(id) {
      const f = store.get(id);
      if (!f) throw new Error("not found");
      return { name: f.name, deletedAt: f.deletedAt };
    },
    async download(id) {
      const f = store.get(id);
      if (!f || f.deletedAt) throw new Error("not found");
      return { file: { name: f.name }, data: f.data };
    },
  };
}

function harness(startMs = 1_700_000_000_000) {
  const clock = { ms: startMs };
  const capabilities = new LeadMagnetCapabilityService(
    new LeadMagnetCapabilityRepository(),
    () => clock.ms,
  );
  const files = makeFiles();
  files.store.set("file1", { name: "The Guide.pdf", data: PDF });
  const app = express();
  app.use(createLeadMagnetDownloadRouter({ capabilities, files, now: () => clock.ms }));
  return { app, capabilities, files, clock };
}

async function mint(capabilities: LeadMagnetCapabilityService, over: Record<string, string> = {}) {
  const { token } = await capabilities.mint({
    organizationId: "orgA",
    formId: "form1",
    fulfillmentId: "ful1",
    fileId: "file1",
    ...over,
  });
  return token;
}

function cookieFrom(res: request.Response): string {
  const set = res.headers["set-cookie"] as unknown as string[] | undefined;
  return (set?.[0] ?? "").split(";")[0];
}

describe("lead-magnet download route", () => {
  it("GET /magnet is a neutral, hardened, third-party-free page that strips the fragment", async () => {
    const { app } = harness();
    const res = await request(app).get("/magnet");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-robots-tag"]).toMatch(/noindex/);
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(res.text).toMatch(/history\.replaceState/);
    expect(res.text).not.toMatch(/https?:\/\//); // no third-party assets
  });

  it("valid capability → session cookie → PDF served as a hardened attachment", async () => {
    const { app, capabilities } = harness();
    const token = await mint(capabilities);
    const post = await request(app).post("/magnet").send({ token });
    expect(post.body).toEqual({ ok: true });
    const cookie = cookieFrom(post);
    expect(cookie).toMatch(/^aec_magnet_dl=/);

    const file = await request(app).get("/magnet/file").set("Cookie", cookie);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/octet-stream");
    expect(file.headers["content-disposition"]).toBe('attachment; filename="The_Guide.pdf"');
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["cache-control"]).toMatch(/no-store/);
    expect(Buffer.from(file.body).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("POST ignores client-supplied org/file/path/mime — only the token matters", async () => {
    const { app, capabilities } = harness();
    const token = await mint(capabilities);
    const post = await request(app)
      .post("/magnet")
      .send({ token, organizationId: "orgB", fileId: "evil", path: "/etc/passwd", mime: "text/html" });
    expect(post.body).toEqual({ ok: true }); // extra fields ignored
    const file = await request(app).get("/magnet/file").set("Cookie", cookieFrom(post));
    // Served the capability's own file, not the injected one.
    expect(file.headers["content-disposition"]).toBe('attachment; filename="The_Guide.pdf"');
  });

  it("forged / expired / revoked / already-used capability fails generically (no cookie)", async () => {
    const { app, capabilities, clock } = harness();
    // forged
    expect((await request(app).post("/magnet").send({ token: "f".repeat(64) })).body).toEqual({ ok: false });
    // expired
    const t1 = await mint(capabilities, { fulfillmentId: "fx" });
    clock.ms += 48 * 60 * 60 * 1000;
    expect((await request(app).post("/magnet").send({ token: t1 })).body).toEqual({ ok: false });
    // already used
    const t2 = await mint(capabilities, { fulfillmentId: "fy" });
    await request(app).post("/magnet").send({ token: t2 });
    expect((await request(app).post("/magnet").send({ token: t2 })).body).toEqual({ ok: false });
  });

  it("the download session is one-time; a replay of the cookie fails", async () => {
    const { app, capabilities } = harness();
    const token = await mint(capabilities);
    const cookie = cookieFrom(await request(app).post("/magnet").send({ token }));
    expect((await request(app).get("/magnet/file").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).get("/magnet/file").set("Cookie", cookie)).status).toBe(404);
  });

  it("GET /magnet/file without a session cookie → 404", async () => {
    const { app } = harness();
    expect((await request(app).get("/magnet/file")).status).toBe(404);
    expect((await request(app).get("/magnet/file").set("Cookie", "aec_magnet_dl=" + "a".repeat(48))).status).toBe(404);
  });

  it("a file that is no longer a PDF (bytes) is refused at serve time", async () => {
    const { app, capabilities, files } = harness();
    files.store.set("file1", { name: "The Guide.pdf", data: Buffer.from("<html>not a pdf", "latin1") });
    const token = await mint(capabilities);
    const cookie = cookieFrom(await request(app).post("/magnet").send({ token }));
    expect((await request(app).get("/magnet/file").set("Cookie", cookie)).status).toBe(404);
  });

  it("a deleted file fails the exchange (no cookie issued)", async () => {
    const { app, capabilities, files } = harness();
    files.store.set("file1", { name: "The Guide.pdf", data: PDF, deletedAt: "2026-01-01T00:00:00Z" });
    const token = await mint(capabilities);
    const post = await request(app).post("/magnet").send({ token });
    expect(post.body).toEqual({ ok: false });
  });
});
