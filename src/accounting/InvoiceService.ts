import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { InvoiceLineItem } from "./InvoiceLineItem";
import type { InvoiceRecord } from "./InvoiceRecord";
import { InvoiceRepository } from "./InvoiceRepository";
import type { InvoiceRequest } from "./InvoiceRequest";

/**
 * Creates and manages client invoices.
 */
export class InvoiceService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new InvoiceRepository(),
  ) {}

  /**
   * Creates and stores a new invoice.
   */
  create(
    request: InvoiceRequest,
  ): InvoiceRecord {
    // Ensure the client exists.
    this.clients.get(request.clientId);

    const lineItems =
      this.normalizeLineItems(
        request.lineItems,
      );

    const now =
      new Date().toISOString();

    const invoice: InvoiceRecord = {
      id: randomUUID(),

      number:
        request.number?.trim() ||
        this.nextInvoiceNumber(),

      clientId: request.clientId,

      projectId:
        request.projectId,

      status:
        request.status ??
        "draft",

      currency:
        request.currency?.trim() ||
        "USD",

      lineItems,

      amount:
        this.calculateTotal(
          lineItems,
        ),

      issueDate:
        request.issueDate,

      dueDate:
        request.dueDate,

      paidDate:
        request.paidDate,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      invoice,
    );
  }

  /**
   * Returns every invoice.
   */
  list(): readonly InvoiceRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one invoice.
   */
  get(
    invoiceId: string,
  ): InvoiceRecord {
    return this.repository.get(
      invoiceId,
    );
  }

  /**
   * Returns all invoices for one client.
   */
  listForClient(
    clientId: string,
  ): readonly InvoiceRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing invoice.
   *
   * The stored total is always recomputed from the line items
   * so the amount can never drift from the billed work.
   */
  update(
    invoice: InvoiceRecord,
  ): InvoiceRecord {
    this.clients.get(invoice.clientId);

    const lineItems =
      this.normalizeLineItems(
        invoice.lineItems,
      );

    return this.repository.update({
      ...invoice,
      lineItems,
      amount:
        this.calculateTotal(
          lineItems,
        ),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes an invoice.
   */
  delete(
    invoiceId: string,
  ): void {
    this.repository.delete(
      invoiceId,
    );
  }

  /**
   * Normalizes and validates line items.
   */
  private normalizeLineItems(
    lineItems: readonly InvoiceLineItem[],
  ): InvoiceLineItem[] {
    if (
      !lineItems ||
      lineItems.length === 0
    ) {
      throw new Error(
        "An invoice requires at least one line item.",
      );
    }

    return lineItems.map((item) => ({
      description:
        item.description.trim(),

      quantity: item.quantity,

      unitPrice: item.unitPrice,
    }));
  }

  /**
   * Calculates the invoice total from its line items,
   * rounded to two decimal places.
   */
  private calculateTotal(
    lineItems: readonly InvoiceLineItem[],
  ): number {
    const total = lineItems.reduce(
      (sum, item) =>
        sum +
        item.quantity *
          item.unitPrice,
      0,
    );

    return (
      Math.round(total * 100) / 100
    );
  }

  /**
   * Generates the next sequential invoice number.
   */
  private nextInvoiceNumber(): string {
    const next =
      this.repository.count() + 1;

    return `INV-${String(next).padStart(4, "0")}`;
  }
}
