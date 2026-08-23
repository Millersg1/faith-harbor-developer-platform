import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider } from "../FakeRegistrarProvider";
import { TokenBucketRateLimiter } from "../ratelimit/TokenBucketRateLimiter";
import { DomainSyncRepository } from "./DomainSyncRepository";
import { DomainSyncScanner, verificationRequired } from "./DomainSyncScanner";

const NOW = "2026-09-01T00:00:00Z";

describe("Stage L4 — token-bucket rate limiter", () => {
  it("allows up to capacity, denies when empty, then refills over time", () => {
    let t = 0;
    const rl = new TokenBucketRateLimiter({ capacity: 2, refillPerSec: 1 }, () => t);
    expect(rl.tryRemove("k").allowed).toBe(true);
    expect(rl.tryRemove("k").allowed).toBe(true);
    const denied = rl.tryRemove("k");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000); // one token in 1s
    t = 1000;
    expect(rl.tryRemove("k").allowed).toBe(true); // refilled
  });
  it("keys are independent + peek does not spend", () => {
    let t = 0;
    const rl = new TokenBucketRateLimiter({ capacity: 1, refillPerSec: 1 }, () => t);
    expect(rl.peek("a")).toBe(1);
    expect(rl.peek("a")).toBe(1); // peek is non-mutating
    expect(rl.tryRemove("a").allowed).toBe(true);
    expect(rl.tryRemove("b").allowed).toBe(true); // separate bucket
  });
});

function build(fake: Record<string, unknown> = {}, opts: Partial<ConstructorParameters<typeof DomainSyncScanner>[0]> = {}) {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1000 }, ...fake });
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainSyncRepository();
  const scanner = new DomainSyncScanner({
    repo, registrations, registrar, now: () => NOW,
    jitter: () => 0, // deterministic reschedule
    ...opts,
  });
  return { registrar, registrations, repo, scanner };
}

describe("Stage L4 — provider-fact sync scanner", () => {
  it("refreshes confirmed facts + marks the registration fresh", async () => {
    const h = build({ status: { "acme.com": { domain: "acme.com", registered: true, expiresAt: "2027-02-01T00:00:00Z", lifecycleState: "ok" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" });
      await h.scanner.runOnce("w1");
      const st = (await h.repo.getState("reg1"))!;
      expect(st.syncState).toBe("fresh");
      expect(st.observedStatus).toBe("registered");
      expect(st.observedExpiresAt).toBe("2027-02-01T00:00:00Z");
      expect(st.lastSuccessAt).toBe(NOW);
      const reg = (await h.registrations.get("reg1"))!;
      expect(reg.syncState).toBe("fresh");
      expect(reg.expiresAt).toBe("2027-02-01T00:00:00Z"); // provider-confirmed expiry persisted
    });
  });

  it("a provider failure marks error + preserves the confirmed facts (visibly stale)", async () => {
    // Hold the cfg object so we can flip the provider to failing mid-test (the
    // fake keeps a live reference to the config it was constructed with).
    const cfg: Record<string, unknown> = { priceByTld: { com: 1000 }, status: { "acme.com": { domain: "acme.com", registered: true, expiresAt: "2027-02-01T00:00:00Z" } } };
    const registrar = new FakeRegistrarProvider(cfg as never);
    const registrations = new DomainRegistrationRepository();
    const repo = new DomainSyncRepository();
    const scanner = new DomainSyncScanner({ repo, registrations, registrar, now: () => NOW, jitter: () => 0 });
    const h = { registrar, registrations, repo, scanner };
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" });
      await h.scanner.runOnce("w1"); // success first
      // Now make the provider fail and re-scan.
      cfg.throwOnStatus = true;
      // Reset next_scan so it is due again.
      await h.repo.requeueSync({ registrationId: "reg1", nextScanAt: NOW, nowIso: NOW });
      await h.scanner.runOnce("w1");
      const st = (await h.repo.getState("reg1"))!;
      expect(st.syncState).toBe("error");
      expect(st.observedExpiresAt).toBe("2027-02-01T00:00:00Z"); // NOT overwritten
      expect(st.lastSuccessAt).toBe(NOW); // preserved
      expect(st.consecutiveFailures).toBe(1);
      const reg = (await h.registrations.get("reg1"))!;
      expect(reg.syncState).toBe("error");
      expect(reg.lastProviderSyncAt).toBe(NOW); // confirmed timestamp NOT advanced by a failure
    });
  });

  it("a rate-limited call is DEFERRED (no provider call, facts untouched)", async () => {
    // Provider limiter with zero capacity → always denied.
    const limiter = new TokenBucketRateLimiter({ capacity: 0, refillPerSec: 0 }, () => 0);
    const h = build({ status: { "acme.com": { domain: "acme.com", registered: true } } }, { providerLimiter: limiter });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" });
      await h.scanner.runOnce("w1");
      const st = (await h.repo.getState("reg1"))!;
      expect(st.syncState).toBe("unknown"); // never refreshed
      expect(st.consecutiveFailures).toBe(0); // a throttle is not a failure
      expect(h.scanner.health().lastRateDeferred).toBe(1);
      expect(h.scanner.health().lastRefreshed).toBe(0);
    });
  });

  it("is fair: a per-tenant cap limits how many of one tenant's rows run per tick", async () => {
    const h = build({ status: {} }, { perTenant: 1 });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      for (const id of ["r1", "r2", "r3"]) {
        await h.registrations.create({ id, asciiDomain: `${id}.com`, unicodeDomain: `${id}.com`, tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" });
      }
      const res = await h.scanner.runOnce("w1");
      expect(res.processed).toBe(1); // capped at 1 for the tenant this tick
    });
  });

  it("verificationRequired is inferred ONLY from provider-reported lifecycle", () => {
    expect(verificationRequired("pendingVerification")).toBe(true);
    expect(verificationRequired("clientHold")).toBe(true);
    expect(verificationRequired("ok")).toBe(false);
    expect(verificationRequired(undefined)).toBe(false);
  });
});
