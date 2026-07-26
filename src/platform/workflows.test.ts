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
import { ActivityEventRepository } from "./events/ActivityEventRepository";
import { ActivityService } from "./events/ActivityService";
import { PlatformEmailRepository } from "./email/PlatformEmailRepository";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { NotificationRepository } from "./notifications/NotificationRepository";
import { NotificationService } from "./notifications/NotificationService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { WorkflowRepository } from "./workflows/WorkflowRepository";
import { WorkflowService } from "./workflows/WorkflowService";
import type { WorkflowStep } from "./workflows/WorkflowTypes";

function step(
  type: WorkflowStep["type"],
  config: Record<string, unknown> = {},
  delayHours = 0,
): WorkflowStep {
  return {
    id: "s",
    type,
    delayHours,
    config,
  };
}

describe("WorkflowService", () => {
  it("starts a run on a matching trigger and runs a notify step to completion", async () => {
    const activity =
      new ActivityService(
        new ActivityEventRepository(),
      );
    const notifications =
      new NotificationService(
        new NotificationRepository(),
      );
    let clock = 1_000;
    const wf = new WorkflowService(
      new WorkflowRepository(),
      {
        notifications,
        activity,
        resolveNotifyRecipients:
          async () => ["u1"],
        now: () => clock,
      },
    );
    activity.subscribe(
      wf.handleEvent,
    );

    let workflowId = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const w = await wf.create({
          name: "Notify on lead",
          trigger: "lead.created",
          steps: [
            step("notify", {
              title: "New lead",
              body: "b",
            }),
          ],
        });
        workflowId = w.id;

        await activity.record({
          type: "lead.created",
          subjectType: "lead",
          subjectId: "l1",
          title: "Lead added",
          metadata: {
            email: "a@b.com",
            name: "Ann",
          },
        });

        const runs =
          await wf.listRuns(
            workflowId,
          );
        expect(runs).toHaveLength(1);
        expect(runs[0].status).toBe(
          "running",
        );
      },
    );

    expect(await wf.runDue()).toBe(1);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const runs =
          await wf.listRuns(
            workflowId,
          );
        expect(runs[0].status).toBe(
          "completed",
        );
        expect(
          await notifications.unreadCount(
            "u1",
          ),
        ).toBe(1);
      },
    );
  });

  it("runs an email step to the event's contact", async () => {
    const activity =
      new ActivityService(
        new ActivityEventRepository(),
      );
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
    const wf = new WorkflowService(
      new WorkflowRepository(),
      { email, activity },
    );
    activity.subscribe(
      wf.handleEvent,
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await wf.create({
          name: "Welcome email",
          trigger: "lead.created",
          steps: [
            step("email", {
              subject: "Welcome",
              body: "Hi {{name}}",
            }),
          ],
        });
        await activity.record({
          type: "lead.created",
          subjectType: "lead",
          subjectId: "l1",
          title: "Lead added",
          metadata: {
            email:
              "dana@example.com",
            name: "Dana",
          },
        });
      },
    );

    await wf.runDue();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(
      "dana@example.com",
    );
    expect(sent[0].body).toContain(
      "Dana",
    );
  });

  it("does not start runs for paused workflows or its own events (loop-safe)", async () => {
    const activity =
      new ActivityService(
        new ActivityEventRepository(),
      );
    const wf = new WorkflowService(
      new WorkflowRepository(),
      { activity },
    );
    activity.subscribe(
      wf.handleEvent,
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const paused =
          await wf.create({
            name: "Paused",
            trigger: "lead.created",
            steps: [step("note")],
          });
        await wf.update(paused.id, {
          status: "paused",
        });

        // Loop-safe: a workflow triggering on its own event type.
        const loop = await wf.create({
          name: "Loop",
          trigger: "workflow.note",
          steps: [step("note")],
        });

        await activity.record({
          type: "lead.created",
          title: "Lead added",
        });
        await activity.record({
          type: "workflow.note",
          title: "note",
        });

        expect(
          await wf.listRuns(
            paused.id,
          ),
        ).toHaveLength(0);
        expect(
          await wf.listRuns(loop.id),
        ).toHaveLength(0);
      },
    );
  });

  it("keeps workflows and runs isolated per tenant", async () => {
    const activity =
      new ActivityService(
        new ActivityEventRepository(),
      );
    const wf = new WorkflowService(
      new WorkflowRepository(),
      { activity },
    );
    activity.subscribe(
      wf.handleEvent,
    );

    let idA = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        idA = (
          await wf.create({
            name: "A",
            trigger: "lead.created",
            steps: [step("note")],
          })
        ).id;
      },
    );

    // An event in orgB must not start orgA's workflow.
    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        await activity.record({
          type: "lead.created",
          title: "Lead",
        });
        expect(
          await wf.list(),
        ).toHaveLength(0);
      },
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        expect(
          await wf.listRuns(idA),
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
  const workflows =
    new WorkflowService(
      new WorkflowRepository(),
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
    workflows,
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

describe("Workflows API", () => {
  it("creates and lists a workflow", async () => {
    const { app, cookie } =
      await buildApp();

    const created = await request(app)
      .post("/api/platform/workflows")
      .set("Cookie", cookie)
      .send({
        name: "Notify on lead",
        trigger: "lead.created",
        steps: [
          {
            id: "s",
            type: "notify",
            delayHours: 0,
            config: {
              title: "New lead",
            },
          },
        ],
      });
    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/platform/workflows")
      .set("Cookie", cookie);
    expect(
      list.body.workflows,
    ).toHaveLength(1);
    expect(
      list.body.workflows[0].trigger,
    ).toBe("lead.created");
  });

  it("rejects an invalid workflow with 400", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post("/api/platform/workflows")
      .set("Cookie", cookie)
      .send({ name: "No trigger" });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/workflows",
    );
    expect(res.status).toBe(401);
  });
});
