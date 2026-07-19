import {
  describe,
  expect,
  it,
} from "vitest";

import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";
import { EmailRepository } from "../communications/EmailRepository";
import { EmailService } from "../communications/EmailService";
import { LoggingEmailTransport } from "../communications/EmailTransport";
import type { ProjectRecord } from "../projects/ProjectRecord";
import type { LeadRecord } from "../sales/LeadRecord";

import { AutomationRepository } from "./AutomationRepository";
import { AutomationScanner } from "./AutomationScanner";
import { AutomationService } from "./AutomationService";

function makeInvoice(
  overrides: Partial<InvoiceRecord> = {},
): InvoiceRecord {
  return {
    id: "invoice-1",
    number: "INV-0007",
    clientId: "client-1",
    status: "sent",
    currency: "USD",
    lineItems: [
      {
        description: "Website work",
        quantity: 1,
        unitPrice: 1200,
      },
    ],
    amount: 1200,
    dueDate: "2026-06-01",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const client: ClientRecord = {
  id: "client-1",
  companyName: "Grace Chapel",
  primaryContact: "Pastor John",
  email: "john@gracechapel.example",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createScanner(
  invoices: InvoiceRecord[],
  options: {
    leads?: LeadRecord[];
    projects?: ProjectRecord[];
    leadQuietDays?: number;
    projectStalledDays?: number;
  } = {},
) {
  const automation =
    new AutomationService(
      new EmailService(
        new LoggingEmailTransport(),
        "Faith Harbor OS",
        new EmailRepository(),
      ),
      new AutomationRepository(),
    );

  const scanner =
    new AutomationScanner(
      {
        list: () => invoices,
      },
      {
        get: (id) => {
          if (id !== client.id) {
            throw new Error(
              "Client not found.",
            );
          }

          return client;
        },
      },
      automation,
      {
        leads: options.leads
          ? {
              list: () =>
                options.leads!,
            }
          : undefined,
        projects: options.projects
          ? {
              list: () =>
                options.projects!,
            }
          : undefined,
        leadQuietDays:
          options.leadQuietDays,
        projectStalledDays:
          options.projectStalledDays,
      },
    );

  return { scanner, automation };
}

function makeLead(
  overrides: Partial<LeadRecord> = {},
): LeadRecord {
  return {
    id: "lead-1",
    name: "Jane Doe",
    email: "jane@example.com",
    company: "Acme Co.",
    status: "contacted",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  return {
    id: "project-1",
    clientId: "client-1",
    name: "Church Website Rebuild",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// A fixed "today" well after the sample due dates.
const today =
  new Date("2026-07-19T12:00:00.000Z");

describe("AutomationScanner", () => {
  it("drafts a reminder for a sent, past-due, unpaid invoice", () => {
    const { scanner, automation } =
      createScanner([makeInvoice()]);

    const created =
      scanner.run(today);

    expect(created).toBe(1);

    const drafts =
      automation.listPending();

    expect(drafts).toHaveLength(1);
    expect(drafts[0].trigger)
      .toBe("invoice.overdue");
    expect(drafts[0].relatedId)
      .toBe("invoice-1");
  });

  it("does not draft twice for the same invoice across scans", () => {
    const { scanner, automation } =
      createScanner([makeInvoice()]);

    expect(scanner.run(today))
      .toBe(1);

    // A second scan finds the same invoice but must not re-nag.
    expect(scanner.run(today))
      .toBe(0);

    expect(automation.list())
      .toHaveLength(1);
  });

  it("ignores paid invoices", () => {
    const { scanner } =
      createScanner([
        makeInvoice({
          status: "paid",
          paidDate: "2026-06-10",
        }),
      ]);

    expect(scanner.run(today))
      .toBe(0);
  });

  it("ignores draft invoices that were never sent", () => {
    const { scanner } =
      createScanner([
        makeInvoice({
          status: "draft",
        }),
      ]);

    expect(scanner.run(today))
      .toBe(0);
  });

  it("ignores invoices that are not yet due", () => {
    const { scanner } =
      createScanner([
        makeInvoice({
          dueDate: "2026-12-31",
        }),
      ]);

    expect(scanner.run(today))
      .toBe(0);
  });

  it("skips an invoice whose client no longer exists", () => {
    const { scanner } =
      createScanner([
        makeInvoice({
          clientId: "ghost",
        }),
      ]);

    expect(scanner.run(today))
      .toBe(0);
  });

  it("treats an overdue status the same as sent", () => {
    const { scanner } =
      createScanner([
        makeInvoice({
          status: "overdue",
        }),
      ]);

    expect(scanner.run(today))
      .toBe(1);
  });
});

describe("AutomationScanner quiet leads", () => {
  it("drafts a follow-up for an open, long-quiet lead", () => {
    const { scanner, automation } =
      createScanner([], {
        leads: [makeLead()],
      });

    expect(scanner.run(today))
      .toBe(1);

    const drafts =
      automation.listPending();

    expect(drafts).toHaveLength(1);
    expect(drafts[0].trigger)
      .toBe("lead.quiet");
  });

  it("ignores a lead updated recently", () => {
    const { scanner } =
      createScanner([], {
        leads: [
          makeLead({
            updatedAt:
              "2026-07-18T00:00:00.000Z",
          }),
        ],
      });

    expect(scanner.run(today))
      .toBe(0);
  });

  it("ignores won and lost leads", () => {
    const { scanner } =
      createScanner([], {
        leads: [
          makeLead({
            id: "won",
            status: "won",
          }),
          makeLead({
            id: "lost",
            status: "lost",
          }),
        ],
      });

    expect(scanner.run(today))
      .toBe(0);
  });

  it("does not follow up the same lead twice", () => {
    const { scanner } =
      createScanner([], {
        leads: [makeLead()],
      });

    expect(scanner.run(today))
      .toBe(1);
    expect(scanner.run(today))
      .toBe(0);
  });
});

describe("AutomationScanner stalled projects", () => {
  it("drafts a check-in for an active, long-stalled project", () => {
    const { scanner, automation } =
      createScanner([], {
        projects: [makeProject()],
      });

    expect(scanner.run(today))
      .toBe(1);

    const drafts =
      automation.listPending();

    expect(drafts).toHaveLength(1);
    expect(drafts[0].trigger)
      .toBe("project.stalled");
  });

  it("ignores completed and archived projects", () => {
    const { scanner } =
      createScanner([], {
        projects: [
          makeProject({
            id: "done",
            status: "completed",
          }),
          makeProject({
            id: "old",
            status: "archived",
          }),
        ],
      });

    expect(scanner.run(today))
      .toBe(0);
  });

  it("ignores a project updated recently", () => {
    const { scanner } =
      createScanner([], {
        projects: [
          makeProject({
            updatedAt:
              "2026-07-18T00:00:00.000Z",
          }),
        ],
      });

    expect(scanner.run(today))
      .toBe(0);
  });

  it("skips a project whose client is missing", () => {
    const { scanner } =
      createScanner([], {
        projects: [
          makeProject({
            clientId: "ghost",
          }),
        ],
      });

    expect(scanner.run(today))
      .toBe(0);
  });
});
