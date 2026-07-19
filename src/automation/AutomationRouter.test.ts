import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

/**
 * Creates a lead through the API, which triggers the automation
 * engine to prepare a welcome-email draft.
 */
async function createLeadWithEmail(
  app: ReturnType<typeof createApp>,
) {
  return request(app)
    .post("/api/v1/leads")
    .send({
      name: "Jane Doe",
      company: "Acme Co.",
      email: "jane@example.com",
      serviceInterest:
        "a church website",
    });
}

describe("AutomationRouter", () => {
  it("prepares a pending draft after a lead is created", async () => {
    const app = createApp();

    await createLeadWithEmail(app);

    const response =
      await request(app)
        .get("/api/v1/automations");

    expect(response.status)
      .toBe(200);
    expect(response.body.count)
      .toBe(1);
    expect(
      response.body.drafts[0].status,
    ).toBe("pending");
    expect(
      response.body.drafts[0].to,
    ).toBe("jane@example.com");
  });

  it("filters to pending drafts", async () => {
    const app = createApp();

    await createLeadWithEmail(app);

    const response =
      await request(app)
        .get(
          "/api/v1/automations?status=pending",
        );

    expect(response.status)
      .toBe(200);
    expect(response.body.count)
      .toBe(1);
  });

  it("approves a draft and records the email in the outbox", async () => {
    const app = createApp();

    await createLeadWithEmail(app);

    const list =
      await request(app)
        .get("/api/v1/automations");

    const draftId =
      list.body.drafts[0].id;

    const approval =
      await request(app)
        .post(
          `/api/v1/automations/${draftId}/approve`,
        );

    expect(approval.status)
      .toBe(200);
    expect(approval.body.success)
      .toBe(true);
    expect(
      approval.body.draft.status,
    ).toBe("approved");
    expect(
      approval.body.draft.emailId,
    ).toBeDefined();

    // The welcome email is now in the outbox.
    const outbox =
      await request(app)
        .get("/api/v1/emails");

    expect(outbox.body.count)
      .toBe(1);
    expect(outbox.body.emails[0].to)
      .toBe("jane@example.com");
  });

  it("dismisses a draft without sending", async () => {
    const app = createApp();

    await createLeadWithEmail(app);

    const list =
      await request(app)
        .get("/api/v1/automations");

    const draftId =
      list.body.drafts[0].id;

    const dismissal =
      await request(app)
        .post(
          `/api/v1/automations/${draftId}/dismiss`,
        );

    expect(dismissal.status)
      .toBe(200);
    expect(
      dismissal.body.draft.status,
    ).toBe("dismissed");

    const outbox =
      await request(app)
        .get("/api/v1/emails");

    expect(outbox.body.count)
      .toBe(0);
  });

  it("returns 404 for an unknown draft", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/automations/missing/approve",
        );

    expect(response.status)
      .toBe(404);
    expect(response.body.error.code)
      .toBe("DRAFT_NOT_FOUND");
  });

  it("returns 409 when approving a resolved draft", async () => {
    const app = createApp();

    await createLeadWithEmail(app);

    const list =
      await request(app)
        .get("/api/v1/automations");

    const draftId =
      list.body.drafts[0].id;

    await request(app)
      .post(
        `/api/v1/automations/${draftId}/approve`,
      );

    const second =
      await request(app)
        .post(
          `/api/v1/automations/${draftId}/approve`,
        );

    expect(second.status)
      .toBe(409);
    expect(second.body.error.code)
      .toBe("DRAFT_NOT_PENDING");
  });

  it("prepares an onboarding draft when a project is created", async () => {
    const app = createApp();

    const client =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName:
            "Grace Chapel",
          primaryContact:
            "Pastor John",
          email:
            "john@gracechapel.example",
        });

    await request(app)
      .post("/api/v1/projects")
      .send({
        clientId: client.body.id,
        name: "Church Website Rebuild",
      });

    const response =
      await request(app)
        .get("/api/v1/automations");

    const onboarding =
      response.body.drafts.find(
        (draft: {
          trigger: string;
        }) =>
          draft.trigger ===
          "project.created",
      );

    expect(onboarding)
      .toBeDefined();
    expect(onboarding.to)
      .toBe(
        "john@gracechapel.example",
      );
    expect(onboarding.status)
      .toBe("pending");
  });

  it("scans for overdue invoices and drafts reminders on demand", async () => {
    const app = createApp();

    const client =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName:
            "Grace Chapel",
          primaryContact:
            "Pastor John",
          email:
            "john@gracechapel.example",
        });

    // A sent invoice with a due date far in the past.
    await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId: client.body.id,
        status: "sent",
        dueDate: "2020-01-01",
        lineItems: [
          {
            description:
              "Website work",
            quantity: 1,
            unitPrice: 1200,
          },
        ],
      });

    const scan =
      await request(app)
        .post(
          "/api/v1/automations/scan",
        );

    expect(scan.status)
      .toBe(200);
    expect(scan.body.created)
      .toBe(1);

    const list =
      await request(app)
        .get(
          "/api/v1/automations?status=pending",
        );

    const reminder =
      list.body.drafts.find(
        (draft: {
          trigger: string;
        }) =>
          draft.trigger ===
          "invoice.overdue",
      );

    expect(reminder)
      .toBeDefined();
    expect(reminder.to)
      .toBe(
        "john@gracechapel.example",
      );

    // A second scan must not create a duplicate.
    const rescan =
      await request(app)
        .post(
          "/api/v1/automations/scan",
        );

    expect(rescan.body.created)
      .toBe(0);
  });

  it("does not draft when a lead has no email", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/leads")
      .send({
        name: "No Email Lead",
      });

    const response =
      await request(app)
        .get("/api/v1/automations");

    expect(response.body.count)
      .toBe(0);
  });
});
