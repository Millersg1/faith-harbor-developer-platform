import { describe, expect, it } from "vitest";

import {
  MarketingOutboxRepository,
  MarketingOutboxService,
  type OutboxMessage,
} from "./MarketingOutboxService";
import {
  ConfirmationDispatchRepository,
  ConfirmationDispatchService,
  type DispatchAttempt,
} from "./ConfirmationDispatchService";
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
import {
  MarketingWorker,
  type MarketingSendDecision,
  type MarketingSendResult,
  type MarketingWorkerDeps,
} from "./MarketingWorker";

function harness(opts: {
  limits?: Partial<typeof DEFAULT_MARKETING_LIMITS>;
  workerConfig?: MarketingWorkerDeps["config"];
  eligibility?: MarketingWorkerDeps["eligibility"];
  send?: MarketingWorkerDeps["send"];
  withConfirmation?: boolean;
  startMs?: number;
} = {}) {
  const clock = { ms: opts.startMs ?? 1_700_000_000_000 };
  const now = () => clock.ms;
  const outboxRepo = new MarketingOutboxRepository();
  const outbox = new MarketingOutboxService(outboxRepo, now);
  const meter = new MarketingMeterRepository();
  const limits = new MarketingLimitsService(
    meter,
    { ...DEFAULT_MARKETING_LIMITS, ...opts.limits },
    now,
  );
  const pause = new MarketingPauseService(new MarketingPauseRepository(), () =>
    new Date(clock.ms).toISOString(),
  );

  const confirmationRepo = new ConfirmationDispatchRepository();
  const confirmation = new ConfirmationDispatchService(confirmationRepo, now);
  const confSends: DispatchAttempt[] = [];

  const deps: MarketingWorkerDeps = {
    outbox: outboxRepo,
    limits,
    pause,
    eligibility: opts.eligibility ?? (async () => ({ kind: "send" } as const)),
    send:
      opts.send ??
      (async () => ({ classification: "accepted", providerId: "mid" } as const)),
    now,
    config: opts.workerConfig,
    ...(opts.withConfirmation
      ? {
          confirmation: {
            service: confirmation,
            eligibility: async () => ({ eligible: true as const }),
            send: async (): Promise<DispatchAttempt> => {
              const a: DispatchAttempt = { classification: "accepted", providerId: "c" };
              confSends.push(a);
              return a;
            },
          },
        }
      : {}),
  };
  const worker = new MarketingWorker(deps);
  return { worker, outbox, outboxRepo, limits, pause, meter, confirmation, clock, now };
}

let seq = 0;
async function enqueue(
  outbox: MarketingOutboxService,
  org: string,
  count = 1,
) {
  for (let i = 0; i < count; i += 1) {
    seq += 1;
    await outbox.enqueue({
      organizationId: org,
      enrollmentId: `enr-${org}-${seq}`,
      sequenceId: `seq-${org}`,
      stepIndex: 0,
      email: `lead${seq}@x.com`,
      subject: "s",
      body: "b",
    });
  }
}

async function sentCount(meter: MarketingMeterRepository, org: string, nowMs: number) {
  return (await meter.read(org, "hour", windowStart("hour", nowMs))).sent_count;
}
async function meterRow(meter: MarketingMeterRepository, org: string, nowMs: number) {
  return meter.read(org, "day", windowStart("day", nowMs));
}

describe("MarketingWorker — claiming & metering", () => {
  it("two workers cannot claim the same row", async () => {
    const { outboxRepo, outbox, now } = harness();
    await enqueue(outbox, "orgA", 1);
    const nowIso = new Date(now()).toISOString();
    const lease = new Date(now() + 60_000).toISOString();
    const a = await outboxRepo.claimDue("workerA", nowIso, lease, 10);
    const b = await outboxRepo.claimDue("workerB", nowIso, lease, 10);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0); // already leased by A
  });

  it("an accepted message meters exactly once (even across re-runs)", async () => {
    const { worker, outbox, meter, now } = harness();
    await enqueue(outbox, "orgA", 1);
    await worker.runOnce("w");
    await worker.runOnce("w"); // nothing left to claim
    expect(await sentCount(meter, "orgA", now())).toBe(1);
  });

  it("failed sends count attempts (not sent) and reach terminal via backoff", async () => {
    // Start at a UTC day boundary and advance ≤1h/iteration so all attempts
    // land in the SAME day-window we later read.
    const { worker, outbox, meter, clock, now } = harness({
      startMs: Date.parse("2026-08-08T00:00:00.000Z"),
      send: async () => ({ classification: "pre_acceptance_failure", reason: "connection" }),
    });
    await enqueue(outbox, "orgA", 1);
    for (let i = 0; i < 5; i += 1) {
      await worker.runOnce("w");
      clock.ms += 60 * 60 * 1000; // 1h: past the 5/10/20/40-min backoffs
    }
    const day = await meterRow(meter, "orgA", now());
    expect(day.sent_count).toBe(0); // never metered
    expect(day.attempt_count).toBe(5);
    expect(day.failure_count).toBe(5);
    // The message is terminal and no longer claimable.
    const needs = await outbox.needsAttention("orgA");
    expect(needs.some((m) => m.status === "terminal")).toBe(true);
  });
});

describe("MarketingWorker — fairness & isolation", () => {
  it("caps sends per tenant per cycle and still serves other tenants", async () => {
    const { worker, outbox, meter, now } = harness({
      workerConfig: { perTenantBatch: 3, batchLimit: 50, leaseMs: 60_000, deferMs: 60_000, confirmationLimit: 25 },
    });
    await enqueue(outbox, "orgA", 10);
    await enqueue(outbox, "orgB", 2);
    await worker.runOnce("w");
    expect(await sentCount(meter, "orgA", now())).toBe(3); // capped
    expect(await sentCount(meter, "orgB", now())).toBe(2); // fully served
  });

  it("one tenant's pause does not affect another", async () => {
    const { worker, outbox, pause, meter, now } = harness();
    await pause.pauseTenant("orgA", { actor: "owner" });
    await enqueue(outbox, "orgA", 3);
    await enqueue(outbox, "orgB", 2);
    await worker.runOnce("w");
    expect(await sentCount(meter, "orgA", now())).toBe(0); // paused → deferred
    expect(await sentCount(meter, "orgB", now())).toBe(2);
  });

  it("rate caps defer (not fail) and never meter a send", async () => {
    const { worker, outbox, meter, now } = harness({ limits: { perTenantHourly: 1 } });
    await enqueue(outbox, "orgA", 3);
    await worker.runOnce("w");
    const day = await meterRow(meter, "orgA", now());
    expect(day.sent_count).toBe(1); // only one allowed this hour
    expect(day.attempt_count).toBe(1); // deferred ones never attempted
  });
});

describe("MarketingWorker — transactional priority", () => {
  it("transactional confirmation proceeds while ALL marketing is paused", async () => {
    const { worker, outbox, confirmation, pause, meter, now } = harness({
      withConfirmation: true,
    });
    await pause.pauseTenant("orgA", { actor: "owner" });
    await enqueue(outbox, "orgA", 2);
    await confirmation.enqueue({
      organizationId: "orgA",
      activationId: "act-1",
      email: "c@x.com",
      confirmBase: "https://a.example",
    });
    const health = await worker.runOnce("w");
    expect(health.confirmation.sent).toBe(1); // transactional unaffected by pause
    expect(await sentCount(meter, "orgA", now())).toBe(0); // marketing paused
  });
});

describe("MarketingWorker — eligibility outcomes", () => {
  const skip = async (): Promise<MarketingSendDecision> => ({ kind: "skip", reason: "suppressed" });
  const needs = async (): Promise<MarketingSendDecision> => ({
    kind: "needs_attention",
    reason: "sender_missing_physical_address",
  });

  it("a final suppression after lease SKIPS the message (no send, no meter)", async () => {
    let sends = 0;
    const { worker, outbox, meter, now } = harness({
      eligibility: skip,
      send: async () => {
        sends += 1;
        return { classification: "accepted" };
      },
    });
    await enqueue(outbox, "orgA", 1);
    await worker.runOnce("w");
    expect(sends).toBe(0);
    expect(await sentCount(meter, "orgA", now())).toBe(0);
  });

  it("sender invalidated / missing physical address → needs_attention (surfaced, not sent)", async () => {
    const { worker, outbox } = harness({ eligibility: needs });
    await enqueue(outbox, "orgA", 1);
    const health = await worker.runOnce("w");
    expect(health.marketing.needsAttention).toBe(1);
    const attention = await outbox.needsAttention("orgA");
    expect(attention).toHaveLength(1);
    expect(attention[0].reason).toMatch(/needs_attention/);
  });
});

describe("MarketingWorker — delivery-unknown & crash safety", () => {
  it("uncertain acceptance → delivery_unknown, never auto-resent", async () => {
    let sends = 0;
    const { worker, outbox } = harness({
      send: async () => {
        sends += 1;
        return { classification: "uncertain", reason: "socket hang up" };
      },
    });
    await enqueue(outbox, "orgA", 1);
    await worker.runOnce("w");
    await worker.runOnce("w"); // must NOT resend
    expect(sends).toBe(1);
    const attention = await outbox.needsAttention("orgA");
    expect(attention[0].status).toBe("delivery_unknown");
  });

  it("a crashed lease is recovered to delivery_unknown, not re-sent", async () => {
    let sends = 0;
    const { worker, outbox, outboxRepo, clock, now } = harness({
      send: async () => {
        sends += 1;
        return { classification: "accepted" };
      },
    });
    await enqueue(outbox, "orgA", 1);
    // Simulate a dead worker holding a short lease.
    await outboxRepo.claimDue("dead", new Date(now()).toISOString(), new Date(now() + 1000).toISOString(), 10);
    clock.ms += 60_000;
    await worker.runOnce("live");
    expect(sends).toBe(0);
    expect((await outbox.needsAttention("orgA"))[0].status).toBe("delivery_unknown");
  });
});

describe("MarketingWorker — auto-pause (observable + min sample)", () => {
  it("does NOT auto-pause below the minimum sample", async () => {
    const { worker, outbox, pause } = harness({
      limits: { autoPauseMinSample: 20, autoPauseFailureRate: 0.5 },
      send: async () => ({ classification: "rejected", reason: "smtp_5xx" }),
    });
    await enqueue(outbox, "orgA", 3);
    await worker.runOnce("w");
    expect(await pause.isTenantPaused("orgA")).toBe(false);
  });

  it("auto-pauses MARKETING once the sample + observed failure rate cross the threshold", async () => {
    const { worker, outbox, pause } = harness({
      limits: { autoPauseMinSample: 3, autoPauseFailureRate: 0.5 },
      send: async () => ({ classification: "rejected", reason: "smtp_5xx" }),
    });
    await enqueue(outbox, "orgA", 3);
    await worker.runOnce("w");
    expect(await pause.isTenantPaused("orgA")).toBe(true);
    const [rec] = await pause.list("orgA");
    expect(rec.auto).toBe(true);
    expect(rec.reason).toBe("failure_rate");
  });
});

describe("MarketingWorker — graceful shutdown & health", () => {
  it("claims no new work during shutdown", async () => {
    const { worker, outbox, meter, now } = harness();
    await enqueue(outbox, "orgA", 2);
    worker.beginShutdown();
    const health = await worker.runOnce("w");
    expect(health.marketing.sent).toBe(0);
    expect(await sentCount(meter, "orgA", now())).toBe(0);
  });

  it("health counters carry no PII/content", async () => {
    const { worker, outbox } = harness();
    await enqueue(outbox, "orgA", 1);
    const health = await worker.runOnce("w");
    const blob = JSON.stringify(health);
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/lead|smtp|token|password/i);
  });
});
