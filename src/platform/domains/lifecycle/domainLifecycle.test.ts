import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider } from "../FakeRegistrarProvider";
import { DomainNoticeRepository } from "../notices/DomainNoticeRepository";
import { classifyLifecycle, reminderNoticeFor } from "./lifecycleClassifier";
import { DomainLifecycleRepository } from "./DomainLifecycleRepository";
import { DomainLifecycleScanner } from "./DomainLifecycleScanner";

const NOW = "2026-09-01T00:00:00Z";
const nowMs = Date.parse(NOW);
const days = (n: number) => new Date(nowMs + n * 86_400_000).toISOString();

describe("Stage L2 — lifecycle classifier (provider-fact-driven; no invented deadlines)", () => {
  it("a positively-reported registry lifecycle ALWAYS wins", () => {
    expect(classifyLifecycle({ registered: true, expiresAt: days(400), lifecycleState: "redemptionPeriod" }, nowMs).state).toBe("redemption");
    expect(classifyLifecycle({ registered: true, lifecycleState: "pendingDelete" }, nowMs).state).toBe("pending_delete");
    expect(classifyLifecycle({ registered: true, lifecycleState: "graceperiod" }, nowMs).state).toBe("grace");
    expect(classifyLifecycle({ registered: true, expiresAt: days(400), lifecycleState: "redemptionPeriod" }, nowMs).confidence).toBe("provider_reported");
  });
  it("never INVENTS grace/redemption from expiry alone", () => {
    // No provider lifecycle + far expiry → active, never grace/redemption.
    expect(classifyLifecycle({ registered: true, expiresAt: days(400) }, nowMs).state).toBe("active");
    expect(classifyLifecycle({ registered: true, expiresAt: days(-10) }, nowMs).state).toBe("expired"); // NOT grace/redemption
  });
  it("derives reminder states from the provider expiry + our windows (boundaries)", () => {
    expect(classifyLifecycle({ registered: true, expiresAt: days(3) }, nowMs).state).toBe("expiration_approaching");
    expect(classifyLifecycle({ registered: true, expiresAt: days(20) }, nowMs).state).toBe("renewal_approaching");
    expect(classifyLifecycle({ registered: true, expiresAt: days(50) }, nowMs).state).toBe("upcoming_renewal");
    expect(classifyLifecycle({ registered: true, expiresAt: days(120) }, nowMs).state).toBe("active");
    expect(classifyLifecycle({ registered: true }, nowMs).state).toBe("unknown");
  });
  it("a not-registered provider fact is an action item", () => {
    expect(classifyLifecycle({ registered: false }, nowMs).state).toBe("action_required");
  });
  it("reminder mapping", () => {
    expect(reminderNoticeFor("renewal_approaching")).toBe("renewal_reminder");
    expect(reminderNoticeFor("expired")).toBe("expiration_grace_redemption_warning");
    expect(reminderNoticeFor("active")).toBeNull();
  });
});

function build(fake: Record<string, unknown> = {}) {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, expiresAtByDomain: { "acme.com": days(20) }, ...fake });
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainLifecycleRepository();
  const notices = new DomainNoticeRepository();
  let seq = 0;
  const scanner = new DomainLifecycleScanner({ repo, registrations, registrar, notices, now: () => NOW, newId: () => `id${++seq}` });
  return { scanner, repo, registrations, notices, registrar };
}

describe("Stage L2 — lifecycle scanner", () => {
  it("observes + records state and enqueues a reminder, appending history on transition", async () => {
    const h = build(); // expiry 20d out → renewal_approaching
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: days(20) });
      await h.scanner.runOnce("w1");
      const st = (await h.repo.getState("reg1"))!;
      expect(st.lifecycleState).toBe("renewal_approaching");
      expect(st.confidence).toBe("derived");
      expect(st.previousState).toBe("unknown"); // transitioned from the seed
      expect(h.repo.countEvents("reg1")).toBe(1); // append-only history
      const notices = await h.notices.listByRegistration("reg1");
      expect(notices.some((n) => n.noticeType === "renewal_reminder")).toBe(true);
    });
  });

  it("is idempotent: re-observing the same state adds no new event or duplicate reminder", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: days(20) });
      await h.scanner.runOnce("w1");
      // reset next_scan so it re-scans; same provider facts.
      await h.repo.recordObservation({ registrationId: "reg1", state: "renewal_approaching", confidence: "derived", source: "fake", reason: "x", observedAt: NOW, nextScanAt: NOW, eventId: "e" });
      await h.scanner.runOnce("w1");
      expect(h.repo.countEvents("reg1")).toBe(1); // no new transition event
      expect((await h.notices.listByRegistration("reg1")).length).toBe(1); // reminder deduped
    });
  });

  it("a provider transport failure marks STALE without overwriting the confirmed state", async () => {
    const h = build({ throwOnStatus: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: days(20) });
      // Seed a confirmed state first.
      await h.repo.ensureRows(NOW, [{ registrationId: "reg1", organizationId: "orgA" }]);
      await h.repo.recordObservation({ registrationId: "reg1", state: "renewal_approaching", confidence: "derived", source: "fake", reason: "x", observedAt: NOW, nextScanAt: NOW, eventId: "e" });
      await h.scanner.runOnce("w1"); // provider throws
      const st = (await h.repo.getState("reg1"))!;
      expect(st.confidence).toBe("stale");
      expect(st.lifecycleState).toBe("renewal_approaching"); // NOT overwritten
    });
  });

  it("surfaces a provider-reported redemption (never inventing it)", async () => {
    const h = build({ status: { "acme.com": { domain: "acme.com", registered: true, lifecycleState: "redemptionPeriod" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: days(400) });
      await h.scanner.runOnce("w1");
      const st = (await h.repo.getState("reg1"))!;
      expect(st.lifecycleState).toBe("redemption");
      expect(st.confidence).toBe("provider_reported");
    });
  });
});
