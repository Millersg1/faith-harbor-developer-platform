import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARKETING_LIMITS,
  MarketingLimitsService,
  MarketingMeterRepository,
  windowStart,
} from "./MarketingLimitsService";
import {
  MarketingPauseRepository,
  MarketingPauseService,
} from "./MarketingPauseService";

const NO_CONCURRENCY = { tenantSending: 0, platformSending: 0 };

function limits(overrides: Partial<typeof DEFAULT_MARKETING_LIMITS> = {}, nowMs = 1_700_000_000_000) {
  const clock = { ms: nowMs };
  // A SHARED meter repo simulates the durable store across "restarts".
  const repo = new MarketingMeterRepository();
  const make = () =>
    new MarketingLimitsService(repo, { ...DEFAULT_MARKETING_LIMITS, ...overrides }, () => clock.ms);
  return { repo, make, clock };
}

describe("MarketingLimitsService — durable, restart-safe caps", () => {
  it("enforces the per-tenant hourly cap on SENT (not attempts)", async () => {
    const { make } = limits({ perTenantHourly: 2 });
    const svc = make();
    // Attempts/failures do NOT count toward the send cap.
    await svc.recordAttempt("orgA");
    await svc.recordFailure("orgA");
    expect((await svc.checkSendAllowed("orgA", NO_CONCURRENCY)).allowed).toBe(true);
    await svc.recordSent("orgA");
    await svc.recordSent("orgA");
    const gate = await svc.checkSendAllowed("orgA", NO_CONCURRENCY);
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.reason).toBe("tenant_hourly");
  });

  it("caps survive a process restart (counters are durable)", async () => {
    const { make, repo, clock } = limits({ perTenantDaily: 1 });
    const svc1 = make();
    await svc1.recordSent("orgA");
    // Simulate a restart: a brand-new service over the SAME durable meter repo,
    // reading the same wall-clock window.
    const svc2 = new MarketingLimitsService(
      repo,
      { ...DEFAULT_MARKETING_LIMITS, perTenantDaily: 1 },
      () => clock.ms,
    );
    const gate = await svc2.checkSendAllowed("orgA", NO_CONCURRENCY);
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.reason).toBe("tenant_daily");
  });

  it("enforces the platform-wide caps across tenants", async () => {
    const { make } = limits({ platformHourly: 2, perTenantHourly: 100 });
    const svc = make();
    await svc.recordSent("orgA");
    await svc.recordSent("orgB");
    // Platform hour window now has 2 sends → a third tenant is blocked.
    const gate = await svc.checkSendAllowed("orgC", NO_CONCURRENCY);
    expect(gate.allowed === false && gate.reason).toBe("platform_hourly");
  });

  it("enforces per-tenant and platform concurrency", async () => {
    const { make } = limits({ perTenantConcurrent: 1, platformConcurrent: 3 });
    const svc = make();
    expect(
      (await svc.checkSendAllowed("orgA", { tenantSending: 1, platformSending: 1 })).allowed,
    ).toBe(false); // tenant_concurrent
    const g = await svc.checkSendAllowed("orgA", { tenantSending: 0, platformSending: 3 });
    expect(g.allowed === false && g.reason).toBe("platform_concurrent");
  });

  it("new hour window resets the hourly cap (daily still accrues)", async () => {
    const { make, clock } = limits({ perTenantHourly: 1, perTenantDaily: 100 });
    const svc = make();
    await svc.recordSent("orgA");
    expect((await svc.checkSendAllowed("orgA", NO_CONCURRENCY)).allowed).toBe(false);
    clock.ms += 60 * 60 * 1000; // next hour
    expect((await svc.checkSendAllowed("orgA", NO_CONCURRENCY)).allowed).toBe(true);
  });
});

describe("MarketingLimitsService — failure-rate auto-pause (observable only)", () => {
  it("does NOT pause below the minimum sample even at 100% failure", async () => {
    const { make } = limits({ autoPauseMinSample: 20, autoPauseFailureRate: 0.5 });
    const svc = make();
    for (let i = 0; i < 5; i += 1) {
      await svc.recordAttempt("orgA");
      await svc.recordFailure("orgA");
    }
    expect((await svc.evaluateAutoPause("orgA")).pause).toBe(false);
  });

  it("pauses once the sample is reached AND the observed failure rate crosses the threshold", async () => {
    const { make } = limits({ autoPauseMinSample: 10, autoPauseFailureRate: 0.5 });
    const svc = make();
    for (let i = 0; i < 10; i += 1) await svc.recordAttempt("orgA");
    for (let i = 0; i < 6; i += 1) await svc.recordFailure("orgA"); // 6/10 = 60%
    const r = await svc.evaluateAutoPause("orgA");
    expect(r.pause).toBe(true);
    expect(r.pause === true && r.reason).toBe("failure_rate");
  });

  it("a healthy tenant with mostly SENTs is not paused", async () => {
    const { make } = limits({ autoPauseMinSample: 10, autoPauseFailureRate: 0.5 });
    const svc = make();
    for (let i = 0; i < 20; i += 1) {
      await svc.recordAttempt("orgA");
      await svc.recordSent("orgA");
    }
    await svc.recordFailure("orgA"); // one blip
    expect((await svc.evaluateAutoPause("orgA")).pause).toBe(false);
  });

  it("windowStart is deterministic per hour/day", () => {
    const t = Date.parse("2026-08-08T15:42:07.500Z");
    expect(windowStart("hour", t)).toBe("2026-08-08T15:00:00.000Z");
    expect(windowStart("day", t)).toBe("2026-08-08T00:00:00.000Z");
  });
});

describe("MarketingPauseService — durable, tenant-isolated", () => {
  it("pause/resume tenant marketing is durable and isolated per tenant", async () => {
    const repo = new MarketingPauseRepository();
    const svc = new MarketingPauseService(repo, () => "2026-08-08T00:00:00.000Z");
    await svc.pauseTenant("orgA", { actor: "owner", auto: false });
    expect(await svc.isTenantPaused("orgA")).toBe(true);
    // Another tenant is unaffected.
    expect(await svc.isTenantPaused("orgB")).toBe(false);
    // Survives a "restart" (new service over the same repo).
    const svc2 = new MarketingPauseService(repo);
    expect(await svc2.isTenantPaused("orgA")).toBe(true);
    await svc2.resumeTenant("orgA", "owner");
    expect(await svc2.isTenantPaused("orgA")).toBe(false);
  });

  it("sequence pause is namespaced by tenant (no cross-tenant collision)", async () => {
    const svc = new MarketingPauseService(new MarketingPauseRepository());
    await svc.pauseSequence("orgA", "seq-1", "owner");
    expect(await svc.isSequencePaused("orgA", "seq-1")).toBe(true);
    expect(await svc.isSequencePaused("orgB", "seq-1")).toBe(false); // same id, other tenant
  });

  it("auto-pause records carry only enum/threshold/recovery — no PII/content", async () => {
    const repo = new MarketingPauseRepository();
    const svc = new MarketingPauseService(repo, () => "2026-08-08T00:00:00.000Z");
    await svc.pauseTenant("orgA", {
      actor: "system",
      auto: true,
      reason: "failure_rate",
      threshold: "50%_over_20",
      recovery: "manual_resume_required",
    });
    const [rec] = await svc.list("orgA");
    expect(rec.auto).toBe(true);
    expect(rec.reason).toBe("failure_rate");
    const blob = JSON.stringify(rec);
    expect(blob).not.toMatch(/@/); // no email/address
    expect(blob).not.toMatch(/smtp|password|token/i);
  });
});
