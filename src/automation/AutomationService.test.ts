import {
  describe,
  expect,
  it,
} from "vitest";

import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";
import { EmailRepository } from "../communications/EmailRepository";
import { EmailService } from "../communications/EmailService";
import type { EmailTransport } from "../communications/EmailTransport";
import type {
  EmailMessage,
  EmailResult,
} from "../communications/EmailTypes";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

import { AutomationRepository } from "./AutomationRepository";
import { AutomationService } from "./AutomationService";

class RecordingTransport
  implements EmailTransport
{
  public messages: EmailMessage[] =
    [];

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    this.messages.push(message);

    return {
      status: "logged",
      provider: "logging",
    };
  }
}

function makeLead(
  overrides: Partial<LeadRecord> = {},
): LeadRecord {
  return {
    id: "lead-1",
    name: "Jane Doe",
    email: "jane@example.com",
    company: "Acme Co.",
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createService() {
  const transport =
    new RecordingTransport();

  const emailService =
    new EmailService(
      transport,
      "Faith Harbor OS",
      new EmailRepository(),
    );

  const service =
    new AutomationService(
      emailService,
      new AutomationRepository(),
    );

  return {
    service,
    transport,
    emailService,
  };
}

describe("AutomationService", () => {
  it("prepares a pending draft when a lead is created", () => {
    const { service } =
      createService();

    const draft =
      service.onLeadCreated(
        makeLead(),
      );

    expect(draft).not.toBeNull();
    expect(draft?.status)
      .toBe("pending");
    expect(draft?.trigger)
      .toBe("lead.created");
    expect(draft?.relatedId)
      .toBe("lead-1");

    expect(service.listPending())
      .toHaveLength(1);
  });

  it("prepares an onboarding draft when a project is created", () => {
    const { service } =
      createService();

    const project: ProjectRecord = {
      id: "project-1",
      clientId: "client-1",
      name: "Church Website Rebuild",
      status: "planned",
      createdAt:
        "2026-01-01T00:00:00.000Z",
      updatedAt:
        "2026-01-01T00:00:00.000Z",
    };

    const client: ClientRecord = {
      id: "client-1",
      companyName: "Grace Chapel",
      primaryContact: "Pastor John",
      email:
        "john@gracechapel.example",
      createdAt:
        "2026-01-01T00:00:00.000Z",
      updatedAt:
        "2026-01-01T00:00:00.000Z",
    };

    const draft =
      service.onProjectCreated(
        project,
        client,
      );

    expect(draft).not.toBeNull();
    expect(draft?.status)
      .toBe("pending");
    expect(draft?.trigger)
      .toBe("project.created");
    expect(draft?.to)
      .toBe(
        "john@gracechapel.example",
      );
  });

  it("does not draft when the lead has no email", () => {
    const { service } =
      createService();

    const draft =
      service.onLeadCreated(
        makeLead({ email: undefined }),
      );

    expect(draft).toBeNull();
    expect(service.list())
      .toHaveLength(0);
  });

  it("sends the email when a draft is approved", async () => {
    const {
      service,
      transport,
      emailService,
    } = createService();

    const draft =
      service.onLeadCreated(
        makeLead(),
      );

    const approved =
      await service.approve(
        draft!.id,
      );

    expect(approved.status)
      .toBe("approved");
    expect(approved.emailId)
      .toBeDefined();

    // The email actually went through the email service.
    expect(transport.messages)
      .toHaveLength(1);
    expect(transport.messages[0].to)
      .toBe("jane@example.com");
    expect(emailService.list())
      .toHaveLength(1);

    // No longer pending once approved.
    expect(service.listPending())
      .toHaveLength(0);
  });

  it("sends nothing when a draft is dismissed", () => {
    const {
      service,
      transport,
    } = createService();

    const draft =
      service.onLeadCreated(
        makeLead(),
      );

    const dismissed =
      service.dismiss(draft!.id);

    expect(dismissed.status)
      .toBe("dismissed");
    expect(transport.messages)
      .toHaveLength(0);
    expect(service.listPending())
      .toHaveLength(0);
  });

  it("refuses to approve a draft twice", async () => {
    const { service } =
      createService();

    const draft =
      service.onLeadCreated(
        makeLead(),
      );

    await service.approve(draft!.id);

    await expect(
      service.approve(draft!.id),
    ).rejects.toThrow(
      "Only a pending draft can be approved.",
    );
  });

  it("refuses to dismiss a draft that was already approved", async () => {
    const { service } =
      createService();

    const draft =
      service.onLeadCreated(
        makeLead(),
      );

    await service.approve(draft!.id);

    expect(() =>
      service.dismiss(draft!.id),
    ).toThrow(
      "Only a pending draft can be dismissed.",
    );
  });

  it("throws for an unknown draft", async () => {
    const { service } =
      createService();

    await expect(
      service.approve("missing"),
    ).rejects.toThrow(
      "Automation draft not found.",
    );
  });

  it("drafts at most one overdue reminder per invoice", () => {
    const { service } =
      createService();

    const invoice: InvoiceRecord = {
      id: "invoice-1",
      number: "INV-0007",
      clientId: "client-1",
      status: "sent",
      currency: "USD",
      lineItems: [
        {
          description: "Work",
          quantity: 1,
          unitPrice: 500,
        },
      ],
      amount: 500,
      dueDate: "2026-06-01",
      createdAt:
        "2026-05-01T00:00:00.000Z",
      updatedAt:
        "2026-05-01T00:00:00.000Z",
    };

    const client: ClientRecord = {
      id: "client-1",
      companyName: "Grace Chapel",
      primaryContact: "Pastor John",
      email:
        "john@gracechapel.example",
      createdAt:
        "2026-01-01T00:00:00.000Z",
      updatedAt:
        "2026-01-01T00:00:00.000Z",
    };

    const first =
      service.onInvoiceOverdue(
        invoice,
        client,
      );

    const second =
      service.onInvoiceOverdue(
        invoice,
        client,
      );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(service.list())
      .toHaveLength(1);

    expect(
      service.hasDraftFor(
        "invoice.overdue",
        "invoice-1",
      ),
    ).toBe(true);
  });
});
