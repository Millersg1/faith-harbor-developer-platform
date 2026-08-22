import request from "supertest";
import { describe, expect, it } from "vitest";

import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { OrganizationService } from "../tenancy/OrganizationService";
import { runWithTenant } from "../tenancy/TenantContext";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp, type PlatformAppDependencies } from "./createPlatformApp";
import { BlindIndex } from "./domains/crypto/BlindIndex";
import { EnvelopeCipher } from "./domains/crypto/EnvelopeCipher";
import { Keyring } from "./domains/crypto/Keyring";
import { DomainContactRepository } from "./domains/DomainContactRepository";
import { DomainQuoteRepository } from "./domains/DomainQuoteRepository";
import { DomainQuoteService } from "./domains/DomainQuoteService";
import { DomainRegistrationRepository } from "./domains/DomainRegistrationRepository";
import { DomainTermsAcceptanceRepository, DomainTermsService } from "./domains/DomainTermsService";
import { FakeRegistrarProvider } from "./domains/FakeRegistrarProvider";
import type { RegistrarContact } from "./domains/RegistrarContact";
import { DEFAULT_PRICING_POLICY } from "./domains/pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./domains/saga/DomainPurchaseSaga";
import { DomainSagaRepository } from "./domains/saga/DomainSagaRepository";
import { DomainWebhookHandler, type DomainWebhookChannel } from "./domains/saga/DomainWebhookHandler";
import { FakeDomainStripeGateway } from "./domains/saga/FakeDomainStripeGateway";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 4).toString("base64") }, encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 2).toString("base64") }, blindActiveVersion: 1,
});
const contact: RegistrarContact = {
  firstName: "Jane", lastName: "Doe", address1: "1 Main St", city: "Town",
  stateProvince: "CA", postalCode: "90001", country: "US", phone: "+15551234567", email: "jane@example.com",
};
const OWNER = { role: "owner" as const, reauthenticatedRecently: true };

function baseDeps(): PlatformAppDependencies {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  return {
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
  };
}

function purchaseChannel() {
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
    repo: new DomainTermsAcceptanceRepository(), publishedTermsVersion: () => 1, newId: () => `t${++seq}`, now, registrarAgreementRef: "ns",
  });
  const seen = new Set<string>();
  const saga = new DomainPurchaseSaga({
    repo, stripe, registrar, registrations: new DomainRegistrationRepository(), quotes, terms, contacts,
    now, newId: () => `id${++seq}`, successUrl: "https://x/s", cancelUrl: "https://x/c",
    beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  const channel: DomainWebhookChannel = {
    name: "purchase",
    owns: async (cid) => Boolean(await repo.getOrderByCheckoutId(cid)),
    handle: (args) => saga.handleCheckoutCompleted(args),
  };
  return { saga, stripe, repo, quotes, terms, contacts, channel };
}

describe("Stage 11 — /webhooks/stripe/domains route", () => {
  it("fails closed (400) when no domain webhook handler is configured", async () => {
    const app = createPlatformApp(baseDeps());
    const res = await request(app).post("/webhooks/stripe/domains").set("Content-Type", "application/json").send("{}");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DOMAIN_WEBHOOK_DISABLED");
  });

  it("rejects an invalid signature (400) via the raw body", async () => {
    const h = purchaseChannel();
    h.stripe.setSignatureValid(false);
    const app = createPlatformApp({ ...baseDeps(), domainWebhook: new DomainWebhookHandler(h.stripe, [h.channel]) });
    const res = await request(app)
      .post("/webhooks/stripe/domains")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "whatever")
      .send(JSON.stringify({ id: "e", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs", payment_intent: "pi" } } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SIGNATURE");
  });

  it("processes a valid completed checkout (200) and captures the order", async () => {
    const h = purchaseChannel();
    const app = createPlatformApp({ ...baseDeps(), domainWebhook: new DomainWebhookHandler(h.stripe, [h.channel]) });
    const { orderId, checkoutId, paymentIntentId } = await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await h.quotes.createRegisterQuote("acme.com", 1, "business");
      await h.terms.recordAcceptance({ userId: "u1", quoteId: customer.id, asciiDomain: "acme.com", operation: "register", years: 1, pricingVersion: 1, finalPriceMinor: customer.priceMinor, currency: "USD", autoRenewChoice: false, premiumAcknowledged: false });
      await h.contacts.putCurrent({ id: "c1", registrationId: "reg1", role: "registrant", contact, effectiveAt: "2026-08-21T00:00:00Z", accuracyConfirmed: true, authorizedConfirmed: true });
      const { orderId } = await h.saga.createCheckout({ quoteId: customer.id, userId: "u1", registrationRef: "reg1" }, OWNER);
      const order = (await h.repo.getOrder(orderId))!;
      const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
      return { orderId, checkoutId: order.stripeCheckoutId!, paymentIntentId };
    });
    const res = await request(app)
      .post("/webhooks/stripe/domains")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "valid")
      .send(JSON.stringify({ id: "evt_ok", type: "checkout.session.completed", livemode: false, data: { object: { id: checkoutId, payment_intent: paymentIntentId } } }));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect((await h.repo.getOrder(orderId))!.paymentState).toBe("captured");
    });
  });
});
