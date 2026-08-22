import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider } from "../FakeRegistrarProvider";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { FakeDomainStripeGateway } from "../saga/FakeDomainStripeGateway";
import { DomainRenewalRepository } from "./DomainRenewalRepository";
import { AutoRenewNotAuthorized, DomainRenewalSaga } from "./DomainRenewalSaga";

const OWNER = { role: "owner" as const, reauthenticatedRecently: true, userId: "u1" };
const NO_REAUTH = { role: "owner" as const, reauthenticatedRecently: false, userId: "u1" };
const EXP = "2027-01-01T00:00:00Z";

function build() {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, expiresAtByDomain: { "acme.com": EXP } });
  const stripe = new FakeDomainStripeGateway();
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainRenewalRepository();
  let seq = 0;
  const saga = new DomainRenewalSaga({
    repo, stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now: () => "2026-08-22T00:00:00Z", newId: () => `id${++seq}`,
    successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent: async () => true,
  });
  return { saga, repo, stripe, registrations };
}

async function confirmReg(h: ReturnType<typeof build>) {
  await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: EXP });
}

describe("Stage 11 — auto-renew off-session authorization (SetupIntent)", () => {
  it("owner+reauth required to begin setup", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await expect(h.saga.beginAutoRenewSetup("reg1", {}, NO_REAUTH)).rejects.toThrow();
      const r = await h.saga.beginAutoRenewSetup("reg1", {}, OWNER);
      expect(r.setupIntentId).toMatch(/^seti_test_/);
      expect(r.clientSecret).toBeTruthy();
    });
  });

  it("confirm records IMMUTABLE consent (Stripe ids only, no card data) + enables", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const { setupIntentId } = await h.saga.beginAutoRenewSetup("reg1", {}, OWNER);
      h.stripe.completeSetup(setupIntentId); // customer completes in the browser
      await h.saga.confirmAutoRenewSetup("reg1", { setupIntentId, termsAcceptanceId: "t1", pricingVersionAck: 1, mandateText: "I authorize recurring domain renewals." }, OWNER);
      // Immutable consent evidence recorded.
      const consents = await h.repo.listConsents("reg1");
      expect(consents.length).toBe(1);
      expect(consents[0].stripePaymentMethodRef).toBeTruthy();
      expect(consents[0].mandateTextHash).toBeTruthy();
      // No card data anywhere in the record.
      const blob = JSON.stringify(consents[0]);
      expect(blob).not.toMatch(/\b4\d{15}\b/); // no PAN
      expect(blob.toLowerCase()).not.toContain("cvc");
      // Auto-renew now enabled with the authorized saved method.
      const auth = (await h.repo.getAutoRenew("reg1"))!;
      expect(auth.enabled).toBe(true);
      expect(auth.stripePaymentMethodRef).toBeTruthy();
    });
  });

  it("after authorization, an off-session renewal charges (fresh recheck) and queues", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const { setupIntentId } = await h.saga.beginAutoRenewSetup("reg1", {}, OWNER);
      h.stripe.completeSetup(setupIntentId);
      await h.saga.confirmAutoRenewSetup("reg1", { setupIntentId, termsAcceptanceId: "t1", pricingVersionAck: 1 }, OWNER);
      const { status } = await h.saga.createAutoRenewal("reg1");
      expect(status).toBe("renewal_queued");
    });
  });

  it("an incomplete setup (no saved method) is NOT authorized -> fallback", async () => {
    const h = build();
    h.stripe.setSetupResult("requires_payment_method");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const { setupIntentId } = await h.saga.beginAutoRenewSetup("reg1", {}, OWNER);
      h.stripe.completeSetup(setupIntentId); // stays requires_payment_method
      await expect(
        h.saga.confirmAutoRenewSetup("reg1", { setupIntentId, termsAcceptanceId: "t1", pricingVersionAck: 1 }, OWNER),
      ).rejects.toBeInstanceOf(AutoRenewNotAuthorized);
      // Not enabled; caller must use checkout / manual renewal.
      expect(await h.repo.getAutoRenew("reg1")).toBeUndefined();
    });
  });

  it("consent history is append-only (re-authorization adds a row, never overwrites)", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      for (let i = 0; i < 2; i++) {
        const { setupIntentId } = await h.saga.beginAutoRenewSetup("reg1", {}, OWNER);
        h.stripe.completeSetup(setupIntentId, `pm_test_${i}`);
        await h.saga.confirmAutoRenewSetup("reg1", { setupIntentId, termsAcceptanceId: "t1", pricingVersionAck: 1 }, OWNER);
      }
      expect((await h.repo.listConsents("reg1")).length).toBe(2);
    });
  });
});
