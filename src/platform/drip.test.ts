import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import type { EmailMessage } from "../communications/EmailTypes";
import type { EmailTransport } from "../communications/EmailTransport";
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
import { DripRepository } from "./drip/DripRepository";
import { DripService } from "./drip/DripService";
import { PlatformEmailRepository } from "./email/PlatformEmailRepository";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

function captureEmail() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: async (m) => {
      sent.push(m);

      return {
        status: "sent",
        provider: "stub",
      };
    },
  };
  const email =
    new PlatformEmailService(
      new PlatformEmailRepository(),
      transport,
      { connected: true },
    );

  return { sent, email };
}

describe("Drip service", () => {
  it("sends steps in order as they come due, then completes", async () => {
    const { sent, email } =
      captureEmail();
    let clock = 1_000;
    const drip = new DripService(
      new DripRepository(),
      email,
      { now: () => clock },
    );

    await runWithTenant(
      { organizationId: "org1" },
      async () => {
        const seq =
          await drip.createSequence({
            name: "Welcome",
          });
        await drip.addStep(seq.id, {
          delayHours: 0,
          subject: "Step 1",
          body: "Hi {{name}}",
        });
        await drip.addStep(seq.id, {
          delayHours: 24,
          subject: "Step 2",
          body: "Bye",
        });
        const enrollment =
          await drip.enroll(
            seq.id,
            "ann@example.com",
            "Ann",
          );
        expect(
          enrollment.stepIndex,
        ).toBe(0);
      },
    );

    // Step 1 is due immediately.
    expect(await drip.runDue()).toBe(
      1,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(
      "Step 1",
    );
    expect(sent[0].body).toContain(
      "Ann",
    ); // personalized

    // Step 2 isn't due for 24h.
    clock += 1_000;
    expect(await drip.runDue()).toBe(
      0,
    );

    clock += 24 * 60 * 60 * 1_000;
    expect(await drip.runDue()).toBe(
      1,
    );
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toBe(
      "Step 2",
    );

    // Nothing left.
    clock += 100 * 60 * 60 * 1_000;
    expect(await drip.runDue()).toBe(
      0,
    );
    expect(sent).toHaveLength(2);
  });

  it("is idempotent per active enrollment", async () => {
    const { email } = captureEmail();
    const drip = new DripService(
      new DripRepository(),
      email,
    );

    await runWithTenant(
      { organizationId: "org1" },
      async () => {
        const seq =
          await drip.createSequence({
            name: "S",
          });
        await drip.addStep(seq.id, {
          delayHours: 0,
          subject: "x",
          body: "y",
        });
        const a = await drip.enroll(
          seq.id,
          "a@b.com",
        );
        const b = await drip.enroll(
          seq.id,
          "a@b.com",
        );
        expect(b.id).toBe(a.id);
        expect(
          await drip.listEnrollments(),
        ).toHaveLength(1);
      },
    );
  });

  it("does not send while a sequence is paused", async () => {
    const { sent, email } =
      captureEmail();
    let clock = 1_000;
    const drip = new DripService(
      new DripRepository(),
      email,
      { now: () => clock },
    );

    await runWithTenant(
      { organizationId: "org1" },
      async () => {
        const seq =
          await drip.createSequence({
            name: "S",
          });
        await drip.addStep(seq.id, {
          delayHours: 0,
          subject: "x",
          body: "y",
        });
        await drip.enroll(
          seq.id,
          "a@b.com",
        );
        await drip.setStatus(
          seq.id,
          "paused",
        );
      },
    );

    clock += 10;
    expect(await drip.runDue()).toBe(
      1,
    ); // processed (deferred), but…
    expect(sent).toHaveLength(0); // …nothing sent while paused
  });

  it("auto-enrolls on a matching trigger, only for active sequences", async () => {
    const { sent, email } =
      captureEmail();
    let clock = 1_000;
    const drip = new DripService(
      new DripRepository(),
      email,
      { now: () => clock },
    );

    await runWithTenant(
      { organizationId: "org1" },
      async () => {
        const seq =
          await drip.createSequence({
            name: "Lead nurture",
            trigger: "lead_created",
          });
        await drip.addStep(seq.id, {
          delayHours: 0,
          subject: "Welcome",
          body: "Thanks for your interest",
        });

        // A manual sequence must NOT auto-enroll.
        const manual =
          await drip.createSequence({
            name: "Manual",
          });
        await drip.addStep(
          manual.id,
          {
            delayHours: 0,
            subject: "no",
            body: "no",
          },
        );

        await drip.enrollByTrigger(
          "lead_created",
          "lead@example.com",
          "Lee",
        );

        const enrollments =
          await drip.listEnrollments();
        expect(
          enrollments,
        ).toHaveLength(1);
        expect(
          enrollments[0].sequenceId,
        ).toBe(seq.id);
      },
    );

    expect(await drip.runDue()).toBe(
      1,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(
      "lead@example.com",
    );
  });

  it("keeps enrollments isolated per tenant in the worker", async () => {
    const { sent, email } =
      captureEmail();
    let clock = 1_000;
    const drip = new DripService(
      new DripRepository(),
      email,
      { now: () => clock },
    );

    for (const org of [
      "orgA",
      "orgB",
    ]) {
      await runWithTenant(
        { organizationId: org },
        async () => {
          const seq =
            await drip.createSequence(
              { name: org },
            );
          await drip.addStep(seq.id, {
            delayHours: 0,
            subject: "hi " + org,
            body: "b",
          });
          await drip.enroll(
            seq.id,
            org + "@x.com",
          );
        },
      );
    }

    // The worker processes both tenants' due enrollments.
    expect(await drip.runDue()).toBe(
      2,
    );
    const tos = sent
      .map((m) => m.to)
      .sort();
    expect(tos).toEqual([
      "orga@x.com",
      "orgb@x.com",
    ]);
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
  const { email } = captureEmail();
  const drip = new DripService(
    new DripRepository(),
    email,
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
    leads: new PlatformLeadService(
      new PlatformLeadRepository(),
      clients,
    ),
    email,
    drip,
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

describe("Drip API", () => {
  it("creates a sequence, adds a step, enrolls, and lists", async () => {
    const { app, cookie } =
      await buildApp();

    const seq = await request(app)
      .post(
        "/api/platform/drip/sequences",
      )
      .set("Cookie", cookie)
      .send({ name: "Welcome" });
    expect(seq.status).toBe(201);
    const seqId =
      seq.body.sequence.id;

    // Can't enroll before there's a step.
    const early = await request(app)
      .post(
        `/api/platform/drip/sequences/${seqId}/enroll`,
      )
      .set("Cookie", cookie)
      .send({ email: "a@b.com" });
    expect(early.status).toBe(400);

    const step = await request(app)
      .post(
        `/api/platform/drip/sequences/${seqId}/steps`,
      )
      .set("Cookie", cookie)
      .send({
        delayHours: 0,
        subject: "Hi",
        body: "Welcome!",
      });
    expect(step.status).toBe(201);

    const enroll = await request(app)
      .post(
        `/api/platform/drip/sequences/${seqId}/enroll`,
      )
      .set("Cookie", cookie)
      .send({
        email: "a@b.com",
        name: "Ann",
      });
    expect(enroll.status).toBe(201);

    const list = await request(app)
      .get(
        "/api/platform/drip/enrollments",
      )
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(
      list.body.enrollments,
    ).toHaveLength(1);

    const seqs = await request(app)
      .get(
        "/api/platform/drip/sequences",
      )
      .set("Cookie", cookie);
    expect(
      seqs.body.sequences[0].steps,
    ).toHaveLength(1);
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();

    const res = await request(app)
      .get(
        "/api/platform/drip/sequences",
      );
    expect(res.status).toBe(401);
  });
});
