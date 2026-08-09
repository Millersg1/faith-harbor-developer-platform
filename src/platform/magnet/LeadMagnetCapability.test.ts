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

describe("LeadMagnetCapabilityService — opaque, hash-only, bounded, siblings", () => {
  it("mints an opaque 256-bit token and stores only its hash", async () => {
    const { s, repo } = svc();
    const { token: raw, tokenHash } = await s.mint(mintInput);
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(await repo.get(tokenHash)).toBeTruthy();
    expect(await repo.get(raw)).toBeUndefined(); // raw is never a stored key
  });

  it("redeems once, binds org/form/file; a replay is exhausted (single-use default)", async () => {
    const { s } = svc();
    const { token } = await s.mint(mintInput);
    expect(await s.redeem(token)).toEqual({
      ok: true,
      organizationId: "orgA",
      formId: "form1",
      fulfillmentId: "ful1",
      fileId: "file1",
    });
    expect(await s.redeem(token)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("honors a bounded use count", async () => {
    const { s } = svc();
    const { token } = await s.mint({ ...mintInput, maxUses: 2, siblingCap: 5 });
    expect((await s.redeem(token)).ok).toBe(true);
    expect((await s.redeem(token)).ok).toBe(true);
    expect(await s.redeem(token)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("expires after the TTL", async () => {
    const { s, clock } = svc();
    const { token } = await s.mint({ ...mintInput, ttlMs: 1000 });
    clock.ms += 2000;
    expect(await s.redeem(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("revoke(token) fails that capability closed (pre-acceptance-failure path)", async () => {
    const { s } = svc();
    const { token } = await s.mint(mintInput);
    await s.revoke(token);
    expect(await s.redeem(token)).toEqual({ ok: false, reason: "revoked" });
  });

  it("forged / malformed tokens are invalid", async () => {
    const { s } = svc();
    await s.mint(mintInput);
    expect(await s.redeem("nope")).toEqual({ ok: false, reason: "invalid" });
    expect(await s.redeem("")).toEqual({ ok: false, reason: "invalid" });
    expect(await s.redeem("A".repeat(64))).toEqual({ ok: false, reason: "invalid" });
    expect(await s.redeem("f".repeat(64))).toEqual({ ok: false, reason: "invalid" });
  });

  it("either SIBLING redeems once; the first redemption invalidates the rest", async () => {
    const { s } = svc();
    const a = (await s.mint({ ...mintInput })).token;
    const b = (await s.mint({ ...mintInput })).token; // sibling for same fulfillment
    // Redeeming one succeeds…
    expect((await s.redeem(a)).ok).toBe(true);
    // …and its siblings are invalidated atomically.
    expect(await s.redeem(b)).toEqual({ ok: false, reason: "revoked" });
  });

  it("bounds live siblings: minting past the cap expires the OLDEST", async () => {
    const { s, clock } = svc();
    // cap 2: mint 3 → the first is expired/revoked, last two live.
    const t1 = (await s.mint({ ...mintInput, siblingCap: 2 })).token;
    clock.ms += 1000;
    const t2 = (await s.mint({ ...mintInput, siblingCap: 2 })).token;
    clock.ms += 1000;
    const t3 = (await s.mint({ ...mintInput, siblingCap: 2 })).token;
    expect(await s.redeem(t1)).toEqual({ ok: false, reason: "revoked" }); // oldest evicted
    // A live one still redeems (and then kills the remaining sibling).
    expect((await s.redeem(t3)).ok).toBe(true);
    expect((await s.redeem(t2)).ok).toBe(false);
  });
});
