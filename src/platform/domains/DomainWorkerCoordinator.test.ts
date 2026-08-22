import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { BlindIndex } from "./crypto/BlindIndex";
import { EnvelopeCipher } from "./crypto/EnvelopeCipher";
import { Keyring } from "./crypto/Keyring";
import { DomainContactRepository } from "./DomainContactRepository";
import { DomainQuoteRepository } from "./DomainQuoteRepository";
import { DomainQuoteService } from "./DomainQuoteService";
import { DomainRegistrationRepository } from "./DomainRegistrationRepository";
import { DomainTermsAcceptanceRepository, DomainTermsService } from "./DomainTermsService";
import { FakeRegistrarProvider } from "./FakeRegistrarProvider";
import type { RegistrarContact } from "./RegistrarContact";
import { DEFAULT_PRICING_POLICY } from "./pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./saga/DomainPurchaseSaga";
import { DomainSagaRepository } from "./saga/DomainSagaRepository";
import { FakeDomainStripeGateway } from "./saga/FakeDomainStripeGateway";
import { DomainRenewalRepository } from "./renewal/DomainRenewalRepository";
import { DomainRenewalSaga } from "./renewal/DomainRenewalSaga";
import { DomainTransferRepository } from "./transfer/DomainTransferRepository";
import { DomainTransferSaga } from "./transfer/DomainTransferSaga";
import { DomainWorkerCoordinator } from "./DomainWorkerCoordinator";
import type { DomainRuntime } from "./domainIntegration";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 4).toString("base64") }, encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 2).toString("base64") }, blindActiveVersion: 1,
});
const contact: RegistrarContact = {
  firstName: "Jane", lastName: "Doe", address1: "1 Main St", city: "Town",
  stateProvince: "CA", postalCode: "90001", country: "US", phone: "+15551234567", email: "jane@example.com",
};
const OWNER = { role: "owner" as const, reauthenticatedRecently: true };

function build() {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, expiresAtByDomain: { "acme.com": "2027-01-01T00:00:00Z" } });
  const stripe = new FakeDomainStripeGateway();
  stripe.setSignatureValid(true);
  const cipher = new EnvelopeCipher(keyring);
  const blind = new BlindIndex(keyring);
  let seq = 0;
  const now = () => "2026-08-21T00:00:00Z";
  const newId = () => `id${++seq}`;
  const repo = new DomainSagaRepository();
  const registrations = new DomainRegistrationRepository();
  const quotes = new DomainQuoteService({
    provider: registrar, quotes: new DomainQuoteRepository(), policy: DEFAULT_PRICING_POLICY,
    nowMs: () => 1_000_000, ttlMs: 15 * 60_000, newId, customerCurrency: "USD",
  });
  const contacts = new DomainContactRepository(cipher, blind);
  const terms = new DomainTermsService({
    repo: new DomainTermsAcceptanceRepository(), publishedTermsVersion: () => 1, newId, now, registrarAgreementRef: "ns",
  });
  const seen = new Set<string>();
  const beginEvent = async (id: string) => (seen.has(id) ? false : (seen.add(id), true));
  const purchase = new DomainPurchaseSaga({
    repo, stripe, registrar, registrations, quotes, terms, contacts, now, newId,
    successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent,
  });
  const renewal = new DomainRenewalSaga({
    repo: new DomainRenewalRepository(), stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now, newId, successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent,
  });
  const transfer = new DomainTransferSaga({
    repo: new DomainTransferRepository(undefined, cipher), stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now, newId, successUrl: "https://x/s", cancelUrl: "https://x/c",
    incomingTransfersEnabled: false, publishedTransferTermsVersion: () => null, beginEvent,
  });
  const runtime: DomainRuntime = { webhookHandler: undefined as never, purchase, renewal, transfer };
  return { runtime, repo, stripe, quotes, terms, contacts, registrations, now };
}

describe("Stage 11 — domain worker coordinator (mode gating)", () => {
  it("disabled mode is a no-op with running=false", async () => {
    const h = build();
    const coord = new DomainWorkerCoordinator(h.runtime, "disabled", "w1", h.now);
    await coord.runTick();
    const health = coord.health();
    expect(health.running).toBe(false);
    expect(health.mode).toBe("disabled");
    expect(health.counts.fulfilled).toBe(0);
  });

  it("full mode fulfils a captured order", async () => {
    const h = build();
    const orderId = await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
      await h.terms.recordAcceptance({ userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register", years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD", autoRenewChoice: false, premiumAcknowledged: false });
      await h.contacts.putCurrent({ id: "c1", registrationId: "reg1", role: "registrant", contact, effectiveAt: "2026-08-21T00:00:00Z", accuracyConfirmed: true, authorizedConfirmed: true });
      const { orderId } = await h.runtime.purchase.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: "reg1" }, OWNER);
      const order = (await h.repo.getOrder(orderId))!;
      const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
      await h.runtime.purchase.handleCheckoutCompleted({ eventId: "e1", rawBody: "{}", signature: "valid", checkoutId: order.stripeCheckoutId!, paymentIntentId });
      return orderId;
    });
    const coord = new DomainWorkerCoordinator(h.runtime, "full", "w1", h.now);
    await coord.runTick();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect((await h.repo.getOrder(orderId))!.status).toBe("registered");
    });
    const health = coord.health();
    expect(health.running).toBe(true);
    expect(health.counts.fulfilled).toBe(1);
    // Health is PII-free.
    expect(JSON.stringify(health)).not.toContain("acme.com");
    expect(JSON.stringify(health)).not.toContain("jane@example.com");
  });

  it("reconcile_only mode does NOT fulfil a captured order (no mutation)", async () => {
    const h = build();
    const orderId = await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
      await h.terms.recordAcceptance({ userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register", years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD", autoRenewChoice: false, premiumAcknowledged: false });
      await h.contacts.putCurrent({ id: "c1", registrationId: "reg1", role: "registrant", contact, effectiveAt: "2026-08-21T00:00:00Z", accuracyConfirmed: true, authorizedConfirmed: true });
      const { orderId } = await h.runtime.purchase.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: "reg1" }, OWNER);
      const order = (await h.repo.getOrder(orderId))!;
      const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
      await h.runtime.purchase.handleCheckoutCompleted({ eventId: "e1", rawBody: "{}", signature: "valid", checkoutId: order.stripeCheckoutId!, paymentIntentId });
      return orderId;
    });
    const coord = new DomainWorkerCoordinator(h.runtime, "reconcile_only", "w1", h.now);
    await coord.runTick();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      // Still queued — reconcile_only never submits a registration.
      expect((await h.repo.getOrder(orderId))!.status).toBe("fulfillment_queued");
    });
    expect(coord.health().counts.fulfilled).toBe(0);
  });

  it("beginShutdown stops further work", async () => {
    const h = build();
    const coord = new DomainWorkerCoordinator(h.runtime, "full", "w1", h.now);
    coord.beginShutdown();
    await coord.runTick();
    expect(coord.health().running).toBe(false);
  });
});
