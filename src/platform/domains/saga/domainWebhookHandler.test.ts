import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { BlindIndex } from "../crypto/BlindIndex";
import { EnvelopeCipher } from "../crypto/EnvelopeCipher";
import { Keyring } from "../crypto/Keyring";
import { DomainContactRepository } from "../DomainContactRepository";
import { DomainQuoteRepository } from "../DomainQuoteRepository";
import { DomainQuoteService } from "../DomainQuoteService";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { DomainTermsAcceptanceRepository, DomainTermsService } from "../DomainTermsService";
import { FakeRegistrarProvider } from "../FakeRegistrarProvider";
import type { RegistrarContact } from "../RegistrarContact";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./DomainPurchaseSaga";
import { DomainSagaRepository } from "./DomainSagaRepository";
import { DomainWebhookHandler, type DomainWebhookChannel } from "./DomainWebhookHandler";
import { FakeDomainStripeGateway } from "./FakeDomainStripeGateway";
import { HttpDomainStripeGateway } from "./DomainStripeGateway";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 4).toString("base64") }, encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 2).toString("base64") }, blindActiveVersion: 1,
});
const contact: RegistrarContact = {
  firstName: "Jane", lastName: "Doe", address1: "1 Main St", city: "Town",
  stateProvince: "CA", postalCode: "90001", country: "US", phone: "+15551234567", email: "jane@example.com",
};
const OWNER = { role: "owner" as const, reauthenticatedRecently: true };

function purchaseHarness() {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 } });
  const stripe = new FakeDomainStripeGateway();
  stripe.setSignatureValid(true);
  let seq = 0;
  const now = () => "2026-08-21T00:00:00Z";
  const repo = new DomainSagaRepository();
  const quotes = new DomainQuoteService({
    provider: registrar, quotes: new DomainQuoteRepository(), policy: DEFAULT_PRICING_POLICY,
    nowMs: () => 1_000_000, ttlMs: 15 * 60_000, newId: () => `q${++seq}`, customerCurrency: "USD",
  });
  const contacts = new DomainContactRepository(new EnvelopeCipher(keyring), new BlindIndex(keyring));
  const terms = new DomainTermsService({
    repo: new DomainTermsAcceptanceRepository(), publishedTermsVersion: () => 1, newId: () => `t${++seq}`, now,
    registrarAgreementRef: "ns",
  });
  const registrations = new DomainRegistrationRepository();
  const seen = new Set<string>();
  const saga = new DomainPurchaseSaga({
    repo, stripe, registrar, registrations, quotes, terms, contacts, now, newId: () => `id${++seq}`,
    successUrl: "https://x/s", cancelUrl: "https://x/c",
    beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  const channel: DomainWebhookChannel = {
    name: "purchase",
    owns: async (cid) => Boolean(await repo.getOrderByCheckoutId(cid)),
    handle: (args) => saga.handleCheckoutCompleted(args),
  };
  return { saga, stripe, repo, quotes, terms, contacts, channel };
}

/** Drives a purchase to the awaiting-payment state and returns webhook inputs. */
async function makeCheckout(h: ReturnType<typeof purchaseHarness>) {
  return runWithTenant({ organizationId: "orgA" }, async () => {
    const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
    await h.terms.recordAcceptance({
      userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register", years: 1,
      pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD", autoRenewChoice: false, premiumAcknowledged: false,
    });
    await h.contacts.putCurrent({ id: "c1", registrationId: "reg1", role: "registrant", contact, effectiveAt: "2026-08-21T00:00:00Z", accuracyConfirmed: true, authorizedConfirmed: true });
    const { orderId } = await h.saga.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: "reg1" }, OWNER);
    const order = (await h.repo.getOrder(orderId))!;
    const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
    return { orderId, checkoutId: order.stripeCheckoutId!, paymentIntentId };
  });
}

function event(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_1", type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_x", payment_intent: "pi_x" } }, ...over,
  });
}

describe("Stage 11 — domain webhook signature semantics (real HMAC)", () => {
  const secret = "whsec_test_123";
  const gw = new HttpDomainStripeGateway({ secretKey: "sk_test_x", webhookSecret: secret });
  const handler = new DomainWebhookHandler(gw, []);
  const sign = (raw: string, ts: number) => `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;
  const nowTs = Math.floor(Date.parse("2026-08-21T00:00:00Z") / 1000);

  it("rejects a missing signature", async () => {
    const r = await handler.handle(event({ livemode: true }), undefined);
    expect(r.status).toBe(400);
    expect(r.outcome).toBe("rejected_signature");
  });
  it("rejects a tampered body (signature no longer matches)", async () => {
    const raw = event();
    const sig = sign(raw, Math.floor(Date.now() / 1000));
    const tampered = raw.replace("pi_x", "pi_ATTACKER");
    const r = await handler.handle(tampered, sig);
    expect(r.outcome).toBe("rejected_signature");
  });
  it("rejects a stale timestamp (>5 min)", async () => {
    const raw = event();
    const r = await handler.handle(raw, sign(raw, nowTs - 10_000));
    expect(r.outcome).toBe("rejected_signature");
  });
  it("a validly-signed LIVE event is rejected (test endpoint)", async () => {
    const raw = event({ livemode: true });
    const r = await handler.handle(raw, sign(raw, Math.floor(Date.now() / 1000)));
    expect(r.status).toBe(400);
    expect(r.outcome).toBe("rejected_livemode");
  });
});

describe("Stage 11 — domain webhook routing / dedup / idempotency", () => {
  it("routes a valid completed checkout to the owning saga and captures once", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel]);
    const { orderId, checkoutId, paymentIntentId } = await makeCheckout(h);
    const raw = event({ id: "evt_A", data: { object: { id: checkoutId, payment_intent: paymentIntentId } } });
    const r1 = await handler.handle(raw, "valid");
    expect(r1.outcome).toBe("processed");
    expect(r1.channel).toBe("purchase");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect((await h.repo.getOrder(orderId))!.paymentState).toBe("captured");
    });
    // Replay the SAME event id → deduped, still captured exactly once.
    const r2 = await handler.handle(raw, "valid");
    expect(r2.status).toBe(200);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.paymentState).toBe("captured"); // no double-capture
    });
  });

  it("a wrong-amount PaymentIntent is NOT captured (flagged needs_attention)", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel]);
    const { orderId, checkoutId, paymentIntentId } = await makeCheckout(h);
    h.stripe.tamperPaymentIntent(paymentIntentId, { amountMinor: 999_999 }); // attacker/wrong amount
    const raw = event({ id: "evt_B", data: { object: { id: checkoutId, payment_intent: paymentIntentId } } });
    const r = await handler.handle(raw, "valid");
    expect(r.status).toBe(200); // acked
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.paymentState).not.toBe("captured");
      expect(o.status).toBe("needs_attention");
    });
  });

  it("unknown checkout id is a safe ack, nothing acted on", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel]);
    const r = await handler.handle(event({ data: { object: { id: "cs_nope", payment_intent: "pi_nope" } } }), "valid");
    expect(r.status).toBe(200);
    expect(r.outcome).toBe("ignored_unknown_checkout");
  });

  it("an unhandled event type is a safe ack", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel]);
    const r = await handler.handle(event({ type: "payment_intent.created" }), "valid");
    expect(r.outcome).toBe("ignored_unhandled_type");
  });

  it("malformed JSON is rejected", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel]);
    const r = await handler.handle("{not json", "valid");
    expect(r.status).toBe(400);
    expect(r.outcome).toBe("rejected_malformed");
  });

  it("an oversized body is rejected before parsing", async () => {
    const h = purchaseHarness();
    const handler = new DomainWebhookHandler(h.stripe, [h.channel], { maxBodyBytes: 100 });
    const r = await handler.handle(event({ id: "x".repeat(500) }), "valid");
    expect(r.status).toBe(413);
    expect(r.outcome).toBe("rejected_too_large");
  });

  it("a channel processing error still acks 200 (crash recovery convergence)", async () => {
    const h = purchaseHarness();
    const throwingChannel: DomainWebhookChannel = {
      name: "purchase", owns: async () => true, handle: async () => { throw new Error("boom"); },
    };
    const handler = new DomainWebhookHandler(h.stripe, [throwingChannel]);
    const r = await handler.handle(event(), "valid");
    expect(r.status).toBe(200);
    expect(r.outcome).toBe("processing_error");
  });
});
