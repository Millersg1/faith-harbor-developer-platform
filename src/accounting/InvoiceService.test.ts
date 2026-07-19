import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { InvoiceRepository } from "./InvoiceRepository";
import { InvoiceService } from "./InvoiceService";

function createInvoiceService() {
  const clients =
    new ClientService();

  const repository =
    new InvoiceRepository();

  const service =
    new InvoiceService(
      clients,
      repository,
    );

  return {
    service,
    clients,
    repository,
  };
}

function createClient(
  clients: ClientService,
  companyName =
    "Acme Manufacturing",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("InvoiceService", () => {
  it("creates and saves an invoice", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,

        lineItems: [
          {
            description:
              "Website Development",
            quantity: 1,
            unitPrice: 2500,
          },
        ],

        dueDate:
          "2026-08-20",

        metadata: {
          poNumber: "PO-7",
        },
      });

    expect(invoice.id)
      .toBeDefined();

    expect(invoice.clientId)
      .toBe(client.id);

    expect(invoice.number)
      .toBe("INV-0001");

    expect(invoice.status)
      .toBe("draft");

    expect(invoice.currency)
      .toBe("USD");

    expect(invoice.amount)
      .toBe(2500);

    expect(invoice.dueDate)
      .toBe("2026-08-20");

    expect(invoice.metadata)
      .toEqual({
        poNumber: "PO-7",
      });

    expect(invoice.createdAt)
      .toBeDefined();

    expect(service.list())
      .toEqual([invoice]);
  });

  it("computes the total from all line items", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,

        lineItems: [
          {
            description:
              "Consulting",
            quantity: 3,
            unitPrice: 150,
          },
          {
            description:
              "Hosting",
            quantity: 12,
            unitPrice: 20,
          },
        ],
      });

    // (3 * 150) + (12 * 20) = 450 + 240 = 690
    expect(invoice.amount)
      .toBe(690);
  });

  it("rounds the computed total to two decimals", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,

        lineItems: [
          {
            description:
              "Metered usage",
            quantity: 3,
            unitPrice: 0.335,
          },
        ],
      });

    // 3 * 0.335 = 1.005 -> 1.01
    expect(invoice.amount)
      .toBe(1.01);
  });

  it("generates sequential invoice numbers", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const first =
      service.create({
        clientId: client.id,
        lineItems: [
          {
            description: "A",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      });

    const second =
      service.create({
        clientId: client.id,
        lineItems: [
          {
            description: "B",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      });

    expect(first.number)
      .toBe("INV-0001");

    expect(second.number)
      .toBe("INV-0002");
  });

  it("honors an explicit invoice number and status", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,

        number: "  CUSTOM-1  ",

        status: "sent",

        lineItems: [
          {
            description: "Retainer",
            quantity: 1,
            unitPrice: 1000,
          },
        ],
      });

    expect(invoice.number)
      .toBe("CUSTOM-1");

    expect(invoice.status)
      .toBe("sent");
  });

  it("recomputes the total on update", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,
        lineItems: [
          {
            description: "Initial",
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });

    const updated =
      service.update({
        ...invoice,

        status: "paid",

        lineItems: [
          {
            description: "Revised",
            quantity: 4,
            unitPrice: 75,
          },
        ],
      });

    expect(updated.status)
      .toBe("paid");

    expect(updated.amount)
      .toBe(300);

    expect(
      service.get(invoice.id)
        .amount,
    ).toBe(300);
  });

  it("lists invoices for one client", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const firstClient =
      createClient(
        clients,
        "Acme Manufacturing",
      );

    const secondClient =
      createClient(
        clients,
        "Faith Harbor LLC",
      );

    const firstInvoice =
      service.create({
        clientId:
          firstClient.id,
        lineItems: [
          {
            description: "A",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      });

    service.create({
      clientId:
        secondClient.id,
      lineItems: [
        {
          description: "B",
          quantity: 1,
          unitPrice: 10,
        },
      ],
    });

    const thirdInvoice =
      service.create({
        clientId:
          firstClient.id,
        lineItems: [
          {
            description: "C",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstInvoice,
      thirdInvoice,
    ]);
  });

  it("deletes an invoice", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.create({
        clientId: client.id,
        lineItems: [
          {
            description: "A",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(invoice.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects an invoice with no line items", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    expect(() =>
      service.create({
        clientId: client.id,
        lineItems: [],
      }),
    ).toThrow(
      "An invoice requires at least one line item.",
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects an invoice for a missing client", () => {
    const {
      service,
    } = createInvoiceService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        lineItems: [
          {
            description: "A",
            quantity: 1,
            unitPrice: 10,
          },
        ],
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("drafts an invoice from a project", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.createFromProject({
        projectId:
          "project-9",
        clientId: client.id,
        projectName:
          "Website Redesign",
        amount: 2500,
      });

    expect(invoice.clientId)
      .toBe(client.id);

    expect(invoice.projectId)
      .toBe("project-9");

    expect(invoice.status)
      .toBe("draft");

    expect(invoice.amount)
      .toBe(2500);

    expect(
      invoice.lineItems[0]
        ?.description,
    ).toBe(
      "Website Redesign — services",
    );

    expect(
      invoice.metadata
        ?.fromProjectId,
    ).toBe("project-9");

    expect(invoice.number)
      .toBe("INV-0001");
  });

  it("drafts a zero-amount invoice when no amount is given", () => {
    const {
      service,
      clients,
    } = createInvoiceService();

    const client =
      createClient(clients);

    const invoice =
      service.createFromProject({
        projectId: "project-1",
        clientId: client.id,
        projectName: "Support",
      });

    expect(invoice.amount)
      .toBe(0);

    expect(
      invoice.lineItems[0]
        ?.unitPrice,
    ).toBe(0);
  });

  it("rejects drafting from a project for a missing client", () => {
    const {
      service,
    } = createInvoiceService();

    expect(() =>
      service.createFromProject({
        projectId: "project-1",
        clientId:
          "missing-client",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
