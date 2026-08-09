import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { DripRepository } from "../drip/DripRepository";
import { DripService } from "../drip/DripService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import {
  MarketingOutboxRepository,
  MarketingOutboxService,
} from "./MarketingOutboxService";
import { MarketingMeterRepository, MarketingLimitsService } from "./MarketingLimitsService";
import { MarketingPauseRepository, MarketingPauseService } from "./MarketingPauseService";
import { MarketingWorker, type MarketingSendResult } from "./MarketingWorker";
import {
  resolveMarketingDeliveryMode,
  type MarketingDeliveryMode,
} from "./marketingDeliveryMode";

describe("resolveMarketingDeliveryMode — always fails closed", () => {
  it("missing variable → disabled (no silent legacy)", () => {
    expect(resolveMarketingDeliveryMode(undefined)).toMatchObject({
      mode: "disabled",
      source: "unset_failed_closed",
    });
  });
  it("empty value → disabled", () => {
    expect(resolveMarketingDeliveryMode("")).toMatchObject({ mode: "disabled" });
    expect(resolveMarketingDeliveryMode("   ")).toMatchObject({ mode: "disabled" });
  });
  it("malformed value → disabled", () => {
    const r = resolveMarketingDeliveryMode("outbx");
    expect(r.mode).toBe("disabled");
    expect(r.source).toBe("invalid_failed_closed");
    expect(resolveMarketingDeliveryMode("on").mode).toBe("disabled");
    expect(resolveMarketingDeliveryMode("true").mode).toBe("disabled");
  });
  it("explicit legacy → legacy; explicit outbox → outbox; explicit disabled → disabled (case/space-insensitive)", () => {
    expect(resolveMarketingDeliveryMode(" Legacy ").mode).toBe("legacy");
    expect(resolveMarketingDeliveryMode("outbox").mode).toBe("outbox");
    expect(resolveMarketingDeliveryMode("disabled").mode).toBe("disabled");
  });
});

// A fake email service that counts legacy direct sends.
function fakeEmail() {
  const state = { sends: 0 };
  const svc = {
    sendQuietly: async () => {
      state.sends += 1;
    },
  } as unknown as PlatformEmailService;
  return { svc, state };
}

async function seedDripEnrollment(drip: DripService, org: string, email: string) {
  return runWithTenant({ organizationId: org }, async () => {
    const seq = await drip.createSequence({ name: "S", trigger: "lead_created" });
    await drip.addStep(seq.id, { delayHours: 0, subject: "hi", body: "b" });
    await drip.enroll(seq.id, email); // enroll itself isn't gated
    return seq.id;
  });
}

describe("legacy drip path is gated by mode", () => {
  it("runDue sends in legacy mode but NOT in outbox/disabled", async () => {
    let mode: MarketingDeliveryMode = "legacy";
    const email = fakeEmail();
    const drip = new DripService(new DripRepository(), email.svc, {
      marketingMode: () => mode,
    });
    await seedDripEnrollment(drip, "orgA", "lead@x.com");

    mode = "outbox";
    expect(await drip.runDue()).toBe(0);
    expect(email.state.sends).toBe(0);

    mode = "disabled";
    expect(await drip.runDue()).toBe(0);
    expect(email.state.sends).toBe(0);

    mode = "legacy";
    await drip.runDue();
    expect(email.state.sends).toBe(1); // only legacy sends
  });

  it("enrollByTrigger (legacy consent-bypass auto-enroll) is a no-op outside legacy", async () => {
    let mode: MarketingDeliveryMode = "outbox";
    const drip = new DripService(new DripRepository(), fakeEmail().svc, {
      marketingMode: () => mode,
    });
    // A sequence exists that would auto-enroll on lead_created.
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const seq = await drip.createSequence({ name: "S", trigger: "lead_created" });
      await drip.addStep(seq.id, { delayHours: 0, subject: "s", body: "b" });
    });
    await runWithTenant({ organizationId: "orgA" }, () =>
      drip.enrollByTrigger("lead_created", "lead@x.com"),
    );
    const enrollments = await runWithTenant({ organizationId: "orgA" }, () =>
      drip.listEnrollments(),
    );
    expect(enrollments).toHaveLength(0); // no legacy auto-enroll in outbox mode

    // In legacy mode it DOES auto-enroll (historical behaviour preserved).
    mode = "legacy";
    await runWithTenant({ organizationId: "orgA" }, () =>
      drip.enrollByTrigger("lead_created", "lead@x.com"),
    );
    const after = await runWithTenant({ organizationId: "orgA" }, () =>
      drip.listEnrollments(),
    );
    expect(after).toHaveLength(1);
  });
});

// A MARKETING worker harness (marketing send observable). The marketing worker
// is marketing-only now; transactional dispatch is a separate worker.
function workerHarness(mode: MarketingDeliveryMode) {
  const now = () => 1_700_000_000_000;
  const outboxRepo = new MarketingOutboxRepository();
  const outbox = new MarketingOutboxService(outboxRepo, now);
  const limits = new MarketingLimitsService(new MarketingMeterRepository(), undefined, now);
  const pause = new MarketingPauseService(new MarketingPauseRepository());
  const counts = { marketing: 0 };
  const worker = new MarketingWorker({
    outbox: outboxRepo,
    limits,
    pause,
    mode: () => mode,
    eligibility: async () => ({ kind: "send" }),
    send: async (): Promise<MarketingSendResult> => {
      counts.marketing += 1;
      return { classification: "accepted", providerId: "m" };
    },
    now,
  });
  return { worker, outbox, counts };
}

describe("outbox worker is gated by mode (marketing only)", () => {
  it("marketing sends only in outbox mode", async () => {
    for (const mode of ["disabled", "legacy", "outbox"] as const) {
      const h = workerHarness(mode);
      await h.outbox.enqueue({
        organizationId: "orgA",
        enrollmentId: `enr-${mode}`,
        sequenceId: "seq",
        stepIndex: 0,
        email: "lead@x.com",
        subject: "s",
        body: "b",
      });
      await h.worker.runOnce("w");
      expect(h.counts.marketing).toBe(mode === "outbox" ? 1 : 0);
    }
  });
});
