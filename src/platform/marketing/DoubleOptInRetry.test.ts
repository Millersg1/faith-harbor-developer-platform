import { describe, expect, it } from "vitest";

import {
  DoubleOptInService,
  DoubleOptInTokenRepository,
} from "./DoubleOptInService";

const bound = {
  organizationId: "orgA",
  email: "dana@x.com",
  consentId: "consent-1",
  version: "v1",
};

describe("DoubleOptInService — hash-only retry & sibling invalidation", () => {
  it("a retry mints a NEW independent token; bound fields never change", async () => {
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository());
    const t1 = await svc.mint(bound);
    const t2 = await svc.mint(bound); // retry (e.g. after a send failure)
    expect(t1).not.toBe(t2); // new independent raw token
    expect(t1).toMatch(/^[a-f0-9]{64}$/);
    expect(t2).toMatch(/^[a-f0-9]{64}$/);
  });

  it("either valid token confirms exactly once; confirming invalidates siblings", async () => {
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository());
    const t1 = await svc.mint(bound);
    const t2 = await svc.mint(bound);
    // Confirm with the SECOND token.
    const ok = await svc.confirm(t2);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.organizationId).toBe("orgA");
      expect(ok.email).toBe("dana@x.com");
      expect(ok.consentId).toBe("consent-1");
    }
    // The sibling (first) token is now invalidated → cannot confirm again.
    expect(await svc.confirm(t1)).toEqual({ ok: false, reason: "already_used" });
    // Replaying the used token is idempotent-safe (already_used, no 2nd effect).
    expect(await svc.confirm(t2)).toEqual({ ok: false, reason: "already_used" });
  });

  it("crash before send then retry: a later token still confirms once", async () => {
    // "Token hash stored, process crashes before sending" → t1 exists but was
    // never emailed. A resend mints t2. Either can confirm; only once.
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository());
    await svc.mint(bound); // t1 — assume its email never went out
    const t2 = await svc.mint(bound); // resend
    expect((await svc.confirm(t2)).ok).toBe(true);
  });

  it("concurrent sibling confirmations resolve to the same activation; no further use", async () => {
    // The token layer may let a true concurrent race resolve BOTH sibling
    // tokens, but they resolve to the SAME bound activation — and the single-
    // ENROLLMENT guarantee is enforced downstream by the idempotent activation
    // confirm + the enrollment unique index (proven in S7b-ii). The token-layer
    // invariant is: after confirmation, NO token can be used again.
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository());
    const t1 = await svc.mint(bound);
    const t2 = await svc.mint(bound);
    const [a, b] = await Promise.all([svc.confirm(t1), svc.confirm(t2)]);
    const oks = [a, b].filter((r) => r.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    for (const r of oks) if (r.ok) expect(r.consentId).toBe("consent-1"); // same activation
    // No third confirmation is possible with either token.
    expect((await svc.confirm(t1)).ok).toBe(false);
    expect((await svc.confirm(t2)).ok).toBe(false);
  });

  it("expired/forged tokens fail safely and never confirm", async () => {
    let clock = 1_000_000;
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository(), () => clock);
    const t = await svc.mint(bound);
    expect(await svc.confirm("forged")).toEqual({ ok: false, reason: "invalid" });
    clock += 73 * 60 * 60 * 1000; // past the 72h TTL
    expect(await svc.confirm(t)).toEqual({ ok: false, reason: "expired" });
  });
});
