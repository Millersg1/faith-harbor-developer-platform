import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { OrganizationService } from "../../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../../branding/BrandingRepository";
import { BrandingService } from "../../branding/BrandingService";
import { PlatformClientRepository } from "../../clients/PlatformClientRepository";
import { PlatformClientService } from "../../clients/PlatformClientService";
import { PlatformInvoiceRepository } from "../../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../../projects/PlatformProjectService";
import { createPlatformApp } from "../../createPlatformApp";
import { PlatformSessionRepository } from "../../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../../sessions/PlatformSessionService";
import { PlatformSignupService } from "../../signup/PlatformSignupService";
import { PlatformUserRepository } from "../../users/PlatformUserRepository";
import { PlatformUserService } from "../../users/PlatformUserService";
import { DomainSupportActionRepository } from "./DomainSupportActionRepository";
import { InMemorySupportQueueReader, type SupportQueueItem } from "./DomainSupportQueue";
import { DomainSupportQueueService } from "./DomainSupportQueueService";
import { DomainOpsHealthService, InMemoryDomainHealthReader } from "../health/DomainOpsHealth";

const A = "/platform/admin/api";
const NOW = "2026-09-01T00:00:00Z";

const rows: SupportQueueItem[] = [
  { category: "registration_unknown", itemRef: "ord1", organizationId: "orgA", state: "registration_unknown", since: NOW },
  { category: "delivery_unknown", itemRef: "n1", organizationId: "orgB", state: "delivery_unknown", since: NOW },
];

async function setup() {
  const admins = new PlatformAdminService();
  await admins.create({ email: "root@allelitecloud.com", password: "password123", name: "Root" });
  await admins.create({ email: "other@allelitecloud.com", password: "password456", name: "Other" });
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  let seq = 0;
  const reader = new InMemorySupportQueueReader(rows);
  const domainSupport = new DomainSupportQueueService({
    reader,
    actions: new DomainSupportActionRepository(),
    now: () => NOW, newId: () => `act${++seq}`,
  });
  const domainOpsHealth = new DomainOpsHealthService({
    support: reader,
    health: new InMemoryDomainHealthReader({ queued: 3, accepted: 1 }, 60),
    coordinatorHealth: () => null,
    mode: () => "disabled",
    disabledReason: () => "disabled_by_configuration",
    now: () => NOW,
  });
  const app = createPlatformApp({
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins,
    adminSessions: new PlatformAdminSessionService(),
    domainSupport,
    domainOpsHealth,
  });
  const login = await request(app).post(`${A}/login`).send({ email: "root@allelitecloud.com", password: "password123" });
  return { app, cookie: login.headers["set-cookie"] as unknown as string[] };
}

describe("Stage L5 — support queue admin API", () => {
  let app: Awaited<ReturnType<typeof setup>>["app"];
  let cookie: string[];
  beforeAll(async () => { ({ app, cookie } = await setup()); });

  it("requires an admin session (401 without cookie)", async () => {
    const r = await request(app).get(`${A}/domain-ops/queue`);
    expect(r.status).toBe(401);
  });

  it("lists redacted rows for an authenticated admin", async () => {
    const r = await request(app).get(`${A}/domain-ops/queue`).set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(2);
    expect(Object.keys(r.body.items[0]).sort()).toEqual(["category", "itemRef", "organizationId", "since", "state"]);
  });

  it("returns PII-free counts", async () => {
    const r = await request(app).get(`${A}/domain-ops/queue/counts`).set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.counts.registration_unknown).toBe(1);
    expect(r.body.counts.delivery_unknown).toBe(1);
  });

  it("an action requires a per-call reauth", async () => {
    const r = await request(app).post(`${A}/domain-ops/queue/registration_unknown/ord1/actions`).set("Cookie", cookie)
      .send({ action: "acknowledge" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("REAUTH_REQUIRED");
  });

  it("rejects a wrong reauth password", async () => {
    const r = await request(app).post(`${A}/domain-ops/queue/registration_unknown/ord1/actions`).set("Cookie", cookie)
      .send({ action: "acknowledge", reauthEmail: "root@allelitecloud.com", reauthPassword: "wrong" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("REAUTH_FAILED");
  });

  it("rejects reauth as a DIFFERENT admin than the session", async () => {
    const r = await request(app).post(`${A}/domain-ops/queue/registration_unknown/ord1/actions`).set("Cookie", cookie)
      .send({ action: "acknowledge", reauthEmail: "other@allelitecloud.com", reauthPassword: "password456" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("REAUTH_MISMATCH");
  });

  it("records an acknowledge with a correct reauth (201)", async () => {
    const r = await request(app).post(`${A}/domain-ops/queue/registration_unknown/ord1/actions`).set("Cookie", cookie)
      .send({ action: "acknowledge", reauthEmail: "root@allelitecloud.com", reauthPassword: "password123" });
    expect(r.status).toBe(201);
    expect(r.body.action.action).toBe("acknowledge");
    expect(r.body.action.organizationId).toBe("orgA");
  });

  it("blocks mark_resolved without a prior reconciliation (evidence gate via API)", async () => {
    const r = await request(app).post(`${A}/domain-ops/queue/delivery_unknown/n1/actions`).set("Cookie", cookie)
      .send({ action: "mark_resolved", evidence: "looks fine", reauthEmail: "root@allelitecloud.com", reauthPassword: "password123" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("RECONCILIATION_REQUIRED");
  });

  it("exposes PII-free operational health (admin only)", async () => {
    const unauth = await request(app).get(`${A}/domain-ops/health`);
    expect(unauth.status).toBe(401);
    const r = await request(app).get(`${A}/domain-ops/health`).set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.health.mode).toBe("disabled");
    expect(r.body.health.unknownsTotal).toBe(2); // registration_unknown + delivery_unknown
    expect(r.body.health.noticesByState.queued).toBe(3);
    expect(JSON.stringify(r.body.health)).not.toMatch(/@|sk_|epp/i);
  });

  it("serves the accessible ops-queue page", async () => {
    const r = await request(app).get(`/platform/admin/domain-ops`);
    expect(r.status).toBe(200);
    expect(r.text).toContain("<html lang=\"en\">");
    expect(r.text).toContain("Domain Support Queue");
    expect(r.text.toLowerCase()).toContain("read-only support surface");
  });
});
