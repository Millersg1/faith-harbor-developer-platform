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
import { PlatformFileRepository } from "../files/PlatformFileRepository";
import { PlatformFileService } from "../files/PlatformFileService";
import { MemoryStorageProvider } from "../files/StorageProvider";
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
  LeadMagnetDispatchRepository,
  LeadMagnetDispatchService,
} from "./LeadMagnetDispatchService";
import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";
import {
  LeadMagnetFulfillmentRepository,
  LeadMagnetFulfillmentService,
} from "./LeadMagnetFulfillmentService";

function build() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const files = new PlatformFileService(new PlatformFileRepository(), new MemoryStorageProvider());
  const dispatchRepo = new LeadMagnetDispatchRepository();
  const magnetDispatch = new LeadMagnetDispatchService(dispatchRepo);
  const fulfillmentRepo = new LeadMagnetFulfillmentRepository();
  const magnetFulfillment = new LeadMagnetFulfillmentService(
    fulfillmentRepo,
    new LeadMagnetCapabilityService(new LeadMagnetCapabilityRepository()),
    async () => true,
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
    files,
    magnetDispatch,
    magnetFulfillment,
    transactionalSenderConfigured: true,
    baseDomain: "allelitecloud.com",
  });
  return { app, users, sessions, files, magnetDispatch, dispatchRepo, magnetFulfillment };
}

async function signupOwner(app: ReturnType<typeof build>["app"]) {
  const res = await request(app).post("/auth/signup").send({
    organizationName: "Acme",
    email: "owner@acme.com",
    password: "password123",
  });
  return { cookie: res.headers["set-cookie"] as unknown as string[], orgId: res.body.organization.id as string };
}

async function seedDeliveryUnknown(repo: LeadMagnetDispatchRepository, dispatch: LeadMagnetDispatchService, org: string) {
  await dispatch.enqueue({
    organizationId: org,
    fulfillmentId: "ful1",
    formId: "form1",
    fileId: "file1",
    email: "secret@x.com",
    downloadBase: "https://acme.allelitecloud.com",
  });
  await repo.claimDue("dead", new Date(Date.now() + 1000).toISOString(), new Date(Date.now() - 1000).toISOString(), 10);
  return (await repo.recoverExpiredLeases(new Date().toISOString()))[0];
}

describe("magnet ops routes — owner/admin only, PII-free", () => {
  it("requires auth; denies a member", async () => {
    const { app, users, sessions } = build();
    expect((await request(app).get("/api/platform/magnet/fulfillments")).status).toBe(401);
    const owner = await signupOwner(app);
    const memberToken = await runWithTenant({ organizationId: owner.orgId }, async () => {
      const m = await users.create({ email: "member@acme.com", password: "password123", name: "Mem", role: "member" });
      return (await sessions.createForUser(m)).token;
    });
    const res = await request(app)
      .get("/api/platform/magnet/dispatch/attention")
      .set("Cookie", [`aec_session=${memberToken}`]);
    expect(res.status).toBe(403);
  });

  it("fulfillment + dispatch listings are PII-free and carry honesty statements", async () => {
    const { app, magnetFulfillment, magnetDispatch, dispatchRepo } = build();
    const owner = await signupOwner(app);
    await magnetFulfillment.fulfill({
      organizationId: owner.orgId,
      formId: "form1",
      submissionId: "sub1",
      magnet: { id: "m1", title: "Guide", mode: "email", fileId: "file1", emailSubject: "s" },
      recipientEmail: "secret@x.com",
    });
    await seedDeliveryUnknown(dispatchRepo, magnetDispatch, owner.orgId);

    const ful = await request(app).get("/api/platform/magnet/fulfillments").set("Cookie", owner.cookie);
    expect(JSON.stringify(ful.body.fulfillments)).not.toMatch(/secret@x\.com/);
    expect(ful.body.honesty.smtpAcceptance).toMatch(/NOT proof of inbox delivery/i);

    const att = await request(app).get("/api/platform/magnet/dispatch/attention").set("Cookie", owner.cookie);
    expect(att.body.items).toHaveLength(1);
    expect(att.body.items[0].status).toBe("delivery_unknown");
    expect(JSON.stringify(att.body.items)).not.toMatch(/secret@x\.com/); // no recipient PII
    expect(att.body.honesty.pdfValidation).toMatch(/NOT malware scanning/i);
  });

  it("delivery_unknown retry REQUIRES a duplicate-risk ack; resolve does not resend", async () => {
    const { app, magnetDispatch, dispatchRepo } = build();
    const owner = await signupOwner(app);
    const row = await seedDeliveryUnknown(dispatchRepo, magnetDispatch, owner.orgId);

    const noAck = await request(app).post(`/api/platform/magnet/dispatch/${row.id}/retry`).set("Cookie", owner.cookie).send({});
    expect(noAck.status).toBe(400);
    expect(noAck.body.error.code).toBe("ACK_REQUIRED");

    const withAck = await request(app)
      .post(`/api/platform/magnet/dispatch/${row.id}/retry`)
      .set("Cookie", owner.cookie)
      .send({ acknowledgeDuplicateRisk: true });
    expect(withAck.status).toBe(200);
    expect(withAck.body.warning).toMatch(/duplicate/i);

    // A fresh delivery_unknown → resolve (no resend).
    const row2 = await seedDeliveryUnknown(dispatchRepo, magnetDispatch, owner.orgId);
    const resolved = await request(app).post(`/api/platform/magnet/dispatch/${row2.id}/resolve`).set("Cookie", owner.cookie);
    expect(resolved.body).toEqual({ ok: true });
  });

  it("a tenant cannot act on another tenant's dispatch (404)", async () => {
    const { app, magnetDispatch, dispatchRepo } = build();
    const owner = await signupOwner(app);
    const foreign = await seedDeliveryUnknown(dispatchRepo, magnetDispatch, "other-org");
    const res = await request(app).post(`/api/platform/magnet/dispatch/${foreign.id}/resolve`).set("Cookie", owner.cookie);
    expect(res.status).toBe(404);
  });

  it("file eligibility: a PDF is eligible; a non-PDF is not", async () => {
    const { app, files } = build();
    const owner = await signupOwner(app);
    const pdfId = await runWithTenant({ organizationId: owner.orgId }, async () => {
      const f = await files.upload({ name: "guide.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.7").toString("base64") });
      return f.id;
    });
    const okRes = await request(app).get(`/api/platform/magnet/files/${pdfId}/eligibility`).set("Cookie", owner.cookie);
    expect(okRes.body.eligible).toBe(true);
    expect(okRes.body.senderConfigured).toBe(true);

    const pngId = await runWithTenant({ organizationId: owner.orgId }, async () => {
      const f = await files.upload({ name: "pic.png", mimeType: "image/png", data: Buffer.from("x").toString("base64") });
      return f.id;
    });
    const badRes = await request(app).get(`/api/platform/magnet/files/${pngId}/eligibility`).set("Cookie", owner.cookie);
    expect(badRes.body.eligible).toBe(false);
    expect(badRes.body.reason).toBe("not_pdf_mime");
  });
});
