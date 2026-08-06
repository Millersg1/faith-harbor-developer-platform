import request from "supertest";
import { describe, expect, it } from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import type { EmailMessage } from "../communications/EmailTypes";
import type { EmailTransport } from "../communications/EmailTransport";
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
import { DripRepository } from "./drip/DripRepository";
import { DripService } from "./drip/DripService";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { PlatformEmailRepository } from "./email/PlatformEmailRepository";
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

const CONTACT_FIELDS = [
  { key: "name", type: "text" as const, label: "Name", required: true },
  { key: "email", type: "email" as const, label: "Email", required: true },
  {
    key: "message",
    type: "textarea" as const,
    label: "Message",
    required: false,
  },
];

function captureEmail() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: async (m) => {
      sent.push(m);
      return { status: "sent", provider: "stub" };
    },
  };
  const email = new PlatformEmailService(
    new PlatformEmailRepository(),
    transport,
    { connected: true },
  );
  return { sent, email };
}

describe("public form → CRM lead, but NOT marketing (fail-closed)", () => {
  it("creates the CRM lead but does NOT start any marketing drip (no consent core yet)", async () => {
    const { sent, email } = captureEmail();
    // A live "lead_created" sequence exists — a public submission must STILL
    // NOT enroll into it, because marketing enrollment is consent-gated and the
    // consent/unsubscribe/suppression core does not exist yet (fail-closed).
    const drip = new DripService(new DripRepository(), email, {
      now: () => 1_000,
    });
    const clients = new PlatformClientService(new PlatformClientRepository());
    const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
    const forms = new PlatformFormService(new PlatformFormRepository(), {
      leads,
    });

    let slug = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const seq = await drip.createSequence({
        name: "Institute nurture",
        trigger: "lead_created",
      });
      await drip.addStep(seq.id, {
        delayHours: 0,
        subject: "Welcome to the institute",
        body: "Thanks for your interest.",
      });
      slug = (await forms.create({ name: "Enroll", fields: CONTACT_FIELDS }))
        .slug;
    });

    await forms.submitPublic(slug, {
      name: "Dana Lee",
      email: "dana@example.com",
      message: "Interested in the program",
    });

    await runWithTenant({ organizationId: "orgA" }, async () => {
      // The CRM lead was created…
      const allLeads = await leads.list();
      expect(allLeads).toHaveLength(1);
      expect(allLeads[0].email).toBe("dana@example.com");
      // …but NO marketing enrollment happened, and nothing was sent.
      expect(await drip.listEnrollments()).toHaveLength(0);
      expect(await drip.runDue()).toBe(0);
    });
    expect(sent).toHaveLength(0);
  });
});

function buildApp() {
  const organizations = new OrganizationService();
  const users = new PlatformUserService(new PlatformUserRepository());
  const sessions = new PlatformSessionService(new PlatformSessionRepository());
  const clients = new PlatformClientService(new PlatformClientRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
  const forms = new PlatformFormService(new PlatformFormRepository(), { leads });
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
    forms,
    baseDomain: "allelitecloud.com",
  });
  return { app, forms };
}

async function makeForm(
  forms: PlatformFormService,
  org: string,
  extra: Partial<Parameters<PlatformFormService["create"]>[0]> = {},
): Promise<string> {
  let slug = "";
  await runWithTenant({ organizationId: org }, async () => {
    slug = (
      await forms.create({ name: "Contact", fields: CONTACT_FIELDS, ...extra })
    ).slug;
  });
  return slug;
}

describe("public form endpoints — per-form CORS (deny-by-default)", () => {
  const ALLOWED = "https://institute.example";

  it("config never leaks sensitive fields and echoes only a configured origin", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA", {
      notifyEmail: "owner@secret.example",
      settings: { allowedOrigins: [ALLOWED] },
    });
    // Allowed origin → echoed exactly (never "*"), with Vary: Origin.
    const ok = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Origin", ALLOWED);
    expect(ok.status).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(ok.headers["vary"]).toMatch(/Origin/i);
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(ok.body.form.fields).toHaveLength(3);
    expect(JSON.stringify(ok.body)).not.toContain("owner@secret.example");
    expect(ok.body.form.notifyEmail).toBeUndefined();
    expect(ok.body.form.organizationId).toBeUndefined();
    expect(ok.body.form.settings).toBeUndefined();
  });

  it("a DISALLOWED origin gets no permissive CORS header", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA", {
      settings: { allowedOrigins: [ALLOWED] },
    });
    const res = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(200); // request still served…
    expect(res.headers["access-control-allow-origin"]).toBeUndefined(); // …but browser can't read it
  });

  it("preflight is 204; allowed origin echoed, disallowed origin denied", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA", {
      settings: { allowedOrigins: [ALLOWED] },
    });
    const good = await request(app)
      .options(`/api/public/forms/${slug}/submit`)
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST");
    expect(good.status).toBe(204);
    expect(good.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(good.headers["access-control-allow-methods"]).toMatch(/POST/);

    const bad = await request(app)
      .options(`/api/public/forms/${slug}/submit`)
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(bad.status).toBe(204);
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("explicit allowAnyOrigin opts into '*' (deliberate tenant choice)", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA", {
      settings: { allowAnyOrigin: true },
    });
    const res = await request(app)
      .get(`/api/public/forms/${slug}`)
      .set("Origin", "https://anywhere.example");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("unknown form config is a clean 404 with no CORS grant (no tenant leak)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/api/public/forms/does-not-exist")
      .set("Origin", ALLOWED);
    expect(res.status).toBe(404);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/org|tenant/i);
  });
});

describe("public form submit — abuse controls", () => {
  it("accepts a valid submission and creates the tenant lead", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA");
    const res = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .send({ data: { name: "Dana", email: "dana@example.com" } });
    expect(res.status).toBe(200);
    expect(res.body.confirmationMessage).toBeTruthy();
  });

  it("silently drops a honeypot hit (generic success, no submission stored)", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA", {
      settings: { honeypotField: "website" },
    });
    const res = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .send({ data: { name: "Bot", email: "bot@example.com", website: "spam" } });
    expect(res.status).toBe(200); // looks successful to the bot
    // No submission was recorded.
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const list = await forms.list();
      const subs = await forms.listSubmissions(list[0].id);
      expect(subs).toHaveLength(0);
    });
  });

  it("rejects an oversized payload with 413", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA");
    const big = "x".repeat(40_000);
    const res = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .send({ data: { name: "Big", email: "big@example.com", message: big } });
    expect(res.status).toBe(413);
  });

  it("rate-limits repeated same-email submissions with 429 + Retry-After", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA");
    let limitedStatus = 0;
    let retryAfter: string | undefined;
    for (let i = 0; i < 8; i++) {
      const r = await request(app)
        .post(`/api/public/forms/${slug}/submit`)
        .set("Idempotency-Key", `k${i}`) // distinct so idempotency doesn't mask it
        .send({ data: { name: "Rae", email: "rae@example.com" } });
      if (r.status === 429) {
        limitedStatus = r.status;
        retryAfter = r.headers["retry-after"];
        break;
      }
    }
    expect(limitedStatus).toBe(429);
    expect(retryAfter).toBeTruthy();
  });

  it("idempotent double-click returns the same result without a duplicate", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA");
    const payload = { data: { name: "Dee", email: "dee@example.com" } };
    const a = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .set("Idempotency-Key", "dbl-1")
      .send(payload);
    const b = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .set("Idempotency-Key", "dbl-1")
      .send(payload);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const list = await forms.list();
      const subs = await forms.listSubmissions(list[0].id);
      expect(subs).toHaveLength(1); // only ONE submission despite two posts
    });
  });

  it("an inactive (paused) form fails closed with 404", async () => {
    const { app, forms } = buildApp();
    const slug = await makeForm(forms, "orgA");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const f = (await forms.list())[0];
      await forms.update(f.id, { status: "paused" });
    });
    const res = await request(app)
      .post(`/api/public/forms/${slug}/submit`)
      .send({ data: { name: "X", email: "x@example.com" } });
    expect(res.status).toBe(404);
  });
});
