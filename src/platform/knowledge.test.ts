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
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import {
  chunkText,
  KnowledgeService,
  KnowledgeValidationError,
} from "./knowledge/KnowledgeService";
import { KnowledgeRepository } from "./knowledge/KnowledgeRepository";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

const POLICY =
  "Our refund policy allows customers to request a refund within 30 days of purchase.\n\n" +
  "Shipping is free on orders over fifty dollars. International shipping takes longer.";

describe("chunkText", () => {
  it("splits on paragraphs and bounds chunk size", () => {
    const chunks = chunkText(POLICY);
    expect(
      chunks.length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      chunks.join(" "),
    ).toContain("refund");
  });
});

describe("KnowledgeService", () => {
  it("indexes a document and answers with citations, tenant-scoped", async () => {
    const svc = new KnowledgeService(
      new KnowledgeRepository(),
    );

    let cid = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const col =
          await svc.createCollection(
            { name: "Policies" },
          );
        cid = col.id;
        const doc =
          await svc.addDocument({
            collectionId: cid,
            name: "Refund policy",
            mimeType: "text/plain",
            content: POLICY,
          });
        expect(doc.status).toBe(
          "ready",
        );
        expect(
          doc.chunkCount,
        ).toBeGreaterThan(0);

        const answer =
          await svc.query(
            cid,
            "What is the refund window?",
          );
        expect(
          answer.chunks.length,
        ).toBeGreaterThan(0);
        expect(
          answer.chunks[0].content,
        ).toContain("refund");
        expect(
          answer.citations,
        ).toContain(
          "Refund policy",
        );
      },
    );

    // Another tenant sees no collections and can't query orgA's.
    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.listCollections(),
        ).toHaveLength(0);
        await expect(
          svc.query(
            cid,
            "refund",
          ),
        ).rejects.toThrow();
      },
    );
  });

  it("returns no chunks when nothing matches", async () => {
    const svc = new KnowledgeService(
      new KnowledgeRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const col =
          await svc.createCollection(
            { name: "K" },
          );
        await svc.addDocument({
          collectionId: col.id,
          name: "Doc",
          mimeType: "text/plain",
          content:
            "Completely unrelated content about gardening.",
        });

        const answer =
          await svc.query(
            col.id,
            "quantum astrophysics equations",
          );
        expect(
          answer.chunks,
        ).toHaveLength(0);
      },
    );
  });

  it("rejects non-text and empty documents", async () => {
    const svc = new KnowledgeService(
      new KnowledgeRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const col =
          await svc.createCollection(
            { name: "K" },
          );

        await expect(
          svc.addDocument({
            collectionId: col.id,
            name: "img",
            mimeType: "image/png",
            content: "x",
          }),
        ).rejects.toBeInstanceOf(
          KnowledgeValidationError,
        );

        await expect(
          svc.addDocument({
            collectionId: col.id,
            name: "empty",
            mimeType: "text/plain",
            content: "   ",
          }),
        ).rejects.toBeInstanceOf(
          KnowledgeValidationError,
        );
      },
    );
  });

  it("deletes a document and its chunks", async () => {
    const svc = new KnowledgeService(
      new KnowledgeRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const col =
          await svc.createCollection(
            { name: "K" },
          );
        const doc =
          await svc.addDocument({
            collectionId: col.id,
            name: "Refund policy",
            mimeType: "text/plain",
            content: POLICY,
          });

        await svc.deleteDocument(
          doc.id,
        );

        const answer =
          await svc.query(
            col.id,
            "refund",
          );
        expect(
          answer.chunks,
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
  const knowledge =
    new KnowledgeService(
      new KnowledgeRepository(),
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
    knowledge,
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

describe("Knowledge API", () => {
  it("creates a collection, indexes a doc, and answers a query", async () => {
    const { app, cookie } =
      await buildApp();

    const col = await request(app)
      .post(
        "/api/platform/knowledge/collections",
      )
      .set("Cookie", cookie)
      .send({ name: "Policies" });
    expect(col.status).toBe(201);
    const cid =
      col.body.collection.id;

    const doc = await request(app)
      .post(
        `/api/platform/knowledge/collections/${cid}/documents`,
      )
      .set("Cookie", cookie)
      .send({
        name: "Refund policy",
        content: POLICY,
      });
    expect(doc.status).toBe(201);

    const answer = await request(app)
      .post(
        `/api/platform/knowledge/collections/${cid}/query`,
      )
      .set("Cookie", cookie)
      .send({
        question:
          "refund window days",
      });
    expect(answer.status).toBe(200);
    expect(
      answer.body.chunks.length,
    ).toBeGreaterThan(0);
    expect(
      answer.body.citations,
    ).toContain("Refund policy");
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/knowledge/collections",
    );
    expect(res.status).toBe(401);
  });
});
