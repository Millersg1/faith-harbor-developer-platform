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
import { DomainSagaRepository } from "./DomainSagaRepository";
import {
  DomainPurchaseSaga,
  SagaAuthError,
  SagaGateError,
} from "./DomainPurchaseSaga";
import { FakeDomainStripeGateway } from "./FakeDomainStripeGateway";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";

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
  const quotesRepo = new DomainQuoteRepository();
  let nowMs = 1_000_000;
  let seq = 0;
  const newId = () => `id${++seq}`;
  const now = () => new Date(nowMs).toISOString();
  const quotes = new DomainQuoteService({
    provider: registrar, quotes: quotesRepo, policy: DEFAULT_PRICING_POLICY,
    nowMs: () => nowMs, ttlMs: 15 * 60_000, newId, customerCurrency: "USD",
  });
  const contacts = new DomainContactRepository(new EnvelopeCipher(keyring), new BlindIndex(keyring));
  const termsRepo = new DomainTermsAcceptanceRepository();
  let published = 1;
  const terms = new DomainTermsService({
    repo: termsRepo, publishedTermsVersion: () => published, newId, now,
    registrarAgreementRef: "namesilo-registration-agreement",
  });
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainSagaRepository();
  const seen = new Set<string>();
  const audits: { orderId: string; from: string; to: string; kind: string }[] = [];
  const saga = new DomainPurchaseSaga({
    repo, stripe, registrar, registrations, quotes, terms, contacts, now, newId,
    successUrl: "https://x/s", cancelUrl: "https://x/c", maxFulfillAttempts: 3,
    backoffMs: 1000, audit: (e) => audits.push(e),
    beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  return {
    saga, stripe, registrar, repo, quotes, contacts, terms, registrations, audits,
    setPublished: (v: number | null) => (published = v as number),
    advance: (ms: number) => (nowMs += ms),
  };
}

/** Creates quote + terms acceptance + registrant contact for orgA; returns quoteId. */
async function prep(h: ReturnType<typeof build>, org = "orgA", opts: { acceptTerms?: boolean; setContact?: boolean } = {}) {
  return runWithTenant({ organizationId: org }, async () => {
    const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
    if (opts.acceptTerms !== false) {
      await h.terms.recordAcceptance({
        userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register",
        years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD",
        autoRenewChoice: false, premiumAcknowledged: false,
      });
    }
    if (opts.setContact !== false) {
      await h.contacts.putCurrent({
        id: "c1", registrationId: "reg1", role: "registrant", contact,
        effectiveAt: new Date().toISOString(), accuracyConfirmed: true, authorizedConfirmed: true,
      });
    }
    return customer.id;
  });
}

async function checkoutAndPay(h: ReturnType<typeof build>, quoteId: string, org = "orgA") {
  return runWithTenant({ organizationId: org }, async () => {
    const { orderId } = await h.saga.createCheckout(
      { quoteId, userId: "u1", registrationRef: "reg1" }, OWNER,
    );
    const order = (await h.repo.getOrder(orderId))!;
    const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
    return { orderId, checkoutId: order.stripeCheckoutId!, paymentIntentId };
  });
}

describe("domain purchase saga — happy path + never-register-before-capture", () => {
  it("quote -> capture(webhook) -> fulfill -> registered", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { orderId, checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.handleCheckoutCompleted({ eventId: "evt1", rawBody: "{}", signature: "sig", checkoutId, paymentIntentId });
      await h.saga.runFulfillmentOnce("w1");
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("registered");
      expect(o.paymentState).toBe("captured");
      expect(o.registrarState).toBe("registered");
      expect(await h.registrations.list()).toHaveLength(1);
    });
  });

  it("browser success WITHOUT webhook never registers", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { orderId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1"); // nothing captured/queued
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("awaiting_payment");
      expect(await h.registrations.list()).toHaveLength(0);
    });
  });
});

describe("domain purchase saga — Stripe integrity", () => {
  it("rejects a forged/invalid webhook signature", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    h.stripe.setSignatureValid(false);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "bad", checkoutId, paymentIntentId }),
      ).rejects.toBeInstanceOf(SagaGateError);
    });
  });

  it("deduplicates a replayed webhook (no double capture)", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { orderId, checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.handleCheckoutCompleted({ eventId: "same", rawBody: "{}", signature: "s", checkoutId, paymentIntentId });
      await h.saga.handleCheckoutCompleted({ eventId: "same", rawBody: "{}", signature: "s", checkoutId, paymentIntentId });
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("fulfillment_queued");
    });
  });

  it("rejects an amount mismatch (does not capture)", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { orderId, checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    h.stripe.tamperPaymentIntent(paymentIntentId, { amountMinor: 999999 });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "s", checkoutId, paymentIntentId });
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("needs_attention");
      expect(o.paymentState).not.toBe("captured");
    });
  });
});

describe("domain purchase saga — fulfillment + refund", () => {
  async function toQueued(h: ReturnType<typeof build>, quoteId: string) {
    const { orderId, checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, () =>
      h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "s", checkoutId, paymentIntentId }));
    return orderId;
  }

  it("unavailable after payment -> registration_failed -> refund (confirmed only by Stripe)", async () => {
    const h = build();
    const quoteId = await prep(h);
    const orderId = await toQueued(h, quoteId);
    // The domain becomes unavailable AFTER payment, before registrar submission.
    (h.registrar as unknown as { cfg: FakeConfig }).cfg.availability = {
      "acme.com": { available: false },
    };
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1");
      let o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("refund_queued");
      await h.saga.runRefundOnce("w1"); // creates refund -> pending
      o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("refund_pending"); // NOT "refunded" yet
      const refund = (await h.repo.getRefundByOrder(orderId))!;
      h.stripe.settleRefund(refund.stripeRefundId!, "succeeded");
      await h.saga.runRefundOnce("w1"); // confirms with Stripe
      o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("refunded");
    });
  });

  it("provider price increase before submission -> refund", async () => {
    const h = build();
    const quoteId = await prep(h);
    const orderId = await toQueued(h, quoteId);
    (h.registrar as unknown as { cfg: FakeConfig }).cfg.priceByTld!.com = 5000;
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1");
      expect((await h.repo.getOrder(orderId))!.status).toBe("refund_queued");
    });
  });

  it("provider rejection (incl. insufficient funds) -> refund with funding reason", async () => {
    const h = build({
      registerResult: {
        "acme.com": { outcome: "provider_rejection", registered: false, correlation: {}, errorCategory: "insufficient_funds" },
      },
    });
    const quoteId = await prep(h);
    const orderId = await toQueued(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1");
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("refund_queued");
      expect(o.reason).toBe("registrar_funding_required");
    });
  });

  it("pre-acceptance transport failure is retried (not refunded)", async () => {
    const h = build({
      registerResult: {
        "acme.com": { outcome: "transport_failure_pre_acceptance", registered: false, correlation: {}, errorCategory: "dns" },
      },
    });
    const quoteId = await prep(h);
    const orderId = await toQueued(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.runFulfillmentOnce("w1");
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("fulfillment_queued");
      expect(o.attempts).toBe(1);
      expect(await h.repo.getRefundByOrder(orderId)).toBeUndefined();
    });
  });
});

describe("domain purchase saga — ambiguous outcome (the safety boundary)", () => {
  async function toUnknown() {
    const h = build({
      registerResult: {
        "acme.com": { outcome: "ambiguous_unknown", registered: false, correlation: {}, errorCategory: "timeout" },
      },
    });
    const quoteId = await prep(h);
    const { orderId, checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "s", checkoutId, paymentIntentId });
      await h.saga.runFulfillmentOnce("w1");
    });
    return { h, orderId };
  }

  it("becomes registration_unknown with NO refund and NO retry", async () => {
    const { h, orderId } = await toUnknown();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      let o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("registration_unknown");
      expect(await h.repo.getRefundByOrder(orderId)).toBeUndefined();
      // A second worker pass must NOT re-register (only fulfillment_queued is claimed).
      const { processed } = await h.saga.runFulfillmentOnce("w1");
      expect(processed).toBe(0);
      o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("registration_unknown");
    });
  });

  it("reconciliation proving ownership completes WITHOUT another registrar mutation", async () => {
    const { h, orderId } = await toUnknown();
    (h.registrar as unknown as { cfg: FakeConfig }).cfg.status = {
      "acme.com": { domain: "acme.com", registered: true },
    };
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const result = await h.saga.reconcileUnknown(orderId);
      expect(result).toBe("registered");
      expect((await h.repo.getOrder(orderId))!.status).toBe("registered");
      expect(await h.registrations.list()).toHaveLength(1);
    });
  });

  it("reconciliation proving non-registration queues a refund (only then)", async () => {
    const { h, orderId } = await toUnknown();
    (h.registrar as unknown as { cfg: FakeConfig }).cfg.status = {
      "acme.com": { domain: "acme.com", registered: false },
    };
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect(await h.saga.reconcileUnknown(orderId)).toBe("refund_queued");
    });
  });

  it("owner resolve-as-registered requires evidence and never re-registers", async () => {
    const { h, orderId } = await toUnknown();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(h.saga.ownerResolveAsRegistered(orderId, "x")).rejects.toBeInstanceOf(SagaGateError);
      await h.saga.ownerResolveAsRegistered(orderId, "confirmed via NameSilo order history #12345");
      expect((await h.repo.getOrder(orderId))!.status).toBe("registered");
    });
  });
});

describe("domain purchase saga — auth, isolation, gates, audit", () => {
  it("purchase is owner-only + reauth; members/admins/unreauthed rejected", async () => {
    const h = build();
    const quoteId = await prep(h);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const args = { quoteId, userId: "u1", registrationRef: "reg1" };
      await expect(h.saga.createCheckout(args, { role: "member" })).rejects.toBeInstanceOf(SagaAuthError);
      await expect(h.saga.createCheckout(args, { role: "admin", reauthenticatedRecently: true })).rejects.toBeInstanceOf(SagaAuthError);
      await expect(h.saga.createCheckout(args, { role: "owner" })).rejects.toBeInstanceOf(SagaAuthError);
    });
  });

  it("fails closed on unpublished/unaccepted terms", async () => {
    const h = build();
    const quoteId = await prep(h, "orgA", { acceptTerms: false });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        h.saga.createCheckout({ quoteId, userId: "u1", registrationRef: "reg1" }, OWNER),
      ).rejects.toBeInstanceOf(SagaGateError);
    });
  });

  it("fails closed on a missing registrant contact", async () => {
    const h = build();
    const quoteId = await prep(h, "orgA", { setContact: false });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        h.saga.createCheckout({ quoteId, userId: "u1", registrationRef: "reg1" }, OWNER),
      ).rejects.toBeInstanceOf(SagaGateError);
    });
  });

  it("fails closed on an expired quote", async () => {
    const h = build();
    const quoteId = await prep(h);
    h.advance(16 * 60_000);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        h.saga.createCheckout({ quoteId, userId: "u1", registrationRef: "reg1" }, OWNER),
      ).rejects.toThrow();
    });
  });

  it("is cross-tenant isolated (order invisible to another tenant)", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { orderId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgB" }, async () => {
      expect(await h.repo.getOrder(orderId)).toBeUndefined();
    });
  });

  it("audit events carry only ids + enums (no PII/secrets)", async () => {
    const h = build();
    const quoteId = await prep(h);
    const { checkoutId, paymentIntentId } = await checkoutAndPay(h, quoteId);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.handleCheckoutCompleted({ eventId: "e", rawBody: "{}", signature: "s", checkoutId, paymentIntentId });
      await h.saga.runFulfillmentOnce("w1");
    });
    const blob = JSON.stringify(h.audits);
    expect(blob).not.toContain("jane@example.com");
    expect(blob).not.toContain("Jane");
    for (const e of h.audits) {
      expect(Object.keys(e).sort()).toEqual(["from", "kind", "orderId", "to"]);
    }
  });
});
