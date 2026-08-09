import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import type {
  DeliveryRequest,
  DeliveryResult,
  EmailDeliveryProvider,
} from "../email/EmailDeliveryProvider";
import { DoubleOptInService, DoubleOptInTokenRepository } from "./DoubleOptInService";
import {
  MarketingSenderRepository,
  MarketingSenderService,
} from "./MarketingSenderService";
import {
  ConfirmationDispatchRepository,
  ConfirmationDispatchService,
  buildConfirmationMessage,
  createConfirmationSend,
  type DispatchAttempt,
  type DispatchRecord,
} from "./ConfirmationDispatchService";

function svcWithClock(startMs = 1_700_000_000_000) {
  const clock = { ms: startMs };
  const repo = new ConfirmationDispatchRepository();
  const svc = new ConfirmationDispatchService(repo, () => clock.ms);
  return { svc, repo, clock };
}

async function enqueueOne(
  svc: ConfirmationDispatchService,
  over: Partial<Parameters<ConfirmationDispatchService["enqueue"]>[0]> = {},
) {
  return svc.enqueue({
    organizationId: "orgA",
    activationId: "act-1",
    email: "Lead@X.com",
    consentRef: "consent-1",
    consentVersion: "v1",
    confirmBase: "https://acme.allelitecloud.com",
    ...over,
  });
}

const alwaysEligible = async () => ({ eligible: true } as const);

describe("ConfirmationDispatchService — durable, crash-safe, honest", () => {
  it("enqueue is idempotent per activation", async () => {
    const { svc } = svcWithClock();
    expect(await enqueueOne(svc)).toBe(true);
    expect(await enqueueOne(svc)).toBe(false); // same activation → no dup
    expect(await enqueueOne(svc, { activationId: "act-2" })).toBe(true);
  });

  it("accepted → sent once, and is not re-sent on a later run", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    let calls = 0;
    const send = async (): Promise<DispatchAttempt> => {
      calls += 1;
      return { classification: "accepted", providerId: "mid-1" };
    };
    const r1 = await svc.runOnce("w", { eligibility: alwaysEligible, send });
    expect(r1.sent).toBe(1);
    const [row] = await repo.listNeedsAttention("orgA"); // none — sent isn't "needs attention"
    expect(row).toBeUndefined();
    // A second run must not claim a sent row.
    const r2 = await svc.runOnce("w", { eligibility: alwaysEligible, send });
    expect(r2.sent).toBe(0);
    expect(calls).toBe(1);
  });

  it("uncertain acceptance → delivery_unknown, NEVER auto-resent", async () => {
    const { svc, repo } = svcWithClock();
    const ok = await enqueueOne(svc);
    expect(ok).toBe(true);
    let calls = 0;
    const send = async (): Promise<DispatchAttempt> => {
      calls += 1;
      return { classification: "uncertain", reason: "socket hang up" };
    };
    const r1 = await svc.runOnce("w", { eligibility: alwaysEligible, send });
    expect(r1.unknown).toBe(1);
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs).toHaveLength(1);
    expect(needs[0].status).toBe("delivery_unknown");
    // No blind resend.
    const r2 = await svc.runOnce("w", { eligibility: alwaysEligible, send });
    expect(r2.sent + r2.failed).toBe(0);
    expect(calls).toBe(1);
  });

  it("a THROW from send is treated as ambiguous → delivery_unknown", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    const send = async (): Promise<DispatchAttempt> => {
      throw new Error("kaboom with secret@x.com in message");
    };
    const r = await svc.runOnce("w", { eligibility: alwaysEligible, send });
    expect(r.unknown).toBe(1);
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs[0].status).toBe("delivery_unknown");
  });

  it("a crashed lease (expired, still 'sending') recovers to delivery_unknown, not resent", async () => {
    const { svc, repo, clock } = svcWithClock();
    await enqueueOne(svc);
    // Simulate a worker that leased the row then died: claim it directly with a
    // short lease and never complete it.
    const nowIso = new Date(clock.ms).toISOString();
    const shortLease = new Date(clock.ms + 1000).toISOString();
    const claimed = await repo.claimDue("dead-worker", nowIso, shortLease, 10);
    expect(claimed).toHaveLength(1);
    // Time passes beyond the lease; a fresh worker runs.
    clock.ms += 60_000;
    let calls = 0;
    const send = async (): Promise<DispatchAttempt> => {
      calls += 1;
      return { classification: "accepted" };
    };
    const r = await svc.runOnce("live-worker", { eligibility: alwaysEligible, send });
    expect(r.unknown).toBe(1);
    expect(calls).toBe(0); // recovered rows are NOT re-sent
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs[0].status).toBe("delivery_unknown");
  });

  it("pre_acceptance_failure retries with backoff, then goes terminal at the cap", async () => {
    const { svc, repo, clock } = svcWithClock();
    await enqueueOne(svc);
    const send = async (): Promise<DispatchAttempt> => ({
      classification: "pre_acceptance_failure",
      reason: "connection",
    });
    // 5 attempts → terminal.
    for (let i = 0; i < 5; i += 1) {
      const r = await svc.runOnce("w", { eligibility: alwaysEligible, send });
      expect(r.failed).toBe(1);
      clock.ms += 6 * 60 * 60 * 1000; // jump past any backoff
    }
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs).toHaveLength(1);
    expect(needs[0].status).toBe("terminal");
    expect(needs[0].attempts).toBe(5);
  });

  it("rejected → terminal immediately (no retry)", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    const send = async (): Promise<DispatchAttempt> => ({
      classification: "rejected",
      reason: "smtp_5xx",
    });
    await svc.runOnce("w", { eligibility: alwaysEligible, send });
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs[0].status).toBe("terminal");
  });

  it("ineligible (e.g. suppressed) → skipped, never sent", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    let calls = 0;
    const send = async (): Promise<DispatchAttempt> => {
      calls += 1;
      return { classification: "accepted" };
    };
    const r = await svc.runOnce("w", {
      eligibility: async () => ({ eligible: false, reason: "suppressed" }),
      send,
    });
    expect(r.skipped).toBe(1);
    expect(calls).toBe(0);
    const row = await repo.get((await repo.claimDue("x", "9999", "9999", 0))[0]?.id ?? "");
    expect(row).toBeUndefined(); // skipped rows aren't claimable/needs-attention
  });

  it("a stored reason is length-bounded (no unbounded/PII-heavy blobs)", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    const huge = "x".repeat(500);
    await svc.runOnce("w", {
      eligibility: alwaysEligible,
      send: async () => ({ classification: "rejected", reason: huge }),
    });
    const needs = await repo.listNeedsAttention("orgA");
    expect(needs[0].reason!.length).toBeLessThanOrEqual(80);
  });

  it("the dispatch record stores NO raw token (only an activation reference)", async () => {
    const { svc, repo } = svcWithClock();
    await enqueueOne(svc);
    const needs = await repo.listNeedsAttention("orgA"); // queued isn't listed…
    expect(needs).toHaveLength(0);
    // Inspect the row via a claim to assert the shape carries no token field.
    const [row] = await repo.claimDue(
      "w",
      new Date(Date.now() + 10_000).toISOString(),
      new Date(Date.now() + 70_000).toISOString(),
      10,
    );
    const keys = Object.keys(row) as (keyof DispatchRecord)[];
    expect(keys).not.toContain("token" as keyof DispatchRecord);
    expect(JSON.stringify(row)).not.toMatch(/token/i);
  });
});

describe("buildConfirmationMessage — transactional, no unsubscribe", () => {
  it("has no List-Unsubscribe headers and no unsubscribe link", () => {
    const msg = buildConfirmationMessage({
      fromName: "Acme Institute",
      physicalAddress: "1 Main St",
      confirmUrl: "https://acme.allelitecloud.com/marketing/confirm#c=abc",
    });
    expect(Object.keys(msg.headers)).toHaveLength(0);
    expect(JSON.stringify(msg.headers)).not.toMatch(/list-unsubscribe/i);
    expect(msg.text).not.toMatch(/unsubscribe/i);
    // Carries the honest sender identity + the fragment confirm link.
    expect(msg.text).toContain("Acme Institute");
    expect(msg.text).toContain("1 Main St");
    expect(msg.text).toContain("#c=abc");
  });
});

describe("createConfirmationSend — token-per-attempt, fail-closed, transactional", () => {
  class CaptureProvider implements EmailDeliveryProvider {
    readonly name = "capture";
    readonly sent: DeliveryRequest[] = [];
    result: DeliveryResult = {
      classification: "accepted",
      providerId: "mid",
      responseCategory: "accepted",
      acceptedCount: 1,
      rejectedCount: 0,
    };
    async deliver(r: DeliveryRequest): Promise<DeliveryResult> {
      this.sent.push(r);
      return this.result;
    }
  }

  const row: DispatchRecord = {
    id: "d1",
    organizationId: "orgA",
    activationId: "act-1",
    email: "lead@x.com",
    consentRef: "consent-1",
    consentVersion: "v1",
    confirmBase: "https://acme.allelitecloud.com",
    status: "sending",
    attempts: 0,
    nextAttemptAt: "t",
    leaseOwner: "w",
    leaseUntil: "t",
    providerId: null,
    reason: null,
    resolvedAt: null,
    createdAt: "t",
    updatedAt: "t",
  };

  async function configureSender(sender: MarketingSenderService) {
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await sender.set(
        {
          businessName: "Acme Institute",
          replyTo: "hi@acme.com",
          physicalAddress: "1 Main St",
        },
        "owner",
      );
    });
  }

  it("mints a fresh token per attempt and sends a transactional message with no unsubscribe headers", async () => {
    const doubleOptIn = new DoubleOptInService(new DoubleOptInTokenRepository());
    const sender = new MarketingSenderService(new MarketingSenderRepository());
    await configureSender(sender);
    const provider = new CaptureProvider();
    const send = createConfirmationSend({ doubleOptIn, marketingSender: sender, emailProvider: provider });

    const a1 = await send(row);
    const a2 = await send(row);
    expect(a1.classification).toBe("accepted");
    expect(a2.classification).toBe("accepted");
    expect(provider.sent).toHaveLength(2);
    // Transactional: never metered as marketing, no unsubscribe machinery.
    for (const m of provider.sent) {
      expect(m.messageClass).toBe("transactional");
      expect(JSON.stringify(m.headers ?? {})).not.toMatch(/list-unsubscribe/i);
      expect(m.from).toMatch(/Acme Institute/);
    }
    // A FRESH token each attempt (different fragment) — nothing replayed.
    const t1 = /#c=([a-f0-9]+)/.exec(provider.sent[0].text)![1];
    const t2 = /#c=([a-f0-9]+)/.exec(provider.sent[1].text)![1];
    expect(t1).not.toBe(t2);
  });

  it("fails closed when the tenant marketing sender is not configured (no token minted, nothing sent)", async () => {
    let mints = 0;
    const doubleOptIn = {
      mint: async () => {
        mints += 1;
        return "tok";
      },
    } as unknown as DoubleOptInService;
    const sender = new MarketingSenderService(new MarketingSenderRepository()); // unconfigured
    const provider = new CaptureProvider();
    const send = createConfirmationSend({ doubleOptIn, marketingSender: sender, emailProvider: provider });
    const attempt = await send(row);
    expect(attempt.classification).toBe("pre_acceptance_failure");
    expect(provider.sent).toHaveLength(0);
    expect(mints).toBe(0); // no token minted when we can't send
  });

  it("passes through the provider's honest classification", async () => {
    const doubleOptIn = new DoubleOptInService(new DoubleOptInTokenRepository());
    const sender = new MarketingSenderService(new MarketingSenderRepository());
    await configureSender(sender);
    const provider = new CaptureProvider();
    provider.result = {
      classification: "uncertain",
      responseCategory: "ambiguous",
      acceptedCount: 0,
      rejectedCount: 0,
    };
    const send = createConfirmationSend({ doubleOptIn, marketingSender: sender, emailProvider: provider });
    expect((await send(row)).classification).toBe("uncertain");
  });
});
