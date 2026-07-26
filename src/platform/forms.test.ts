import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

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
import { PlatformLeadRepository } from "./crm/PlatformLeadRepository";
import { PlatformLeadService } from "./crm/PlatformLeadService";
import {
  FormNotFoundError,
  FormValidationError,
  PlatformFormService,
} from "./forms/PlatformFormService";
import { PlatformFormRepository } from "./forms/PlatformFormRepository";
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
  {
    key: "name",
    type: "text" as const,
    label: "Name",
    required: true,
  },
  {
    key: "email",
    type: "email" as const,
    label: "Email",
    required: true,
  },
  {
    key: "message",
    type: "textarea" as const,
    label: "Message",
    required: false,
  },
];

describe("FormService", () => {
  it("creates a form and accepts a valid public submission", async () => {
    const repo =
      new PlatformFormRepository();
    const clients =
      new PlatformClientService(
        new PlatformClientRepository(),
      );
    const leads =
      new PlatformLeadService(
        new PlatformLeadRepository(),
        clients,
      );
    const svc =
      new PlatformFormService(repo, {
        leads,
      });

    let slug = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const form =
          await svc.create({
            name: "Contact",
            fields: CONTACT_FIELDS,
          });
        slug = form.slug;
        expect(
          form.slug.length,
        ).toBeGreaterThan(5);
      },
    );

    const result =
      await svc.submitPublic(slug, {
        name: "Dana Lee",
        email: "dana@example.com",
        message: "Hello!",
      });
    expect(
      result.confirmationMessage,
    ).toBeTruthy();

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const form = (
          await svc.list()
        )[0];
        const subs =
          await svc.listSubmissions(
            form.id,
          );
        expect(subs).toHaveLength(1);
        expect(
          subs[0].data.email,
        ).toBe("dana@example.com");

        // A lead was created from the submission.
        const allLeads =
          await leads.list();
        expect(
          allLeads,
        ).toHaveLength(1);
        expect(
          allLeads[0].email,
        ).toBe("dana@example.com");
      },
    );
  });

  it("rejects a submission missing a required field", async () => {
    const svc =
      new PlatformFormService(
        new PlatformFormRepository(),
      );
    let slug = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        slug = (
          await svc.create({
            name: "Contact",
            fields: CONTACT_FIELDS,
          })
        ).slug;
      },
    );

    await expect(
      svc.submitPublic(slug, {
        name: "No Email",
      }),
    ).rejects.toBeInstanceOf(
      FormValidationError,
    );
  });

  it("won't serve or accept a paused form", async () => {
    const svc =
      new PlatformFormService(
        new PlatformFormRepository(),
      );
    let slug = "";
    let id = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const f = await svc.create({
          name: "Contact",
          fields: CONTACT_FIELDS,
        });
        slug = f.slug;
        id = f.id;
        await svc.update(id, {
          status: "paused",
        });
      },
    );

    expect(
      await svc.getPublicBySlug(slug),
    ).toBeUndefined();
    await expect(
      svc.submitPublic(slug, {
        name: "X",
        email: "x@y.com",
      }),
    ).rejects.toBeInstanceOf(
      FormNotFoundError,
    );
  });

  it("keeps submissions scoped to the form's tenant", async () => {
    const svc =
      new PlatformFormService(
        new PlatformFormRepository(),
      );
    let slug = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        slug = (
          await svc.create({
            name: "A form",
            fields: CONTACT_FIELDS,
          })
        ).slug;
      },
    );

    await svc.submitPublic(slug, {
      name: "Someone",
      email: "s@e.com",
    });

    // Another tenant sees no forms and no submissions.
    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
  });
});

async function buildApp() {
  const organizations =
    new OrganizationService();
  const users =
    new PlatformUserService(
      new PlatformUserRepository(),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const leads =
    new PlatformLeadService(
      new PlatformLeadRepository(),
      clients,
    );
  const forms =
    new PlatformFormService(
      new PlatformFormRepository(),
      { leads },
    );

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects:
      new PlatformProjectService(
        new PlatformProjectRepository(),
        clients,
      ),
    invoices:
      new PlatformInvoiceService(
        new PlatformInvoiceRepository(),
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
    leads,
    forms,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("Forms API", () => {
  it("creates a form, serves it publicly, and captures a submission + lead", async () => {
    const { app, cookie } =
      await buildApp();

    const created = await request(app)
      .post("/api/platform/forms")
      .set("Cookie", cookie)
      .send({
        name: "Contact us",
        fields: CONTACT_FIELDS,
      });
    expect(created.status).toBe(201);
    const slug =
      created.body.form.slug;
    const formId =
      created.body.form.id;

    // Public page renders (no auth).
    const page = await request(app).get(
      `/f/${slug}`,
    );
    expect(page.status).toBe(200);
    expect(page.text).toContain(
      "Contact us",
    );

    // Public submit (no auth).
    const submit = await request(
      app,
    )
      .post(
        `/api/public/forms/${slug}/submit`,
      )
      .send({
        data: {
          name: "Pat Q",
          email: "pat@example.com",
          message: "Interested",
        },
      });
    expect(submit.status).toBe(200);

    const subs = await request(app)
      .get(
        `/api/platform/forms/${formId}/submissions`,
      )
      .set("Cookie", cookie);
    expect(
      subs.body.submissions,
    ).toHaveLength(1);

    const leads = await request(app)
      .get("/api/platform/leads")
      .set("Cookie", cookie);
    expect(
      leads.body.leads,
    ).toHaveLength(1);
  });

  it("rejects a submission missing a required field with 400", async () => {
    const { app, cookie } =
      await buildApp();
    const created = await request(app)
      .post("/api/platform/forms")
      .set("Cookie", cookie)
      .send({
        name: "Contact",
        fields: CONTACT_FIELDS,
      });
    const slug =
      created.body.form.slug;

    const res = await request(app)
      .post(
        `/api/public/forms/${slug}/submit`,
      )
      .send({
        data: { name: "No Email" },
      });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown form slug", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/f/does-not-exist",
    );
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated caller on the admin API", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/forms",
    );
    expect(res.status).toBe(401);
  });
});
