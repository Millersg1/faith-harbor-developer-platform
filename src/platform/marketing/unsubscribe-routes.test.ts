import request from "supertest";
import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../branding/BrandingRepository";
import { BrandingService } from "../branding/BrandingService";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { createPlatformApp } from "../createPlatformApp";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import {
  EmailSuppressionRepository,
  EmailSuppressionService,
  UnsubscribeService,
  UnsubscribeTokenRepository,
} from "./EmailSuppressionService";
import {
  DoubleOptInService,
  DoubleOptInTokenRepository,
} from "./DoubleOptInService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "./MarketingConsentService";
import {
  MarketingActivationRepository,
  MarketingActivationService,
} from "./MarketingActivationService";

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const suppression = new EmailSuppressionService(
    new EmailSuppressionRepository(),
  );
  const unsubscribe = new UnsubscribeService(
    new UnsubscribeTokenRepository(),
    suppression,
  );
  const doubleOptIn = new DoubleOptInService(new DoubleOptInTokenRepository());
  const marketingConsent = new MarketingConsentService(
    new MarketingConsentRepository(),
  );
  const activationRepo = new MarketingActivationRepository();
  const marketingActivations = new MarketingActivationService(activationRepo);
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    unsubscribe,
    doubleOptIn,
    marketingConsent,
    marketingActivations,
    baseDomain: "allelitecloud.com",
  });
  return {
    app,
    suppression,
    unsubscribe,
    doubleOptIn,
    marketingConsent,
    marketingActivations,
    activationRepo,
  };
}

describe("unsubscribe routes — fragment-exchange, scanner-safe, neutral", () => {
  it("GET /unsubscribe is a neutral page with anti-leak headers and no token/data", async () => {
    const { app } = build();
    const res = await request(app).get("/unsubscribe");
    expect(res.status).toBe(200);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["x-robots-tag"]).toMatch(/noindex/);
    // No lead/tenant/campaign/CRM data, and no third-party assets.
    expect(res.text).not.toMatch(/lead|campaign|sequence|organization/i);
    expect(res.text).not.toMatch(/https?:\/\/(?!allelitecloud)/); // no 3rd-party src
  });

  it("a GET (email/security scanner) does NOT unsubscribe; a POST does", async () => {
    const { app, suppression, unsubscribe } = build();
    const token = await unsubscribe.mint("orgA", "lead@x.com");
    // Scanner GET of the one-click URL — must have NO side effect.
    await request(app).get(`/api/unsubscribe/one-click/${token}`);
    expect(
      (await suppression.marketingDeliverability("orgA", "lead@x.com")).eligible,
    ).toBe(true);
    // The RFC 8058 one-click POST performs the unsubscribe.
    const post = await request(app).post(`/api/unsubscribe/one-click/${token}`);
    expect(post.status).toBe(200);
    expect(
      (await suppression.marketingDeliverability("orgA", "lead@x.com")).eligible,
    ).toBe(false);
  });

  it("POST /unsubscribe with a token suppresses tenant marketing; generic + idempotent", async () => {
    const { app, suppression, unsubscribe } = build();
    const token = await unsubscribe.mint("orgA", "dana@x.com");
    const a = await request(app).post("/unsubscribe").send({ token });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ ok: true });
    expect(
      (await suppression.marketingDeliverability("orgA", "dana@x.com")).eligible,
    ).toBe(false);
    // Repeat is safe and equally generic.
    const b = await request(app).post("/unsubscribe").send({ token });
    expect(b.body).toEqual({ ok: true });
    // A bogus token returns the SAME generic response (no enumeration).
    const c = await request(app).post("/unsubscribe").send({ token: "bogus" });
    expect(c.body).toEqual({ ok: true });
  });
});

describe("double-opt-in confirm route", () => {
  it("confirms a pending consent via a token; generic on bad token", async () => {
    const { app, doubleOptIn, marketingConsent } = build();
    // Seed a pending (double-opt-in) consent in orgA + a confirm token.
    let token = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await marketingConsent.record({
        email: "c@x.com",
        wording: "w",
        version: "v1",
        doubleOptIn: true,
      });
      token = await doubleOptIn.mint({ organizationId: "orgA", email: "c@x.com" });
      expect(await marketingConsent.hasConfirmedConsent("c@x.com")).toBe(false);
    });

    const ok = await request(app).post("/marketing/confirm").send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect(await marketingConsent.hasConfirmedConsent("c@x.com")).toBe(true);
    });

    // A bad/expired/forged token fails safely.
    const bad = await request(app)
      .post("/marketing/confirm")
      .send({ token: "forged" });
    expect(bad.body).toEqual({ ok: false });
  });

  it("GET /marketing/confirm is a neutral page with anti-leak headers", async () => {
    const { app } = build();
    const res = await request(app).get("/marketing/confirm");
    expect(res.status).toBe(200);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("confirming binds the marketing activation (awaiting→ready) for the exact terms", async () => {
    const { app, doubleOptIn, marketingConsent, marketingActivations, activationRepo } =
      build();
    let token = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const consent = await marketingConsent.record({
        email: "c@x.com",
        wording: "w",
        version: "v1",
        doubleOptIn: true,
      });
      await marketingActivations.createIntent({
        organizationId: "orgA",
        formId: null,
        sequenceId: "seq-1",
        email: "c@x.com",
        consentVersion: "v1",
        doubleOptIn: true,
        consentRef: consent.id,
      });
      token = await doubleOptIn.mint({
        organizationId: "orgA",
        email: "c@x.com",
        consentId: consent.id,
        version: "v1",
      });
    });

    const res = await request(app).post("/marketing/confirm").send({ token });
    expect(res.body).toEqual({ ok: true });

    await runWithTenant({ organizationId: "orgA" }, async () => {
      // Consent confirmed AND the activation flipped to ready (bound terms).
      expect(await marketingConsent.hasConfirmedConsent("c@x.com")).toBe(true);
      const act = await activationRepo.findByTerms("orgA", null, "c@x.com", "v1");
      expect(act?.status).toBe("ready");
      expect(act?.confirmedAt).toBeTruthy();
    });
  });
});
