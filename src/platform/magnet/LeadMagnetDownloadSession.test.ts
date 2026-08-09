import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  LeadMagnetDownloadSessionRepository,
  LeadMagnetDownloadSessionService,
} from "./LeadMagnetDownloadSessionService";

function svc(startMs = 1_700_000_000_000) {
  const clock = { ms: startMs };
  const repo = new LeadMagnetDownloadSessionRepository();
  const s = new LeadMagnetDownloadSessionService(repo, () => clock.ms);
  return { s, repo, clock };
}

const input = { organizationId: "orgA", fulfillmentId: "ful1", fileId: "file1" };

describe("LeadMagnetDownloadSessionService — one-time opaque capability", () => {
  it("issues an opaque id and stores only its hash, bound to org/fulfillment/file", async () => {
    const { s, repo } = svc();
    const raw = await s.issue(input);
    expect(raw).toMatch(/^[a-f0-9]{48}$/);
    // Only the hash is a key; the raw id is not stored.
    const hash = createHash("sha256").update(raw).digest("hex");
    expect(await repo.consume(hash, "magnet_download", new Date(1_700_000_000_000).toISOString())).toBeTruthy();
  });

  it("consumes once, binding is returned; a replay fails closed", async () => {
    const { s } = svc();
    const raw = await s.issue(input);
    expect(await s.consume(raw)).toEqual({ ok: true, organizationId: "orgA", fulfillmentId: "ful1", fileId: "file1" });
    expect(await s.consume(raw)).toEqual({ ok: false }); // single-use
  });

  it("expires after the TTL", async () => {
    const { s, clock } = svc();
    const raw = await s.issue({ ...input, ttlMs: 1000 });
    clock.ms += 2000;
    expect(await s.consume(raw)).toEqual({ ok: false });
  });

  it("malformed / forged ids fail closed", async () => {
    const { s } = svc();
    await s.issue(input);
    expect(await s.consume("")).toEqual({ ok: false });
    expect(await s.consume("nope")).toEqual({ ok: false });
    expect(await s.consume("a".repeat(48))).toEqual({ ok: false }); // valid shape, wrong id
  });

  it("each issue rotates a fresh id (fixation-safe)", async () => {
    const { s } = svc();
    const a = await s.issue(input);
    const b = await s.issue(input);
    expect(a).not.toBe(b);
  });
});
