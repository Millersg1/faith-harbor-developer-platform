import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";

function svc(startMs = 1_700_000_000_000) {
  const clock = { ms: startMs };
  const repo = new LeadMagnetCapabilityRepository();
  const s = new LeadMagnetCapabilityService(repo, () => clock.ms);
  return { s, repo, clock };
}

const mintInput = {
  organizationId: "orgA",
  formId: "form1",
  fulfillmentId: "ful1",
  fileId: "file1",
};

describe("LeadMagnetCapabilityService — opaque, hash-only, bounded", () => {
  it("mints an opaque 256-bit token and stores only its hash", async () => {
    const { s, repo, clock } = svc();
    const raw = await s.mint(mintInput);
    expect(raw).toMatch(/^[a-f0-9]{64}$/); // opaque random, not a file id
    // Only the HASH is stored: the raw token is not a key; its hash is.
    const hash = createHash("sha256").update(raw).digest("hex");
    void clock;
    expect(await repo.get(hash)).toBeTruthy();
    expect(await repo.get(raw)).toBeUndefined(); // raw is never a stored key
  });

  it("redeems once and binds org/form/file; a replay is exhausted (single-use default)", async () => {
    const { s } = svc();
    const raw = await s.mint(mintInput);
    const first = await s.redeem(raw);
    expect(first).toEqual({
      ok: true,
      organizationId: "orgA",
      formId: "form1",
      fulfillmentId: "ful1",
      fileId: "file1",
    });
    expect(await s.redeem(raw)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("honors a bounded use count", async () => {
    const { s } = svc();
    const raw = await s.mint({ ...mintInput, maxUses: 2 });
    expect((await s.redeem(raw)).ok).toBe(true);
    expect((await s.redeem(raw)).ok).toBe(true);
    expect(await s.redeem(raw)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("expires after the TTL", async () => {
    const { s, clock } = svc();
    const raw = await s.mint({ ...mintInput, ttlMs: 1000 });
    clock.ms += 2000;
    expect(await s.redeem(raw)).toEqual({ ok: false, reason: "expired" });
  });

  it("a revoked capability fails closed", async () => {
    const { s } = svc();
    const raw = await s.mint(mintInput);
    await s.revokeForFulfillment("ful1");
    expect(await s.redeem(raw)).toEqual({ ok: false, reason: "revoked" });
  });

  it("forged / malformed tokens are invalid (never touch storage semantics)", async () => {
    const { s } = svc();
    await s.mint(mintInput);
    expect(await s.redeem("nope")).toEqual({ ok: false, reason: "invalid" });
    expect(await s.redeem("")).toEqual({ ok: false, reason: "invalid" });
    expect(await s.redeem("A".repeat(64))).toEqual({ ok: false, reason: "invalid" }); // not lowercase hex
    expect(await s.redeem("f".repeat(64))).toEqual({ ok: false, reason: "invalid" }); // valid shape, wrong token
  });
});
