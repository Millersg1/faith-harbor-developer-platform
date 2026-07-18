import {
  describe,
  expect,
  it,
} from "vitest";

import { InvoiceRepository } from "./InvoiceRepository";
import type { InvoiceStatus } from "./InvoiceStatus";

function createInvoice(
  repository: InvoiceRepository,
  overrides: Partial<{
    id: string;
    number: string;
    clientId: string;
    projectId: string;
    status: InvoiceStatus;
    amount: number;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "invoice-1",

    number:
      overrides.number ??
      "INV-0001",

    clientId:
      overrides.clientId ??
      "client-1",

    projectId:
      overrides.projectId,

    status:
      overrides.status ??
      "draft",

    currency: "USD",

    lineItems: [
      {
        description:
          "Managed IT Services",
        quantity: 2,
        unitPrice: 125,
      },
    ],

    amount:
      overrides.amount ?? 250,

    metadata: {
      poNumber: "PO-42",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("InvoiceRepository", () => {
  it("stores and retrieves invoices", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const invoice =
      repository.get("invoice-1");

    expect(invoice.number).toBe(
      "INV-0001",
    );

    expect(invoice.clientId).toBe(
      "client-1",
    );

    expect(invoice.amount).toBe(250);

    expect(
      invoice.lineItems,
    ).toHaveLength(1);

    expect(
      invoice.lineItems[0]
        ?.description,
    ).toBe("Managed IT Services");
  });

  it("stores an invoice linked to a project", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository, {
      projectId: "project-1",
    });

    const invoice =
      repository.get("invoice-1");

    expect(invoice.projectId).toBe(
      "project-1",
    );
  });

  it("lists invoices for one client", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository, {
      id: "invoice-1",
      clientId: "client-1",
    });

    createInvoice(repository, {
      id: "invoice-2",
      clientId: "client-2",
    });

    createInvoice(repository, {
      id: "invoice-3",
      clientId: "client-1",
    });

    const invoices =
      repository.findByClientId(
        "client-1",
      );

    expect(invoices).toHaveLength(2);

    expect(
      invoices.every(
        (invoice) =>
          invoice.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("counts stored invoices", () => {
    const repository =
      new InvoiceRepository();

    expect(repository.count()).toBe(
      0,
    );

    createInvoice(repository, {
      id: "invoice-1",
    });

    createInvoice(repository, {
      id: "invoice-2",
    });

    expect(repository.count()).toBe(
      2,
    );
  });

  it("updates an invoice", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository);

    const existing =
      repository.get("invoice-1");

    const updated =
      repository.update({
        ...existing,

        status: "paid",

        amount: 500,

        paidDate:
          "2026-07-20",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "paid",
    );

    const stored =
      repository.get("invoice-1");

    expect(stored.status).toBe(
      "paid",
    );

    expect(stored.amount).toBe(500);

    expect(stored.paidDate).toBe(
      "2026-07-20",
    );
  });

  it("stores invoice metadata", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository);

    const invoice =
      repository.get("invoice-1");

    expect(invoice.metadata).toEqual({
      poNumber: "PO-42",
    });
  });

  it("deletes an invoice", () => {
    const repository =
      new InvoiceRepository();

    createInvoice(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("invoice-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when an invoice is missing", () => {
    const repository =
      new InvoiceRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Invoice "missing" was not found.',
    );
  });
});
