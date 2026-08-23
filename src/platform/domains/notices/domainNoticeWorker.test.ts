import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { DomainNoticeRepository } from "./DomainNoticeRepository";
import { DomainNoticeWorker, type NoticeRecipient } from "./DomainNoticeWorker";
import { renderNoticeByType, promisesForbiddenTiming } from "./domainNoticeTemplates";
import { CapturedNoticeSink, type NoticeDeliveryResult } from "./NoticeTransport";

const NOW = "2026-09-01T00:00:00Z";

async function seedReg(registrations: DomainRegistrationRepository, id = "reg1") {
  await registrations.create({ id, asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" });
}

function build(opts: {
  outcome?: (n: number) => NoticeDeliveryResult;
  recipient?: NoticeRecipient | null;
  now?: () => string;
  maxAttempts?: number;
} = {}) {
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainNoticeRepository();
  const sink = new CapturedNoticeSink((_req, n) => (opts.outcome ? opts.outcome(n) : { classification: "accepted" }));
  let seq = 0;
  const worker = new DomainNoticeWorker({
    repo, registrations, transport: sink,
    recipient: async () => (opts.recipient === undefined ? { to: "captured:orgA", from: "no-reply@allelitecloud.com" } : opts.recipient),
    now: opts.now ?? (() => NOW), newId: () => `a${++seq}`, maxAttempts: opts.maxAttempts,
  });
  return { registrations, repo, sink, worker };
}

describe("Stage L3 — notice templates (honest, per notice_type)", () => {
  it("renders honest copy for each enqueued type and none promises timing", () => {
    for (const type of ["renewal_reminder", "expiration_grace_redemption_warning", "contact_verification_required", "auto_renew_action_required"]) {
      const r = renderNoticeByType(type, { domain: "acme.com" })!;
      expect(r.messageClass).toBe("transactional");
      expect(r.text).toContain("acme.com");
      expect(promisesForbiddenTiming(r.text)).toBe(false);
    }
  });
  it("does not invent registry deadlines in the expiration warning", () => {
    const r = renderNoticeByType("expiration_grace_redemption_warning", { domain: "acme.com" })!;
    expect(r.text).toMatch(/do not invent/i);
    expect(r.text).not.toMatch(/\b\d+\s*days?\b/); // no fabricated day counts
  });
  it("returns null (→ worker skips) for an unknown type", () => {
    expect(renderNoticeByType("totally_unknown", { domain: "x.com" })).toBeNull();
  });
});

describe("Stage L3 — notice delivery worker", () => {
  it("ACCEPTED → terminal accepted + one immutable attempt (captured, nothing re-sent)", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
      expect((await h.repo.getById("n1"))!.status).toBe("accepted");
      const at = await h.repo.listAttempts("n1");
      expect(at.length).toBe(1);
      expect(at[0]).toMatchObject({ attemptNo: 1, classification: "accepted" });
      expect(h.sink.captured.length).toBe(1); // captured, not sent
      // A second run must NOT re-claim a terminal notice (no second attempt).
      await h.worker.runOnce("w1");
      expect((await h.repo.listAttempts("n1")).length).toBe(1);
    });
  });

  it("REJECTED → terminal rejected, no retry", async () => {
    const h = build({ outcome: () => ({ classification: "rejected", reason: "hard_bounce" }) });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
      expect((await h.repo.getById("n1"))!.status).toBe("rejected");
      await h.worker.runOnce("w1");
      expect((await h.repo.listAttempts("n1")).length).toBe(1);
    });
  });

  it("UNCERTAIN acceptance → delivery_unknown HOLD, never blindly resent", async () => {
    const h = build({ outcome: () => ({ classification: "uncertain", reason: "connection_dropped_after_data" }) });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
      expect((await h.repo.getById("n1"))!.status).toBe("delivery_unknown");
      // Not re-claimed → no resend.
      await h.worker.runOnce("w1");
      expect(h.sink.captured.length).toBe(1);
      expect((await h.repo.listAttempts("n1")).length).toBe(1);
    });
  });

  it("PRE-ACCEPTANCE failure retries with backoff, then goes terminal at the bound", async () => {
    let t = Date.parse(NOW);
    const clock = () => new Date(t).toISOString();
    const h = build({ outcome: () => ({ classification: "pre_acceptance_failure", reason: "timeout" }), now: clock, maxAttempts: 3 });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: clock() });
      await h.worker.runOnce("w1");
      let row = (await h.repo.getById("n1"))!;
      expect(row.status).toBe("pre_acceptance_failure");
      expect(row.nextAttemptAt).toBeTruthy();
      // Before backoff elapses it is NOT due.
      expect((await h.worker.runOnce("w1")).processed).toBe(0);
      // Advance past backoff → attempt 2 (still failing).
      t = Date.parse(row.nextAttemptAt!) + 1000;
      await h.worker.runOnce("w1");
      row = (await h.repo.getById("n1"))!;
      expect(row.status).toBe("pre_acceptance_failure");
      // Advance again → attempt 3 hits the bound → terminal.
      t = Date.parse(row.nextAttemptAt!) + 1000;
      await h.worker.runOnce("w1");
      row = (await h.repo.getById("n1"))!;
      expect(row.status).toBe("terminal");
      const attempts = await h.repo.listAttempts("n1");
      expect(attempts.length).toBe(3);
      expect(attempts.every((a) => a.classification === "pre_acceptance_failure")).toBe(true);
    });
  });

  it("no recipient (delivery not configured) → RE-QUEUED (kept alive), never terminally skipped", async () => {
    const h = build({ recipient: null });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
      const row = (await h.repo.getById("n1"))!;
      expect(row.status).toBe("queued"); // alive, not skipped
      expect(row.attempts).toBe(0); // config defer is not a delivery attempt
      expect((await h.repo.listAttempts("n1")).length).toBe(0);
      expect(h.sink.captured.length).toBe(0); // nothing handed to transport
    });
  });

  it("unknown notice_type → SKIPPED (terminal)", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "some_future_type", now: NOW });
      await h.worker.runOnce("w1");
      const row = (await h.repo.getById("n1"))!;
      expect(row.status).toBe("skipped");
      expect((await h.repo.listAttempts("n1"))[0].classification).toBe("skipped");
    });
  });

  it("missing/absent registration → SKIPPED (terminal), nothing sent", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.repo.enqueue({ id: "n1", registrationId: "ghost", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
      expect((await h.repo.getById("n1"))!.status).toBe("skipped");
      expect(h.sink.captured.length).toBe(0);
    });
  });

  it("PII-free health counters reflect the outcomes", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seedReg(h.registrations);
      await h.repo.enqueue({ id: "n1", registrationId: "reg1", noticeType: "renewal_reminder", now: NOW });
      await h.worker.runOnce("w1");
    });
    const hp = h.worker.health();
    expect(hp.lastClaimed).toBe(1);
    expect(hp.lastAccepted).toBe(1);
    expect(JSON.stringify(hp)).not.toContain("acme.com");
  });
});
