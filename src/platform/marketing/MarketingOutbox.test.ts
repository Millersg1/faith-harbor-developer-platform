import { describe, expect, it } from "vitest";

import {
  MarketingOutboxRepository,
  MarketingOutboxService,
  type Eligibility,
  type OutboxMessage,
  type SendAttempt,
} from "./MarketingOutboxService";

const OWNER = "worker-1";
const eligibleAlways = async (): Promise<Eligibility> => ({ eligible: true });
const acceptAlways = async (): Promise<SendAttempt> => ({
  outcome: "accepted",
  providerId: "prov-1",
});

function enqueueInput(over: Partial<Parameters<MarketingOutboxService["enqueue"]>[0]> = {}) {
  return {
    organizationId: "orgA",
    enrollmentId: "enr-1",
    sequenceId: "seq-1",
    stepIndex: 0,
    email: "x@x.com",
    subject: "Hi",
    body: "Body",
    ...over,
  };
}

describe("MarketingOutbox — idempotent enqueue + honest send", () => {
  it("enqueue is idempotent per (enrollment, step)", async () => {
    const svc = new MarketingOutboxService(new MarketingOutboxRepository());
    expect(await svc.enqueue(enqueueInput())).toBe(true);
    expect(await svc.enqueue(enqueueInput())).toBe(false); // duplicate → no row
  });

  it("sends an eligible message once → sent (metered once), no re-send", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    let sends = 0;
    const send = async (): Promise<SendAttempt> => {
      sends += 1;
      return { outcome: "accepted", providerId: "p" };
    };
    const r1 = await svc.runOnce(OWNER, { eligibility: eligibleAlways, send });
    expect(r1).toEqual({ sent: 1, skipped: 0, failed: 0 });
    // A second pass must NOT re-send a 'sent' message (exactly-once metering).
    clock += 10_000;
    const r2 = await svc.runOnce(OWNER, { eligibility: eligibleAlways, send });
    expect(r2.sent).toBe(0);
    expect(sends).toBe(1);
  });

  it("skips (not metered) when eligibility fails at send time — e.g. a concurrent unsubscribe", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    let sends = 0;
    const r = await svc.runOnce(OWNER, {
      // The recipient unsubscribed after enqueue → ineligible at send time.
      eligibility: async () => ({ eligible: false, reason: "unsubscribed" }),
      send: async () => {
        sends += 1;
        return { outcome: "accepted" };
      },
    });
    expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sends).toBe(0); // never handed to transport
  });
});

describe("MarketingOutbox — retries, backoff, terminal", () => {
  it("a retryable failure re-queues with backoff, then goes terminal after the limit", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    const failing = async (): Promise<SendAttempt> => ({
      outcome: "failed",
      reason: "smtp_500",
    });
    let id = "";
    for (let i = 0; i < 5; i++) {
      const before = await repo.claimDue("peek", new Date(clock).toISOString(), new Date(clock).toISOString(), 0);
      void before;
      await svc.runOnce(OWNER, { eligibility: eligibleAlways, send: failing });
      clock += 60 * 60 * 1000; // jump past any backoff
    }
    // After MAX_ATTEMPTS the message is terminal and needs attention.
    const attention = await svc.needsAttention("orgA");
    expect(attention.some((m) => m.status === "terminal")).toBe(true);
    id = attention[0].id;
    expect(id).toBeTruthy();
  });
});

describe("MarketingOutbox — crash windows & lease recovery", () => {
  it("a crash while 'sending' (expired lease) becomes delivery_unknown, not a blind resend", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    // Simulate a worker that leases the message then CRASHES mid-send (never
    // marks it): claim it directly and don't update.
    const leaseUntil = new Date(clock + 60_000).toISOString();
    const claimed = await repo.claimDue(
      "dead-worker",
      new Date(clock).toISOString(),
      leaseUntil,
      10,
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe("sending");

    // Time passes beyond the lease; a new worker runs.
    clock += 120_000;
    let sends = 0;
    const r = await svc.runOnce(OWNER, {
      eligibility: eligibleAlways,
      send: async () => {
        sends += 1;
        return { outcome: "accepted" };
      },
    });
    // The ambiguous message is NOT resent; it's surfaced for review.
    expect(sends).toBe(0);
    expect(r.sent).toBe(0);
    const attention = await svc.needsAttention("orgA");
    expect(attention).toHaveLength(1);
    expect(attention[0].status).toBe("delivery_unknown");
  });

  it("a successful send survives 'restart' — never re-sent", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    await svc.runOnce(OWNER, { eligibility: eligibleAlways, send: acceptAlways });
    // "Restart": a brand-new service over the SAME repo (durable state).
    const svc2 = new MarketingOutboxService(repo, () => (clock += 300_000));
    let sends = 0;
    await svc2.runOnce(OWNER, {
      eligibility: eligibleAlways,
      send: async () => {
        sends += 1;
        return { outcome: "accepted" };
      },
    });
    expect(sends).toBe(0);
  });
});

describe("MarketingOutbox — pause / cancel", () => {
  it("cancelForEnrollment stops queued messages (durable), not-sent", async () => {
    const repo = new MarketingOutboxRepository();
    let clock = 1_000;
    const svc = new MarketingOutboxService(repo, () => clock);
    await svc.enqueue(enqueueInput());
    await svc.cancelForEnrollment("enr-1");
    let sends = 0;
    const r = await svc.runOnce(OWNER, {
      eligibility: eligibleAlways,
      send: async () => {
        sends += 1;
        return { outcome: "accepted" };
      },
    });
    expect(r.sent).toBe(0);
    expect(sends).toBe(0);
  });
});
