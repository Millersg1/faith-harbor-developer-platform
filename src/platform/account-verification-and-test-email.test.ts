import request from "supertest";
import { describe, expect, it } from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import {
  EmailVerificationService,
  EmailVerificationTokenRepository,
} from "./auth/EmailVerificationService";
import { PlatformUserVerificationStore } from "./auth/PlatformUserVerificationStore";
import {
  MarketingSenderRepository,
  MarketingSenderService,
} from "./marketing/MarketingSenderService";
import type {
  DeliveryRequest,
  DeliveryResult,
  EmailDeliveryProvider,
} from "./email/EmailDeliveryProvider";

/** Records every message and returns a configurable classification. */
class FakeProvider implements EmailDeliveryProvider {
  readonly name = "fake";
  readonly sent: DeliveryRequest[] = [];
  result: DeliveryResult = {
    classification: "accepted",
    messageId: "mid",
    providerId: "mid",
    responseCategory: "accepted",
    acceptedCount: 1,
    rejectedCount: 0,
  };
  throwOnce = false;
  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    this.sent.push(req);
    if (this.throwOnce) {
      this.throwOnce = false;
      throw new Error("transport blew up");
    }
    return this.result;
  }
}

const CONFIGURED_SENDER = "All Elite Cloud <verify@allelitecloud.com>";

function build(opts: { transactionalSender?: { from: string } | null } = {}) {
  const organizations = new OrganizationService();
  const userRepo = new PlatformUserRepository();
  const users = new PlatformUserService(userRepo);
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const emailProvider = new FakeProvider();
  // The verification store shares the SAME user repo the app authenticates
  // against, so verification state is consistent with the signed-in user.
  const emailVerification = new EmailVerificationService(
    new PlatformUserVerificationStore(userRepo),
    new EmailVerificationTokenRepository(),
  );
  const marketingSender = new MarketingSenderService(
    new MarketingSenderRepository(),
  );
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
    emailVerification,
    marketingSender,
    emailProvider,
    transactionalSender:
      opts.transactionalSender === null
        ? undefined
        : opts.transactionalSender ?? { from: CONFIGURED_SENDER },
    baseDomain: "allelitecloud.com",
  });
  return {
    app,
    users,
    sessions,
    emailVerification,
    marketingSender,
    emailProvider,
  };
}

async function signupOwner(app: ReturnType<typeof build>["app"]) {
  const res = await request(app).post("/auth/signup").send({
    organizationName: "Acme",
    email: "owner@acme.com",
    password: "password123",
  });
  return {
    cookie: res.headers["set-cookie"] as unknown as string[],
    orgId: res.body.organization.id as string,
    ownerId: res.body.user.id as string,
  };
}

/** Drive the real flow: request → capture link token → confirm. */
async function verifyOwner(
  app: ReturnType<typeof build>["app"],
  provider: FakeProvider,
  cookie: string[],
): Promise<void> {
  provider.sent.length = 0;
  await request(app)
    .post("/api/platform/account/request-verification")
    .set("Cookie", cookie)
    .send({});
  const link = provider.sent[0].text;
  const token = /#v=([A-Za-z0-9]+)/.exec(link)![1];
  const res = await request(app).post("/verify-email").send({ token });
  expect(res.body).toEqual({ ok: true });
}

const hasUnsub = (req: DeliveryRequest): boolean =>
  Object.keys(req.headers ?? {}).some((h) => /list-unsubscribe/i.test(h));

describe("account-email verification route", () => {
  it("requires authentication", async () => {
    const { app } = build();
    const res = await request(app).post(
      "/api/platform/account/request-verification",
    );
    expect(res.status).toBe(401);
  });

  it("sends a PLATFORM transactional message to the account's OWN email, generic reply", async () => {
    const { app, emailProvider } = build();
    const owner = await signupOwner(app);
    const res = await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true }); // generic — no token/email leaked

    expect(emailProvider.sent).toHaveLength(1);
    const msg = emailProvider.sent[0];
    // Server-selected recipient = the signed-in account email.
    expect(msg.to).toBe("owner@acme.com");
    // The CONFIGURED transactional sender is used verbatim — never an invented
    // `no-reply@…` address.
    expect(msg.from).toBe(CONFIGURED_SENDER);
    expect(msg.from).not.toMatch(/no-reply@/);
    // Message-ID domain follows the configured sender's own domain.
    expect(msg.sendingDomain).toBe("allelitecloud.com");
    // The link lives on the trusted platform host and carries the fragment token.
    expect(msg.text).toMatch(
      /https?:\/\/allelitecloud\.com\/verify-email#v=[A-Za-z0-9]+/,
    );
    // Transactional — never metered as marketing, no unsubscribe machinery.
    expect(msg.messageClass).toBe("transactional");
    expect(hasUnsub(msg)).toBe(false);
  });

  it("rejects a recipient/redirect override with a strict schema (400, nothing sent)", async () => {
    const { app, emailProvider } = build();
    const owner = await signupOwner(app);
    const res = await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({ email: "attacker@evil.com", redirect: "https://evil.com" });
    expect(res.status).toBe(400);
    expect(emailProvider.sent).toHaveLength(0);
  });

  it("returns a generic OK even when the transport fails (no auto-resend, no leak)", async () => {
    const { app, emailProvider } = build();
    const owner = await signupOwner(app);
    emailProvider.throwOnce = true;
    const res = await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Exactly ONE attempt — an uncertain/failed send is not auto-retried here.
    expect(emailProvider.sent).toHaveLength(1);
  });

  it("fails closed when no transactional sender is configured (nothing sent, still generic)", async () => {
    const { app, emailProvider } = build({ transactionalSender: null });
    const owner = await signupOwner(app);
    const res = await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({});
    // Generic reply either way — no leak that sending was skipped.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // No invented `no-reply@…` substitute — simply nothing sent.
    expect(emailProvider.sent).toHaveLength(0);
  });

  it("a tenant marketing sender cannot influence the account-verification email", async () => {
    const { app, emailProvider, marketingSender } = build();
    const owner = await signupOwner(app);
    // Configure a DISTINCT tenant marketing sender identity.
    await runWithTenant({ organizationId: owner.orgId }, async () => {
      await marketingSender.set(
        {
          businessName: "Tenant Marketing Co",
          replyTo: "marketing@tenant.example",
          fromAddress: "marketing@tenant.example",
          physicalAddress: "9 Tenant Rd",
        },
        "owner",
      );
    });
    const res = await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(emailProvider.sent).toHaveLength(1);
    const msg = emailProvider.sent[0];
    // Still the platform transactional sender — the tenant marketing identity
    // never appears in a verification message.
    expect(msg.from).toBe(CONFIGURED_SENDER);
    expect(msg.from).not.toMatch(/tenant\.example/);
    expect(msg.replyTo).toBeUndefined();
  });
});

describe("public fragment-exchange confirmation page", () => {
  it("GET /verify-email is neutral, non-indexable, un-embeddable, no 3rd-party assets", async () => {
    const { app } = build();
    const res = await request(app).get("/verify-email");
    expect(res.status).toBe(200);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["x-robots-tag"]).toMatch(/noindex/);
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'none'/);
    // No account data and no external scripts/fonts/images/analytics.
    expect(res.text).not.toMatch(/lead|campaign|organization|owner@/i);
    expect(res.text).not.toMatch(/https?:\/\//);
    // The token is never rendered server-side (it only ever lives in the URL fragment).
    expect(res.text).toMatch(/history\.replaceState/);
  });

  it("confirms a valid token once; replay and forged tokens are generic failures", async () => {
    const { app, emailProvider, emailVerification } = build();
    const owner = await signupOwner(app);
    await request(app)
      .post("/api/platform/account/request-verification")
      .set("Cookie", owner.cookie)
      .send({});
    const token = /#v=([A-Za-z0-9]+)/.exec(emailProvider.sent[0].text)![1];

    const ok = await request(app).post("/verify-email").send({ token });
    expect(ok.body).toEqual({ ok: true });
    expect(await emailVerification.isVerified(owner.ownerId)).toBe(true);

    const replay = await request(app).post("/verify-email").send({ token });
    expect(replay.body).toEqual({ ok: false });
    const forged = await request(app)
      .post("/verify-email")
      .send({ token: "forged" });
    expect(forged.body).toEqual({ ok: false });
  });
});

describe("marketing-sender test email route", () => {
  async function configureSender(
    marketingSender: MarketingSenderService,
    orgId: string,
  ) {
    await runWithTenant({ organizationId: orgId }, async () => {
      await marketingSender.set(
        {
          businessName: "Acme Institute",
          replyTo: "hello@acme.com",
          physicalAddress: "1 Main St, Springfield",
        },
        "owner",
      );
    });
  }

  it("denies a member even when their email is verified (role first)", async () => {
    const { app, users, sessions, emailVerification } = build();
    const owner = await signupOwner(app);
    // Create + verify a MEMBER, then attempt the test.
    const memberToken = await runWithTenant(
      { organizationId: owner.orgId },
      async () => {
        const m = await users.create({
          email: "member@acme.com",
          password: "password123",
          name: "Mem",
          role: "member",
        });
        return (await sessions.createForUser(m)).token;
      },
    );
    // Verify the member's email directly (role gate must still win).
    await emailVerification.request(
      (await runWithTenant({ organizationId: owner.orgId }, () =>
        users.findByEmail("member@acme.com"),
      ))!.id,
    );
    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", [`aec_session=${memberToken}`])
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("denies an owner whose account email is not verified (fail-closed)", async () => {
    const { app, marketingSender } = build();
    const owner = await signupOwner(app);
    await configureSender(marketingSender, owner.orgId);
    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_UNVERIFIED");
  });

  it("verified owner: sends via the TENANT sender, transactional, no unsubscribe, honest status", async () => {
    const { app, emailProvider, marketingSender } = build();
    const owner = await signupOwner(app);
    await verifyOwner(app, emailProvider, owner.cookie);
    await configureSender(marketingSender, owner.orgId);
    emailProvider.sent.length = 0;

    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");

    expect(emailProvider.sent).toHaveLength(1);
    const msg = emailProvider.sent[0];
    // Sent only to the requester's OWN verified address.
    expect(msg.to).toBe("owner@acme.com");
    // Uses the tenant's resolved marketing sender identity (business name +
    // reply-to), NOT the platform verification sender.
    expect(msg.from).toMatch(/Acme Institute/);
    expect(msg.replyTo).toBe("hello@acme.com");
    // Never counted as a marketing send: transactional, no unsubscribe headers.
    expect(msg.messageClass).toBe("transactional");
    expect(hasUnsub(msg)).toBe(false);
  });

  it("verified owner but incomplete sender config → pre_acceptance_failure with an action item", async () => {
    const { app, emailProvider } = build();
    const owner = await signupOwner(app);
    await verifyOwner(app, emailProvider, owner.cookie);
    emailProvider.sent.length = 0;

    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pre_acceptance_failure");
    expect(res.body.configIssue).toBeTruthy();
    // Never reached SMTP.
    expect(emailProvider.sent).toHaveLength(0);
  });

  it("rejects a recipient override (400)", async () => {
    const { app, emailProvider, marketingSender } = build();
    const owner = await signupOwner(app);
    await verifyOwner(app, emailProvider, owner.cookie);
    await configureSender(marketingSender, owner.orgId);
    emailProvider.sent.length = 0;
    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", owner.cookie)
      .send({ to: "attacker@evil.com" });
    expect(res.status).toBe(400);
    expect(emailProvider.sent).toHaveLength(0);
  });

  it("reports the provider's honest classification (uncertain passthrough)", async () => {
    const { app, emailProvider, marketingSender } = build();
    const owner = await signupOwner(app);
    await verifyOwner(app, emailProvider, owner.cookie);
    await configureSender(marketingSender, owner.orgId);
    emailProvider.result = {
      classification: "uncertain",
      responseCategory: "ambiguous",
      acceptedCount: 0,
      rejectedCount: 0,
    };
    emailProvider.sent.length = 0;
    const res = await request(app)
      .post("/api/platform/marketing/test-email")
      .set("Cookie", owner.cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("uncertain");
    // Sanitized only — never a raw SMTP response, address, or body.
    expect(JSON.stringify(res.body)).not.toMatch(/owner@acme\.com/);
  });
});
