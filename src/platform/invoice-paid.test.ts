import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { createPlatformApp } from "./createPlatformApp";
import { ActivityEventRepository } from "./events/ActivityEventRepository";
import { ActivityService } from "./events/ActivityService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

async function buildApp(seen: string[]) {
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
  const activity = new ActivityService(
    new ActivityEventRepository(),
  );
  activity.subscribe(async (e) => {
    seen.push(e.type);
  });

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
    activity,
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
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
  const cookie =
    signup.headers["set-cookie"];

  const client = await request(app)
    .post("/api/platform/clients")
    .set("Cookie", cookie)
    .send({ name: "Client A" });
  const invoice = await request(app)
    .post("/api/platform/invoices")
    .set("Cookie", cookie)
    .send({
      clientId: client.body.client.id,
      lineItems: [
        {
          description: "Work",
          quantity: 1,
          unitAmount: 100,
        },
      ],
    });

  return {
    app,
    cookie,
    invoiceId: invoice.body.invoice.id,
  };
}

describe("invoice mark-paid", () => {
  it("emits invoice.paid once on the transition to paid", async () => {
    const seen: string[] = [];
    const { app, cookie, invoiceId } =
      await buildApp(seen);

    const first = await request(app)
      .patch(
        `/api/platform/invoices/${invoiceId}`,
      )
      .set("Cookie", cookie)
      .send({ status: "paid" });
    expect(first.status).toBe(200);
    expect(
      first.body.invoice.status,
    ).toBe("paid");

    // Marking paid again must NOT re-emit (no double workflow/drip trigger).
    await request(app)
      .patch(
        `/api/platform/invoices/${invoiceId}`,
      )
      .set("Cookie", cookie)
      .send({ status: "paid" });

    expect(
      seen.filter(
        (t) => t === "invoice.paid",
      ),
    ).toHaveLength(1);
  });

  it("404s an unknown invoice", async () => {
    const seen: string[] = [];
    const { app, cookie } =
      await buildApp(seen);

    const res = await request(app)
      .patch(
        "/api/platform/invoices/nope",
      )
      .set("Cookie", cookie)
      .send({ status: "paid" });
    expect(res.status).toBe(404);
  });
});
