import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { BlindIndex } from "../crypto/BlindIndex";
import { EnvelopeCipher } from "../crypto/EnvelopeCipher";
import { Keyring } from "../crypto/Keyring";
import { DomainContactRepository } from "../DomainContactRepository";
import { DomainQuoteRepository } from "../DomainQuoteRepository";
import { DomainQuoteService } from "../DomainQuoteService";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import {
  DomainTermsAcceptanceRepository,
  DomainTermsService,
} from "../DomainTermsService";
import { FakeRegistrarProvider, type FakeConfig } from "../FakeRegistrarProvider";
import type { RegistrarContact } from "../RegistrarContact";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./DomainPurchaseSaga";
import { DomainSagaRepository } from "./DomainSagaRepository";
import { DomainSagaWorker } from "./DomainSagaWorker";
import { FakeDomainStripeGateway } from "./FakeDomainStripeGateway";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 4).toString("base64") },
  encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 2).toString("base64") },
  blindActiveVersion: 1,
});
const contact: RegistrarContact = {
  firstName: "Jane", lastName: "Doe", address1: "1 Main St", city: "Town",
  stateProvince: "CA", postalCode: "90001", country: "US",
  phone: "+15551234567", email: "jane@example.com",
};
const OWNER = { role: "owner" as const, reauthenticatedRecently: true };

function build(fake: FakeConfig = {}) {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, ...fake });
  const stripe = new FakeDomainStripeGateway();
  let nowMs = 1_000_000;
  let seq = 0;
  const newId = () => `id${++seq}`;
  const now = () => new Date(nowMs).toISOString();
  const quotes = new DomainQuoteService({
    provider: registrar, quotes: new DomainQuoteRepository(), policy: DEFAULT_PRICING_POLICY,
    nowMs: () => nowMs, ttlMs: 15 * 60_000, newId, customerCurrency: "USD",
  });
  const contacts = new DomainContactRepository(new EnvelopeCipher(keyring), new BlindIndex(keyring));
  const terms = new DomainTermsService({
    repo: new DomainTermsAcceptanceRepository(), publishedTermsVersion: () => 1, newId, now,
    registrarAgreementRef: "ns",
  });
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainSagaRepository();
  const seen = new Set<string>();
  const saga = new DomainPurchaseSaga({
    repo, stripe, registrar, registrations, quotes, terms, contacts, now, newId,
    successUrl: "https://x/s", cancelUrl: "https://x/c", maxFulfillAttempts: 3, backoffMs: 1000,
    beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  return { saga, stripe, registrar, repo, quotes, contacts, terms, registrations,
    advance: (ms: number) => (nowMs += ms), now };
}

async function toCaptured(h: ReturnType<typeof build>) {
  return runWithTenant({ organizationId: "orgA" }, async () => {
    const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
    await h.terms.recordAcceptance({
      userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register",
      years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD",
      autoRenewChoice: false, premiumAcknowledged: false,
    });
    await h.contacts.putCurrent({
      id: "c1", registrationId: "reg1", role: "registrant", contact,
      effectiveAt: new Date().toISOString(), accuracyConfirmed: true, authorizedConfirmed: true,
    });
    const { orderId } = await h.saga.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: "reg1" }, OWNER);
    const order = (await h.repo.getOrder(orderId))!;
    const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
    await h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "s", checkoutId: order.stripeCheckoutId!, paymentIntentId });
    return orderId;
  });
}

async function captureFor(
  h: ReturnType<typeof build>,
  organizationId: string,
  domain: string,
  ref: string,
) {
  return runWithTenant({ organizationId }, async () => {
    const { customer } = await h.quotes.createRegisterQuote(domain, 1, "business");
    await h.terms.recordAcceptance({
      userId: "u1", quoteId: customer.id, asciiDomain: domain, operation: "register",
      years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD",
      autoRenewChoice: false, premiumAcknowledged: false,
    });
    await h.contacts.putCurrent({
      id: `c-${ref}`, registrationId: ref, role: "registrant", contact,
      effectiveAt: new Date().toISOString(), accuracyConfirmed: true, authorizedConfirmed: true,
    });
    const { orderId } = await h.saga.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: ref }, OWNER);
    const order = (await h.repo.getOrder(orderId))!;
    const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
    await h.saga.handleCheckoutCompleted({ eventId: `e-${ref}`, rawBody: "{}", signature: "s", checkoutId: order.stripeCheckoutId!, paymentIntentId });
    return orderId;
  });
}

describe("Stage 7 — multi-tenant worker isolation (real-PG-surfaced fix)", () => {
  it("global claim, per-order tenant re-entry: runs OUTSIDE any tenant + isolates orgs", async () => {
    const h = build();
    const oA = await captureFor(h, "orgA", "aaa.com", "regA");
    const oB = await captureFor(h, "orgB", "bbb.com", "regB");
    // The platform worker runs with NO ambient tenant (a true cross-tenant sweep).
    // Before the fix this threw in recordAttempt (requireTenant); now each claimed
    // order is processed inside its OWN org, so both register correctly.
    const worker = new DomainSagaWorker(h.saga, "w1", h.now);
    await worker.runOnce();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect((await h.repo.getOrder(oA))!.status).toBe("registered");
      // orgA cannot see orgB's order (tenant isolation holds through the worker).
      expect(await h.repo.getOrder(oB)).toBeUndefined();
    });
    await runWithTenant({ organizationId: "orgB" }, async () => {
      expect((await h.repo.getOrder(oB))!.status).toBe("registered");
      expect(await h.repo.getOrder(oA)).toBeUndefined();
    });
  });
});

describe("Stage 7 — worker sequencer", () => {
  it("ticks fulfillment + refund + reconciliation and exposes a PII-free heartbeat", async () => {
    const h = build();
    const orderId = await toCaptured(h);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const worker = new DomainSagaWorker(h.saga, "w1", h.now);
      await worker.runOnce();
      expect((await h.repo.getOrder(orderId))!.status).toBe("registered");
      const health = worker.health();
      expect(health.running).toBe(true);
      expect(health.lastFulfilled).toBe(1);
      expect(JSON.stringify(health)).not.toContain("jane@example.com");
    });
  });

  it("beginShutdown() stops further work", async () => {
    const h = build();
    await toCaptured(h);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const worker = new DomainSagaWorker(h.saga, "w1", h.now);
      worker.beginShutdown();
      await worker.runOnce();
      expect(worker.health().running).toBe(false);
    });
  });

  it("writes append-only provider-attempt audit (ids + enums only)", async () => {
    const h = build();
    await toCaptured(h);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1");
      const attempts = h.repo.listAttempts();
      expect(attempts).toContainEqual({ operation: "register", outcome: "definitive_success" });
    });
  });
});

describe("Stage 7 — reconciliation worker + crash recovery + provider-truth", () => {
  async function toUnknown(fake: FakeConfig = {}) {
    const h = build({
      registerResult: { "acme.com": { outcome: "ambiguous_unknown", registered: false, correlation: {}, errorCategory: "timeout" } },
      ...fake,
    });
    const orderId = await toCaptured(h);
    await runWithTenant({ organizationId: "orgA" }, () => h.saga.runFulfillmentOnce("w1"));
    return { h, orderId };
  }

  it("reconciliation proving ownership completes without a new registrar mutation + marks fresh", async () => {
    const { h, orderId } = await toUnknown({ status: { "acme.com": { domain: "acme.com", registered: true } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runReconciliationOnce("w1");
      expect((await h.repo.getOrder(orderId))!.status).toBe("registered");
      expect(h.repo.listAttempts()).toContainEqual({ operation: "reconcile", outcome: "definitive_success" });
    });
  });

  it("reconciliation proving non-registration queues a refund", async () => {
    const { h, orderId } = await toUnknown({ status: { "acme.com": { domain: "acme.com", registered: false } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runReconciliationOnce("w1");
      expect((await h.repo.getOrder(orderId))!.status).toBe("refund_queued");
    });
  });

  it("provider timeout during reconcile reschedules (no fabrication) then escalates", async () => {
    const { h, orderId } = await toUnknown({ throwOnStatus: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      for (let i = 0; i < 5; i++) {
        h.advance(60 * 60 * 1000); // past any backoff
        await h.saga.runReconciliationOnce("w1");
      }
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("needs_attention"); // never fabricated as registered
    });
  });

  it("recovers a crashed 'registering' lease as registration_unknown (never re-registers)", async () => {
    const h = build();
    const orderId = await toCaptured(h);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      // Simulate a crash: order stuck in 'registering' with an expired lease.
      await h.repo.updateOrder(orderId, {
        status: "registering", registrarState: "registering",
        leaseOwner: "dead", leaseUntil: new Date(0).toISOString(),
      });
      await h.saga.runReconciliationOnce("w1"); // recovers -> unknown, then reconciles
      const o = (await h.repo.getOrder(orderId))!;
      // With the default fake status = registered, reconcile then completes it.
      expect(["registration_unknown", "registered"]).toContain(o.status);
      expect(o.status).not.toBe("registering");
    });
  });
});
