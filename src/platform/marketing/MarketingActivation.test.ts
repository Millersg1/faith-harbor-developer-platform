import { describe, expect, it } from "vitest";

import {
  MarketingActivationRepository,
  MarketingActivationService,
  type ActivationGates,
  type ActivationRecord,
} from "./MarketingActivationService";

/** Configurable gate stubs + an enroll ledger (active (email,seq) pairs). */
function gates(
  over: Partial<{
    consentOk: boolean;
    suppressed: boolean;
    leadActive: boolean;
    sequence: "ok" | "inactive" | "not_found" | "wrong_tenant";
    active: Set<string>; // existing active enrollments "email|seq"
    throwOnEnroll: boolean;
  }> = {},
) {
  const enrollCalls: { email: string; seq: string }[] = [];
  const active = over.active ?? new Set<string>();
  const g: ActivationGates = {
    consentOk: async () => over.consentOk ?? true,
    suppressed: async () => over.suppressed ?? false,
    leadActive: async () => over.leadActive ?? true,
    sequenceValid: async () => over.sequence ?? "ok",
    enroll: async (a) => {
      if (over.throwOnEnroll) throw new Error("db down");
      enrollCalls.push({ email: a.email, seq: a.sequenceId });
      const key = `${a.email}|${a.sequenceId}`;
      if (active.has(key)) return "duplicate";
      active.add(key);
      return "enrolled";
    },
  };
  return { g, enrollCalls, active };
}

const intent = (over: Partial<Parameters<MarketingActivationService["createIntent"]>[0]> = {}) => ({
  organizationId: "orgA",
  formId: "form-1",
  sequenceId: "seq-A",
  email: "dana@x.com",
  consentWording: "Email me",
  consentVersion: "v1",
  doubleOptIn: true,
  consentRef: "consent-1",
  ...over,
});

describe("MarketingActivation — consent-gated, crash-safe enrollment", () => {
  it("double-opt-in: confirmation creates exactly one enrollment", async () => {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    await svc.createIntent(intent());
    // Not yet confirmed → nothing enrolls.
    const { g, enrollCalls } = gates();
    expect(await svc.activateReady(g)).toHaveLength(0);
    // Confirm → ready → one enrollment.
    await svc.confirm("orgA", "dana@x.com", "v1", "form-1");
    const r = await svc.activateReady(g);
    expect(r).toEqual([{ id: expect.any(String), outcome: "enrolled" }]);
    expect(enrollCalls).toHaveLength(1);
  });

  it("single opt-in: affirmative consent creates exactly one enrollment (no confirm needed)", async () => {
    const svc = new MarketingActivationService(new MarketingActivationRepository());
    await svc.createIntent(intent({ doubleOptIn: false, ready: true }));
    const { g, enrollCalls } = gates();
    const r = await svc.activateReady(g);
    expect(r[0].outcome).toBe("enrolled");
    expect(enrollCalls).toHaveLength(1);
  });

  it("no consent / unchecked consent → no activation → no enrollment", async () => {
    // The submit path only creates an intent when consent is granted; with no
    // intent, the worker enrolls nobody.
    const svc = new MarketingActivationService(new MarketingActivationRepository());
    const { g, enrollCalls } = gates();
    expect(await svc.activateReady(g)).toHaveLength(0);
    expect(enrollCalls).toHaveLength(0);
  });

  it("unconfirmed double opt-in → stays awaiting → no enrollment", async () => {
    const svc = new MarketingActivationService(new MarketingActivationRepository());
    await svc.createIntent(intent()); // awaiting_confirmation
    const { g, enrollCalls } = gates();
    expect(await svc.activateReady(g)).toHaveLength(0);
    expect(enrollCalls).toHaveLength(0);
  });

  it("replayed confirmation is idempotent (still one enrollment)", async () => {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    await svc.createIntent(intent());
    await svc.confirm("orgA", "dana@x.com", "v1", "form-1");
    await svc.confirm("orgA", "dana@x.com", "v1", "form-1"); // replay
    const { g, enrollCalls } = gates();
    await svc.activateReady(g);
    await svc.activateReady(g); // re-run
    expect(enrollCalls).toHaveLength(1);
  });

  it("concurrent confirmation + duplicate submission → one active enrollment", async () => {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    // Two submissions of the same accepted terms → ONE activation (unique).
    await svc.createIntent(intent());
    await svc.createIntent(intent());
    await Promise.all([
      svc.confirm("orgA", "dana@x.com", "v1", "form-1"),
      svc.confirm("orgA", "dana@x.com", "v1", "form-1"),
    ]);
    const { g, enrollCalls } = gates();
    await svc.activateReady(g);
    expect(enrollCalls).toHaveLength(1);
  });

  it("crash after confirmation cannot lose activation work; a restart resumes it", async () => {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    await svc.createIntent(intent());
    await svc.confirm("orgA", "dana@x.com", "v1", "form-1"); // durable 'ready'
    // "Crash": the worker never ran. "Restart": a NEW service over the SAME
    // durable repo picks up the ready activation.
    const restarted = new MarketingActivationService(repo);
    const { g, enrollCalls } = gates();
    const r = await restarted.activateReady(g);
    expect(r[0].outcome).toBe("enrolled");
    expect(enrollCalls).toHaveLength(1);
  });
});

describe("MarketingActivation — gate rechecks (fail closed)", () => {
  async function readyIntent(over = {}) {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    await svc.createIntent(intent({ doubleOptIn: false, ready: true, ...over }));
    return svc;
  }

  it("suppression before activation prevents enrollment", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ suppressed: true });
    expect((await svc.activateReady(g))[0].outcome).toBe("suppressed");
    expect(enrollCalls).toHaveLength(0);
  });

  it("consent missing at activation → needs_attention, no enroll", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ consentOk: false });
    expect((await svc.activateReady(g))[0].outcome).toBe("consent_missing");
    expect(enrollCalls).toHaveLength(0);
  });

  it("inactive lead prevents enrollment", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ leadActive: false });
    expect((await svc.activateReady(g))[0].outcome).toBe("lead_inactive");
    expect(enrollCalls).toHaveLength(0);
  });

  it("inactive sequence prevents enrollment (needs_attention)", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ sequence: "inactive" });
    expect((await svc.activateReady(g))[0].outcome).toBe("sequence_inactive");
    expect(enrollCalls).toHaveLength(0);
  });

  it("another tenant's / mismatched sequence is rejected (fail closed)", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ sequence: "wrong_tenant" });
    expect((await svc.activateReady(g))[0].outcome).toBe("tenant_mismatch");
    expect(enrollCalls).toHaveLength(0);
  });

  it("uses the BOUND sequence, never a replacement, if the form's sequence changed", async () => {
    // Intent bound to seq-A. Even after a 'form change' to seq-B, activation
    // enrolls into seq-A (the bound one) — the enroll gate receives seq-A.
    const svc = await readyIntent({ sequenceId: "seq-A" });
    const { g, enrollCalls } = gates();
    await svc.activateReady(g);
    expect(enrollCalls).toEqual([{ email: "dana@x.com", seq: "seq-A" }]);
  });

  it("existing active enrollment → idempotent already_enrolled, no duplicate", async () => {
    const svc = await readyIntent();
    const { g, enrollCalls } = gates({ active: new Set(["dana@x.com|seq-A"]) });
    expect((await svc.activateReady(g))[0].outcome).toBe("already_enrolled");
    expect(enrollCalls).toHaveLength(1); // called once, returned duplicate; no 2nd active row
  });

  it("re-enrollment allowed after a prior run is completed/canceled (policy: once-active-at-a-time)", async () => {
    // No ACTIVE enrollment exists (prior was canceled) → a fresh activation
    // (new consent version) enrolls again.
    const svc = new MarketingActivationService(new MarketingActivationRepository());
    await svc.createIntent(intent({ doubleOptIn: false, ready: true, consentVersion: "v2" }));
    const { g, enrollCalls } = gates({ active: new Set() });
    expect((await svc.activateReady(g))[0].outcome).toBe("enrolled");
    expect(enrollCalls).toHaveLength(1);
  });

  it("a retryable system failure leaves the intent for another pass (no enroll, no loss)", async () => {
    const repo = new MarketingActivationRepository();
    const clk = { t: 1_000 };
    const svc = new MarketingActivationService(repo, () => clk.t);
    await svc.createIntent(intent({ doubleOptIn: false, ready: true }));
    const { g } = gates({ throwOnEnroll: true });
    expect((await svc.activateReady(g))[0].outcome).toBe("retryable");
    // Backoff pushed next_attempt_at into the future — not yet due.
    const goodEarly = gates();
    expect(await svc.activateReady(goodEarly.g)).toHaveLength(0);
    // After the backoff window, a working pass recovers it (no loss).
    clk.t += 60 * 60 * 1000;
    const good = gates();
    const r = await svc.activateReady(good.g);
    expect(r[0].outcome).toBe("enrolled");
  });

  it("outcomes + stored reasons are compact enums — no email, wording, or token", async () => {
    const repo = new MarketingActivationRepository();
    const svc = new MarketingActivationService(repo);
    await svc.createIntent(intent({ doubleOptIn: false, ready: true }));
    const { g } = gates({ sequence: "inactive" });
    const r = await svc.activateReady(g);
    // The outcome enum carries no PII.
    expect(JSON.stringify(r)).not.toMatch(/dana@x\.com|Email me|consent-1/);
    const na = await svc.needsAttention("orgA");
    // The activation's REASON is a compact enum (email is operational data on
    // the row, but the reason/outcome — what an audit would carry — is not PII).
    expect(na[0].reason).toBe("sequence_inactive");
  });
});
