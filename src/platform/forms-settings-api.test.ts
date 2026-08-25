import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformLeadRepository } from "./crm/PlatformLeadRepository";
import { PlatformLeadService } from "./crm/PlatformLeadService";
import { DripService } from "./drip/DripService";
import { PlatformFileRepository } from "./files/PlatformFileRepository";
import { PlatformFileService } from "./files/PlatformFileService";
import { MemoryStorageProvider } from "./files/StorageProvider";
import { PlatformFormRepository } from "./forms/PlatformFormRepository";
import { PlatformFormService } from "./forms/PlatformFormService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

const A = "/api/platform";

async function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
  const forms = new PlatformFormService(new PlatformFormRepository(), { leads });
  const drip = new DripService();
  const files = new PlatformFileService(new PlatformFileRepository(), new MemoryStorageProvider());

  const app = createPlatformApp({
    organizations, users, sessions,
    branding: new BrandingService(new BrandingRepository()),
    clients, leads, forms, drip, files,
    projects: new PlatformProjectService(new PlatformProjectRepository(), clients),
    invoices: new PlatformInvoiceService(new PlatformInvoiceRepository(), clients),
    signup: new PlatformSignupService(organizations, users, sessions),
    domains: new OrganizationDomainService(),
    admins: new PlatformAdminService(),
    adminSessions: new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app).post("/auth/signup").send({ organizationName: "Acme", slug: "acme", email: "owner@acme.com", password: "password123" });
  const cookie = signup.headers["set-cookie"] as unknown as string[];

  // Owned drip sequence via the product API.
  const seq = await request(app).post(`${A}/drip/sequences`).set("Cookie", cookie).send({ name: "Welcome" });
  const sequenceId = seq.body.sequence?.id as string;

  // A member (non owner/admin) in the same org.
  await request(app).post(`${A}/team`).set("Cookie", cookie).send({ email: "m@acme.com", password: "password123", role: "member" });
  const memberLogin = await request(app).post("/auth/login").set("X-Org-Slug", "acme").send({ email: "m@acme.com", password: "password123" });
  const memberCookie = memberLogin.headers["set-cookie"] as unknown as string[];

  return { app, cookie, memberCookie, sequenceId };
}

const createForm = (app: unknown, cookie: string[], settings: unknown, name = "Lead form") =>
  request(app as never).post(`${A}/forms`).set("Cookie", cookie).send({ name, fields: [{ key: "email", type: "email", label: "Email", required: true }], settings });
const getForm = (app: unknown, cookie: string[], id: string) => request(app as never).get(`${A}/forms/${id}`).set("Cookie", cookie);

describe("Forms settings API (Stage — customer-operational config)", () => {
  let h: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { h = await buildApp(); });

  it("persists an allowed-origin allowlist set through the API", async () => {
    const r = await createForm(h.app, h.cookie, { allowedOrigins: ["https://inst.example", "https://inst.example"] });
    expect(r.status).toBe(201);
    const got = await getForm(h.app, h.cookie, r.body.form.id);
    expect(got.body.form.settings.allowedOrigins).toEqual(["https://inst.example"]); // normalized + deduped
  });

  it("persists consent wording, version, and double opt-in", async () => {
    const r = await createForm(h.app, h.cookie, { consent: { enabled: true, fieldKey: "consent", wording: "I agree to receive marketing emails.", version: "2025-08", doubleOptIn: false } });
    expect(r.status).toBe(201);
    const c = (await getForm(h.app, h.cookie, r.body.form.id)).body.form.settings.consent;
    expect(c).toMatchObject({ enabled: true, fieldKey: "consent", wording: "I agree to receive marketing emails.", version: "2025-08", doubleOptIn: false });
  });

  it("drops unknown / injected fields (no mass assignment)", async () => {
    const r = await createForm(h.app, h.cookie, {
      allowedOrigins: ["https://ok.example"], honeypotField: "hp",
      organizationId: "victim-org", owner: "x", provider: "namesilo", deliveryState: "sent", filePath: "/etc/passwd", id: "evil", __proto__: { polluted: true },
    });
    expect(r.status).toBe(201);
    const s = (await getForm(h.app, h.cookie, r.body.form.id)).body.form.settings;
    expect(Object.keys(s).sort()).toEqual(["allowedOrigins", "honeypotField"]);
    expect(r.body.form.organizationId).not.toBe("victim-org"); // org stamped from tenant, not body
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // no prototype pollution
  });

  it("accepts a redirect lead magnet; rejects a non-https redirect", async () => {
    const ok = await createForm(h.app, h.cookie, { leadMagnet: { id: "m", title: "Guide", mode: "redirect", redirectUrl: "https://ok.example/guide" } });
    expect(ok.status).toBe(201);
    expect((await getForm(h.app, h.cookie, ok.body.form.id)).body.form.settings.leadMagnet.mode).toBe("redirect");
    const bad = await createForm(h.app, h.cookie, { leadMagnet: { id: "m", title: "Guide", mode: "redirect", redirectUrl: "http://insecure.example" } });
    expect(bad.status).toBe(400);
  });

  it("binds a consent sequence ONLY from the tenant's own sequences", async () => {
    expect(h.sequenceId).toBeTruthy();
    const owned = await createForm(h.app, h.cookie, { consent: { enabled: true, fieldKey: "consent", wording: "ok", version: "1", sequenceId: h.sequenceId } });
    expect(owned.status).toBe(201);
    expect((await getForm(h.app, h.cookie, owned.body.form.id)).body.form.settings.consent.sequenceId).toBe(h.sequenceId);
    // A foreign / non-owned sequence id is refused (cross-tenant binding blocked).
    const foreign = await createForm(h.app, h.cookie, { consent: { enabled: true, fieldKey: "consent", wording: "ok", version: "1", sequenceId: "seq-from-another-tenant" } });
    expect(foreign.status).toBe(400);
  });

  it("refuses a lead-magnet file that is not owned by the tenant (fail closed)", async () => {
    const r = await createForm(h.app, h.cookie, { leadMagnet: { id: "m", title: "PDF", mode: "download", fileId: "file-from-another-tenant" } });
    expect(r.status).toBe(400);
  });

  it("denies a member (non owner/admin) from writing form settings", async () => {
    const r = await createForm(h.app, h.memberCookie, { allowedOrigins: ["https://x.example"] });
    expect(r.status).toBe(403);
  });

  it("serves the accessible forms configuration UI at /app/forms", async () => {
    const r = await request(h.app).get("/app/forms");
    expect(r.status).toBe(200);
    expect(r.text).toContain("<html lang=\"en\">");
    // The UI exposes every required control a customer configures.
    for (const label of ["Allowed external origins", "Marketing consent", "Consent checkbox wording", "double opt-in", "Drip sequence", "Lead magnet", "Download a PDF"]) {
      expect(r.text).toContain(label);
    }
  });

  it("updates settings via PATCH with the same allowlist + ownership rules", async () => {
    const created = await createForm(h.app, h.cookie, { allowedOrigins: ["https://a.example"] });
    const id = created.body.form.id;
    const patched = await request(h.app).patch(`${A}/forms/${id}`).set("Cookie", h.cookie).send({ settings: { allowAnyOrigin: true } });
    expect(patched.status).toBe(200);
    expect((await getForm(h.app, h.cookie, id)).body.form.settings.allowAnyOrigin).toBe(true);
    const badPatch = await request(h.app).patch(`${A}/forms/${id}`).set("Cookie", h.cookie).send({ settings: { consent: { enabled: true, fieldKey: "c", wording: "x", version: "1", sequenceId: "nope" } } });
    expect(badPatch.status).toBe(400);
  });
});
