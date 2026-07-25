import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
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
import { PlatformReviewRepository } from "./reviews/PlatformReviewRepository";
import { PlatformReviewService } from "./reviews/PlatformReviewService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

async function build() {
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
    reviews:
      new PlatformReviewService(
        new PlatformReviewRepository(),
        clients,
      ),
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  async function signup(
    name: string,
    email: string,
  ): Promise<string[]> {
    const res = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: name,
        email,
        password: "password123",
      });

    return res.headers[
      "set-cookie"
    ] as unknown as string[];
  }

  return { app, signup };
}

describe("Reviews", () => {
  it("never leaks a review across tenants", async () => {
    const repo =
      new PlatformReviewRepository();
    const now =
      new Date().toISOString();

    await runWithTenant(
      { organizationId: "org-a" },
      () =>
        repo.create({
          id: "r1",
          author: "Bob",
          rating: 5,
          replied: false,
          createdAt: now,
          updatedAt: now,
        }),
    );

    const bList = await runWithTenant(
      { organizationId: "org-b" },
      () => repo.list(),
    );
    expect(bList).toHaveLength(0);
  });

  it("creates a review, clamps rating, and marks replied on reply", async () => {
    const { app, signup } =
      await build();
    const owner = await signup(
      "Acme",
      "owner@acme.com",
    );

    const created = await request(app)
      .post("/api/platform/reviews")
      .set("Cookie", owner)
      .send({
        author: "Happy Customer",
        rating: 9,
        source: "Google",
        comment: "Great!",
      });
    expect(created.status).toBe(201);
    // Rating clamped to 5.
    expect(
      created.body.review.rating,
    ).toBe(5);
    expect(
      created.body.review.replied,
    ).toBe(false);
    const id =
      created.body.review.id;

    const replied = await request(app)
      .patch(
        "/api/platform/reviews/" + id,
      )
      .set("Cookie", owner)
      .send({
        replyText:
          "Thank you so much!",
      });
    expect(
      replied.body.review.replied,
    ).toBe(true);
  });

  it("blocks cross-tenant access and another tenant's client", async () => {
    const { app, signup } =
      await build();
    const acme = await signup(
      "Acme",
      "owner@acme.com",
    );
    const beta = await signup(
      "Beta",
      "owner@beta.com",
    );

    const created = await request(app)
      .post("/api/platform/reviews")
      .set("Cookie", acme)
      .send({
        author: "X",
        rating: 4,
      });
    const id =
      created.body.review.id;

    const betaList = await request(app)
      .get("/api/platform/reviews")
      .set("Cookie", beta);
    expect(
      betaList.body.reviews,
    ).toHaveLength(0);

    const betaPatch =
      await request(app)
        .patch(
          "/api/platform/reviews/" +
            id,
        )
        .set("Cookie", beta)
        .send({ rating: 1 });
    expect(betaPatch.status).toBe(404);

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", acme)
      .send({ name: "Acme Client" });

    const cross = await request(app)
      .post("/api/platform/reviews")
      .set("Cookie", beta)
      .send({
        author: "Y",
        rating: 5,
        clientId:
          client.body.client.id,
      });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe(
      "UNKNOWN_CLIENT",
    );
  });
});
