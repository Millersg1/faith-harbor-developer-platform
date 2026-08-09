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
  MarketingOutboxRepository,
  MarketingOutboxService,
} from "./MarketingOutboxService";
import {
  MarketingPauseRepository,
  MarketingPauseService,
} from "./MarketingPauseService";

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const outboxRepo = new MarketingOutboxRepository();
  const marketingOutbox = new MarketingOutboxService(outboxRepo);
  const marketingPause = new MarketingPauseService(new MarketingPauseRepository());
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
    marketingOutbox,
    marketingPause,
    baseDomain: "allelitecloud.com",
  });
  return { app, users, sessions, marketingOutbox, marketingPause, outboxRepo };
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
  };
}

/** Seed one delivery_unknown outbox row for an org (crash-recovery shape). */
async function seedDeliveryUnknown(
  outbox: MarketingOutboxService,
  repo: MarketingOutboxRepository,
  org: string,
) {
  await outbox.enqueue({
    organizationId: org,
    enrollmentId: "enr-1",
    sequenceId: "seq-1",
    stepIndex: 0,
    email: "lead@x.com",
    subject: "s",
    body: "b",
  });
  // Claim as "due now" but with an ALREADY-EXPIRED lease, then recover it →
  // delivery_unknown (the crashed-worker shape).
  await repo.claimDue(
    "dead",
    new Date(Date.now() + 1_000).toISOString(), // message is due
    new Date(Date.now() - 1_000).toISOString(), // lease already expired
    10,
  );
  const recovered = await repo.recoverExpiredLeases(new Date().toISOString());
  return recovered[0];
}

describe("marketing ops routes — owner/admin controls", () => {
  it("requires authentication", async () => {
    const { app } = build();
    expect((await request(app).post("/api/platform/marketing/pause")).status).toBe(401);
  });

  it("denies a member (read/write) even when signed in", async () => {
    const { app, users, sessions } = build();
    const owner = await signupOwner(app);
    const memberToken = await runWithTenant({ organizationId: owner.orgId }, async () => {
      const m = await users.create({
        email: "member@acme.com",
        password: "password123",
        name: "Mem",
        role: "member",
      });
      return (await sessions.createForUser(m)).token;
    });
    const res = await request(app)
      .post("/api/platform/marketing/pause")
      .set("Cookie", [`aec_session=${memberToken}`]);
    expect(res.status).toBe(403);
  });

  it("owner can pause, see status, and resume tenant marketing", async () => {
    const { app, marketingPause } = build();
    const owner = await signupOwner(app);
    const pause = await request(app)
      .post("/api/platform/marketing/pause")
      .set("Cookie", owner.cookie);
    expect(pause.body).toEqual({ ok: true, paused: true });
    expect(await marketingPause.isTenantPaused(owner.orgId)).toBe(true);

    const status = await request(app)
      .get("/api/platform/marketing/status")
      .set("Cookie", owner.cookie);
    expect(status.body.paused).toBe(true);

    const resume = await request(app)
      .post("/api/platform/marketing/resume")
      .set("Cookie", owner.cookie);
    expect(resume.body).toEqual({ ok: true, paused: false });
    expect(await marketingPause.isTenantPaused(owner.orgId)).toBe(false);
  });
});

describe("marketing ops routes — delivery-unknown review", () => {
  it("lists needs-attention, and a retry REQUIRES an explicit duplicate-risk ack", async () => {
    const { app, marketingOutbox, outboxRepo } = build();
    const owner = await signupOwner(app);
    const row = await seedDeliveryUnknown(marketingOutbox, outboxRepo, owner.orgId);

    const attention = await request(app)
      .get("/api/platform/marketing/outbox/attention")
      .set("Cookie", owner.cookie);
    expect(attention.body.marketing).toHaveLength(1);
    expect(attention.body.marketing[0].status).toBe("delivery_unknown");

    // Retry without acknowledging duplicate risk → refused.
    const noAck = await request(app)
      .post(`/api/platform/marketing/outbox/${row.id}/retry`)
      .set("Cookie", owner.cookie)
      .send({});
    expect(noAck.status).toBe(400);
    expect(noAck.body.error.code).toBe("ACK_REQUIRED");

    // Retry WITH acknowledgement → accepted, with a duplicate warning.
    const withAck = await request(app)
      .post(`/api/platform/marketing/outbox/${row.id}/retry`)
      .set("Cookie", owner.cookie)
      .send({ acknowledgeDuplicateRisk: true });
    expect(withAck.status).toBe(200);
    expect(withAck.body.warning).toMatch(/duplicate/i);
  });

  it("resolve marks the item handled WITHOUT resending", async () => {
    const { app, marketingOutbox, outboxRepo } = build();
    const owner = await signupOwner(app);
    const row = await seedDeliveryUnknown(marketingOutbox, outboxRepo, owner.orgId);
    const res = await request(app)
      .post(`/api/platform/marketing/outbox/${row.id}/resolve`)
      .set("Cookie", owner.cookie);
    expect(res.body).toEqual({ ok: true });
    // No longer in the needs-attention set (resolved_at set; not resent).
    expect(await marketingOutbox.needsAttention(owner.orgId)).toHaveLength(0);
  });

  it("a tenant cannot resolve another tenant's item", async () => {
    const { app, marketingOutbox, outboxRepo } = build();
    const owner = await signupOwner(app);
    const foreign = await seedDeliveryUnknown(marketingOutbox, outboxRepo, "other-org");
    const res = await request(app)
      .post(`/api/platform/marketing/outbox/${foreign.id}/resolve`)
      .set("Cookie", owner.cookie);
    expect(res.status).toBe(404);
  });
});
