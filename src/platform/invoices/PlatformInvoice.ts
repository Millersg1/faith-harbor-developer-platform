export type PlatformInvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "void";

export interface PlatformInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * An invoice belonging to one organization, optionally billed to one of
 * that organization's clients.
 *
 * `number` is unique per organization (each tenant has its own INV-####
 * sequence), and `amount` is always the sum of the line items, never a
 * free-standing figure. Like every platform record, `organizationId` is
 * stamped from the tenant context.
 */
export interface PlatformInvoiceRecord {
  id: string;

  organizationId: string;

  number: string;

  clientId?: string;

  status: PlatformInvoiceStatus;

  currency: string;

  lineItems: PlatformInvoiceLineItem[];

  amount: number;

  issueDate?: string;

  dueDate?: string;

  paidDate?: string;

  createdAt: string;

  updatedAt: string;
}

export interface CreatePlatformInvoiceRequest {
  clientId?: string;
  status?: PlatformInvoiceStatus;
  currency?: string;
  lineItems: PlatformInvoiceLineItem[];
  issueDate?: string;
  dueDate?: string;
}

export interface UpdatePlatformInvoiceRequest {
  status?: PlatformInvoiceStatus;
  lineItems?: PlatformInvoiceLineItem[];
  dueDate?: string | null;
  paidDate?: string | null;
}

/**
 * Sums line items into a total, rounded to cents, so an invoice amount
 * can never drift from what it bills.
 */
export function calculateInvoiceAmount(
  lineItems: readonly PlatformInvoiceLineItem[],
): number {
  const total = lineItems.reduce(
    (sum, item) =>
      sum +
      item.quantity * item.unitPrice,
    0,
  );

  return Math.round(total * 100) / 100;
}
