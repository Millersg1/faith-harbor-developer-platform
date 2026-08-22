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
import { DomainDnsRepository } from "./domains/dns/DomainDnsRepository";
import { DomainDnsService } from "./domains/dns/DomainDnsService";
import type { DomainOpsServices } from "./domains/domainIntegration";
import { DomainQuoteRepository } from "./domains/DomainQuoteRepository";
import { DomainQuoteService } from "./domains/DomainQuoteService";
import { DomainRegistrationRepository } from "./domains/DomainRegistrationRepository";
import { DomainTermsAcceptanceRepository, DomainTermsService } from "./domains/DomainTermsService";
import { FakeRegistrarProvider } from "./domains/FakeRegistrarProvider";
import { DEFAULT_PRICING_POLICY } from "./domains/pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./domains/saga/DomainPurchaseSaga";
import { DomainSagaRepository } from "./domains/saga/DomainSagaRepository";
import { FakeDomainStripeGateway } from "./domains/saga/FakeDomainStripeGateway";
import { DomainRenewalRepository } from "./domains/renewal/DomainRenewalRepository";
import { DomainRenewalSaga } from "./domains/renewal/DomainRenewalSaga";
import { DomainTransferRepository } from "./domains/transfer/DomainTransferRepository";
import { DomainTransferSaga } from "./domains/transfer/DomainTransferSaga";
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

function domainServices(): DomainOpsServices {
  const registrar = new FakeRegistrarProvider({ priceByTld: { com: 1729 }, availability: { "acme.com": { available: true } } });
  const stripe = new FakeDomainStripeGateway();
  stripe.setSignatureValid(true);
  const cipher = new EnvelopeCipher(keyring);
  const blind = new BlindIndex(keyring);
  let seq = 0;
  const now = () => "2026-08-22T00:00:00Z";
  const newId = () => `id${++seq}`;
  const registrations = new DomainRegistrationRepository();
  const quotes = new DomainQuoteService({
    provider: registrar, quotes: new DomainQuoteRepository(), policy: DEFAULT_PRICING_POLICY,
    nowMs: () => 1_000_000, ttlMs: 15 * 60_000, newId, customerCurrency: "USD",
  });
  const contacts = new DomainContactRepository(cipher, blind);
  const terms = new DomainTermsService({ repo: new DomainTermsAcceptanceRepository(), publishedTermsVersion: () => 1, newId, now, registrarAgreementRef: "ns" });
  const dns = new DomainDnsService({
    dns: new DomainDnsRepository(), registrations, registrar, now, newId,
    alleliteNameservers: ["ns1.allelitehosting.com", "ns2.allelitehosting.com"],
    authoritativeDnsProviders: [{ provider: "namesilo", nsSuffixes: ["dnsowl.com"], recordManagement: "supported" }, { provider: "cpanel", nsSuffixes: ["allelitehosting.com"], recordManagement: "externally_managed" }],
    registrarAuthoritativeProvider: "namesilo",
  });
  const beginEvent = async () => true;
  const purchase = new DomainPurchaseSaga({ repo: new DomainSagaRepository(), stripe, registrar, registrations, quotes, terms, contacts, now, newId, successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent });
  const renewal = new DomainRenewalSaga({ repo: new DomainRenewalRepository(), stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY, now, newId, successUrl: "https://x/s", cancelUrl: "https://x/c", beginEvent });
  const transfer = new DomainTransferSaga({ repo: new DomainTransferRepository(undefined, cipher), stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY, now, newId, successUrl: "https://x/s", cancelUrl: "https://x/c", incomingTransfersEnabled: false, publishedTransferTermsVersion: () => null, beginEvent });
  return { quotes, registrations, contacts, terms, dns, purchase, renewal, transfer };
}

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const services = domainServices();
  const deps: PlatformAppDependencies = {
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    domainOps: services,
  };
  return { app: createPlatformApp(deps), users, sessions, services };
}

async function signupOwner(app: ReturnType<typeof build>["app"], email: string) {
  const res = await request(app).post("/auth/signup").send({ email, password: "Sup3rSecret!", organizationName: "Org " + email });
  return { cookie: res.headers["set-cookie"] as unknown as string[], orgId: res.body.organization.id, userId: res.body.user.id };
}

const D = "/api/platform/domains";

describe("Stage 11 — domain ops API (auth + permissions + cross-tenant)", () => {
  it("unauthenticated is 401", async () => {
    const { app } = build();
    expect((await request(app).get(D)).status).toBe(401);
  });

  it("owner can list + search", async () => {
    const { app } = build();
    const { cookie } = await signupOwner(app, "owner1@example.com");
    expect((await request(app).get(D).set("Cookie", cookie)).status).toBe(200);
    const sr = await request(app).get(`${D}/search?q=acme.com`).set("Cookie", cookie);
    expect(sr.status).toBe(200);
    expect(Array.isArray(sr.body.results)).toBe(true);
  });

  it("a member cannot perform owner/admin writes (403); can read", async () => {
    const { app, users, sessions } = build();
    const { orgId } = await signupOwner(app, "owner2@example.com");
    const memberToken = await runWithTenant({ organizationId: orgId }, async () => {
      const mem = await users.create({ email: "member@example.com", password: "Memb3rPass!", role: "member" });
      return (await sessions.createForUser(mem)).token;
    });
    // Role guard rejects owner/admin writes before any handler runs.
    const write = await request(app)
      .post(`${D}/registrations/anything/dns/apply`)
      .set("Cookie", [`aec_session=${memberToken}`])
      .send({ changes: [] });
    expect(write.status).toBe(403);
    // Read is allowed for a member.
    const read = await request(app).get(D).set("Cookie", [`aec_session=${memberToken}`]);
    expect(read.status).toBe(200);
  });

  it("owner-only sensitive action requires recent reauthentication", async () => {
    const { app } = build();
    const { cookie } = await signupOwner(app, "owner3@example.com");
    // No reauthPassword → 401 REAUTH_REQUIRED.
    const noReauth = await request(app).post(`${D}/checkout`).set("Cookie", cookie).send({ quoteId: "q", registrationRef: "r" });
    expect(noReauth.status).toBe(401);
    expect(noReauth.body.error.code).toBe("REAUTH_REQUIRED");
    // Wrong password → still 401.
    const wrong = await request(app).post(`${D}/checkout`).set("Cookie", cookie).send({ quoteId: "q", registrationRef: "r", reauthPassword: "nope" });
    expect(wrong.status).toBe(401);
    // Correct password → passes reauth (fails later on the quote gate, NOT 401 reauth).
    const right = await request(app).post(`${D}/checkout`).set("Cookie", cookie).send({ quoteId: "missing", registrationRef: "r", reauthPassword: "Sup3rSecret!" });
    expect(right.status).not.toBe(401);
    expect(right.body?.error?.code).not.toBe("REAUTH_REQUIRED");
  });

  it("a tenant cannot read another tenant's registration (404, fail closed)", async () => {
    const { app, services } = build();
    const a = await signupOwner(app, "owner-a@example.com");
    const b = await signupOwner(app, "owner-b@example.com");
    // Seed a registration under org B via the shared services instance.
    const bRegId = await runWithTenant({ organizationId: b.orgId }, async () => {
      const reg = await services.registrations.create({ id: "b-reg", asciiDomain: "b.com", unicodeDomain: "b.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z" });
      return reg.id;
    });
    // Org A cannot see it.
    const res = await request(app).get(`${D}/registrations/${bRegId}`).set("Cookie", a.cookie);
    expect(res.status).toBe(404);
    // Org B can.
    const own = await request(app).get(`${D}/registrations/${bRegId}`).set("Cookie", b.cookie);
    expect(own.status).toBe(200);
    expect(own.body.registration.asciiDomain).toBe("b.com");
  });

  it("serves the accessible domains workspace page", async () => {
    const { app } = build();
    const res = await request(app).get("/app/domains");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("html");
    expect(res.text).toContain("Domain registration");
    expect(res.text).toContain("Skip to main content");
    expect(res.text).toContain("aria-live");
  });
});
