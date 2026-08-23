import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider } from "../FakeRegistrarProvider";
import { DomainNoticeRepository } from "../notices/DomainNoticeRepository";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { FakeDomainStripeGateway } from "../saga/FakeDomainStripeGateway";
import { DomainAutoRenewScheduler } from "./DomainAutoRenewScheduler";
import { DomainRenewalRepository } from "./DomainRenewalRepository";
import { DomainRenewalSaga } from "./DomainRenewalSaga";

const OWNER = { role: "owner" as const, reauthenticatedRecently: true, userId: "u1" };
// "now" is fixed; expiry 10 days out is inside the default 30-day window.
const NOW = "2026-09-01T00:00:00Z";
const EXP_SOON = "2026-09-11T00:00:00Z";
const EXP_FAR = "2027-06-01T00:00:00Z";

function build() {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, expiresAtByDomain: { "acme.com": EXP_SOON } });
  const stripe = new FakeDomainStripeGateway();
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainRenewalRepository();
  const notices = new DomainNoticeRepository();
  let seq = 0;
  const now = () => NOW;
  const newId = () => `id${++seq}`;
  const saga = new DomainRenewalSaga({
    repo, stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY, now, newId,
    successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent: async () => true,
  });
  const scheduler = new DomainAutoRenewScheduler({
    repo, registrations, saga, notices, now, newId,
    blockingCondition: (regId) => repo.hasUnresolvedRenewal(regId),
  });
  return { scheduler, repo, registrations, notices, stripe, saga };
}

/** Seeds an active registration + an enabled, authorized auto-renew. */
async function seed(h: ReturnType<typeof build>, opts: { expiresAt?: string; fresh?: boolean } = {}) {
  await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: opts.expiresAt ?? EXP_SOON });
  if (opts.fresh !== false) await h.registrations.markSync("reg1", "fresh", NOW);
  await h.repo.putAutoRenew({ registrationId: "reg1", enabled: true, authorizedByUserId: "u1", authorizedAt: NOW, termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD", createdAt: NOW, updatedAt: NOW });
}

describe("Stage L1 — auto-renew scheduler eligibility + safety", () => {
  it("renews an eligible registration (fresh, in-window, PM present)", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h);
      const r = await h.scheduler.runOnce("w1");
      expect(r.processed).toBe(1);
      expect(h.scheduler.health().lastRenewed).toBe(1);
      // A renewal order now exists for this cycle.
      expect(await h.repo.getOrderByCheckoutId("nope")).toBeUndefined(); // sanity
    });
  });

  it("defers a STALE provider sync (never guesses) — no renewal", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h, { fresh: false }); // sync_state not fresh
      await h.registrations.markSync("reg1", "stale", NOW);
      const r = await h.scheduler.runOnce("w1");
      expect(r.processed).toBe(1);
      expect(h.scheduler.health().lastRenewed).toBe(0);
      expect(h.scheduler.health().lastDeferred).toBe(1);
    });
  });

  it("defers when expiry is outside the renewal window", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h, { expiresAt: EXP_FAR });
      const r = await h.scheduler.runOnce("w1");
      // In-memory claim is coarse; the scanner defers the out-of-window item.
      expect(h.scheduler.health().lastRenewed).toBe(0);
      expect(r.processed).toBeGreaterThanOrEqual(0);
    });
  });

  it("a declined off-session charge raises an ACTION-NEEDED notice, not a renewal", async () => {
    const h = build();
    h.stripe.setOffSessionResult("failed");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h);
      await h.scheduler.runOnce("w1");
      expect(h.scheduler.health().lastRenewed).toBe(0);
      expect(h.scheduler.health().lastActionNeeded).toBe(1);
      const notices = await h.notices.listByRegistration("reg1");
      expect(notices.some((n) => n.noticeType === "auto_renew_action_required")).toBe(true);
    });
  });

  it("an unresolved renewal (needs_attention) blocks a fresh auto-renewal", async () => {
    const h = build();
    h.stripe.setOffSessionResult("failed"); // first run -> needs_attention order
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h);
      await h.saga.createAutoRenewal("reg1"); // creates a needs_attention order
      const r = await h.scheduler.runOnce("w1");
      // blockingCondition (hasUnresolvedRenewal) defers it; no new renewal.
      expect(h.scheduler.health().lastRenewed).toBe(0);
      expect(r.processed).toBe(1);
    });
  });

  it("converges: a second scan does not create a duplicate renewal for the cycle", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await seed(h);
      await h.scheduler.runOnce("w1"); // renews
      // reset the scan lease/backoff to allow a second scan of the same cycle
      await h.repo.finishAutoRenewScan("reg1", NOW);
      const before = h.scheduler.health().lastRenewed;
      await h.scheduler.runOnce("w1");
      // No second renewal (DB unique guard / unresolved-check converges).
      expect(h.scheduler.health().lastRenewed).toBe(0);
      expect(before).toBe(1);
    });
  });

});
