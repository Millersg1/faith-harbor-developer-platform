import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  calculateInvoiceAmount,
  type CreatePlatformInvoiceRequest,
  type PlatformInvoiceLineItem,
  type PlatformInvoiceRecord,
  type UpdatePlatformInvoiceRequest,
} from "./PlatformInvoice";
import { PlatformInvoiceRepository } from "./PlatformInvoiceRepository";

/**
 * Manages invoices for the acting tenant.
 *
 * Invoice numbers are sequential *within* each organization (so every
 * tenant starts at INV-0001), amounts are always derived from the line
 * items, and a billed client — if any — must belong to the same tenant.
 */
export class PlatformInvoiceService {
  constructor(
    private readonly repository =
      new PlatformInvoiceRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformInvoiceRequest,
  ): Promise<PlatformInvoiceRecord> {
    const lineItems =
      normalizeLineItems(
        request.lineItems,
      );

    if (request.clientId) {
      await this.assertClientInTenant(
        request.clientId,
      );
    }

    const number =
      await this.nextNumber();

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      number,
      clientId: request.clientId,
      status:
        request.status ?? "draft",
      currency:
        request.currency?.trim() ||
        "USD",
      lineItems,
      amount:
        calculateInvoiceAmount(
          lineItems,
        ),
      issueDate: request.issueDate,
      dueDate: request.dueDate,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformInvoiceRecord> {
    const invoice =
      await this.repository.get(id);

    if (!invoice) {
      throw new Error(
        "Invoice not found.",
      );
    }

    return invoice;
  }

  async list(): Promise<
    readonly PlatformInvoiceRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformInvoiceRequest,
  ): Promise<PlatformInvoiceRecord> {
    const existing =
      await this.get(id);

    const lineItems = changes.lineItems
      ? normalizeLineItems(
          changes.lineItems,
        )
      : existing.lineItems;

    const dueDate =
      changes.dueDate === null
        ? undefined
        : (changes.dueDate ??
          existing.dueDate);

    const paidDate =
      changes.paidDate === null
        ? undefined
        : (changes.paidDate ??
          existing.paidDate);

    const updated: PlatformInvoiceRecord =
      {
        ...existing,
        status:
          changes.status ??
          existing.status,
        lineItems,
        // Recompute so the total never drifts from the line items.
        amount:
          calculateInvoiceAmount(
            lineItems,
          ),
        dueDate,
        paidDate,
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * The next invoice number for the current tenant, e.g. INV-0001.
   */
  private async nextNumber(): Promise<string> {
    const count =
      await this.repository.countForTenant();

    return `INV-${String(count + 1).padStart(4, "0")}`;
  }

  private async assertClientInTenant(
    clientId: string,
  ): Promise<void> {
    if (!this.clients) {
      throw new Error(
        "Cannot bill a client: client service is unavailable.",
      );
    }

    await this.clients.get(clientId);
  }
}

/**
 * Validates and trims line items; an invoice must bill something.
 */
function normalizeLineItems(
  lineItems: readonly PlatformInvoiceLineItem[],
): PlatformInvoiceLineItem[] {
  if (
    !lineItems ||
    lineItems.length === 0
  ) {
    throw new Error(
      "An invoice requires at least one line item.",
    );
  }

  return lineItems.map((item) => {
    const description =
      item.description.trim();

    if (!description) {
      throw new Error(
        "Each line item requires a description.",
      );
    }

    return {
      description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  });
}
