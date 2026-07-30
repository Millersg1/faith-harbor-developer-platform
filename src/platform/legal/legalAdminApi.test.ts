import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "../admin/PlatformAdminService";
import { PlatformAdminSessionService } from "../admin/PlatformAdminSessionService";
import { BrandingRepository } from "../branding/BrandingRepository";
import { BrandingService } from "../branding/BrandingService";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { createPlatformApp } from "../createPlatformApp";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import { PlatformLegalService } from "./PlatformLegalService";
import { platformLegalSeeds } from "./content/platformLegalContent";

const A = "/platform/admin/api";

async function setup() {
  const legal = new PlatformLegalService();
  await legal.seedIfEmpty(platformLegalSeeds());
  const admins = new PlatformAdminService();
  await admins.create({
    email: "root@allelitecloud.com",
    password: "password123",
    name: "Root",
  });
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(
    new PlatformSessionRepository(),
  );
  const clients = new PlatformClientService(
    new PlatformClientRepository(),
  );
  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients,
    projects: new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    ),
    invoices: new PlatformInvoiceService(
      new PlatformInvoiceRepository(),
      clients,
    ),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins,
    adminSessions: new PlatformAdminSessionService(),
    legal,
  });
  const login = await request(app)
    .post(`${A}/login`)
    .send({
      email: "root@allelitecloud.com",
      password: "password123",
    });
  const cookie = login.headers["set-cookie"];
  return { app, cookie };
}

describe("admin legal management API", () => {
  let app: Awaited<ReturnType<typeof setup>>["app"];
  let cookie: string[];

  beforeAll(async () => {
    const s = await setup();
    app = s.app;
    cookie = s.cookie as unknown as string[];
  });

  it("requires an admin session", async () => {
    const res = await request(app).get(`${A}/legal/documents`);
    expect(res.status).toBe(401);
  });

  it("lists all documents and versions of a kind", async () => {
    const all = await request(app)
      .get(`${A}/legal/documents`)
      .set("Cookie", cookie);
    expect(all.status).toBe(200);
    expect(all.body.documents.length).toBeGreaterThanOrEqual(8);

    const terms = await request(app)
      .get(`${A}/legal/documents/terms`)
      .set("Cookie", cookie);
    expect(terms.status).toBe(200);
    expect(terms.body.versions).toHaveLength(1);
    // Version 1.0 is seeded already published.
    expect(terms.body.versions[0].status).toBe("published");
  });

  it("new version supersedes v1, then the published version is immutable", async () => {
    // Terms is published at v1. Create a new draft version from it.
    const draft = await request(app)
      .post(`${A}/legal/documents/terms/draft`)
      .set("Cookie", cookie)
      .send({});
    expect(draft.status).toBe(201);
    expect(draft.body.document.version).toBe(2);
    expect(draft.body.document.status).toBe("draft");
    const v2Id = draft.body.document.id as string;

    // Edit the draft (allowed).
    const edit = await request(app)
      .put(`${A}/legal/documents/${v2Id}`)
      .set("Cookie", cookie)
      .send({ bodyMarkdown: "## Terms\n\nRevised body." });
    expect(edit.status).toBe(200);

    // Publish v2 with a scheduled effective date; it supersedes v1.
    const pub = await request(app)
      .post(`${A}/legal/documents/${v2Id}/publish`)
      .set("Cookie", cookie)
      .send({ effectiveDate: "2026-09-01" });
    expect(pub.status).toBe(200);
    expect(pub.body.document.status).toBe("published");
    expect(pub.body.document.effectiveDate).toBe("2026-09-01");

    const versions = await request(app)
      .get(`${A}/legal/documents/terms`)
      .set("Cookie", cookie);
    const v1 = versions.body.versions.find(
      (v: { version: number }) => v.version === 1,
    );
    const v2 = versions.body.versions.find(
      (v: { version: number }) => v.version === 2,
    );
    expect(v1.status).toBe("superseded");
    expect(v2.status).toBe("published");

    // Editing the now-published v2 is refused (immutable).
    const badEdit = await request(app)
      .put(`${A}/legal/documents/${v2Id}`)
      .set("Cookie", cookie)
      .send({ bodyMarkdown: "tampered" });
    expect(badEdit.status).toBe(400);
    expect(badEdit.body.error.code).toBe("LEGAL_ERROR");
  });

  it("refuses to publish a draft that reintroduces an internal marker", async () => {
    const draft = await request(app)
      .post(`${A}/legal/documents/privacy/draft`)
      .set("Cookie", cookie)
      .send({});
    const id = draft.body.document.id as string;
    await request(app)
      .put(`${A}/legal/documents/${id}`)
      .set("Cookie", cookie)
      .send({ bodyMarkdown: "## Privacy\n\nLEGAL REVIEW REQUIRED here." });
    const pub = await request(app)
      .post(`${A}/legal/documents/${id}/publish`)
      .set("Cookie", cookie)
      .send({});
    expect(pub.status).toBe(400);
    expect(pub.body.error.code).toBe("LEGAL_ERROR");
  });

  it("returns a sanitized preview and a compare payload", async () => {
    const list = await request(app)
      .get(`${A}/legal/documents/terms`)
      .set("Cookie", cookie);
    const latest = list.body.versions[0];

    const preview = await request(app)
      .get(`${A}/legal/documents/${latest.id}/preview`)
      .set("Cookie", cookie);
    expect(preview.status).toBe(200);
    expect(preview.body.html).toContain("<");
    expect(preview.body.html).not.toContain("<script>");

    const cmp = await request(app)
      .get(`${A}/legal/documents/${latest.id}/compare`)
      .set("Cookie", cookie);
    expect(cmp.status).toBe(200);
    expect(cmp.body.current.version).toBe(latest.version);
    expect(cmp.body.previous).not.toBeNull();
  });
});
