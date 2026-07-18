import type { InvoiceLineItem } from "./InvoiceLineItem";
import type { InvoiceStatus } from "./InvoiceStatus";

/**
 * Represents the information required to create an invoice.
 */
export interface InvoiceRequest {
  clientId: string;

  /**
   * Optional project this invoice bills for.
   */
  projectId?: string;

  /**
   * Optional invoice number. Generated when omitted.
   */
  number?: string;

  /**
   * Defaults to "draft" when omitted.
   */
  status?: InvoiceStatus;

  /**
   * Defaults to "USD" when omitted.
   */
  currency?: string;

  /**
   * Billable line items. At least one is required.
   */
  lineItems: InvoiceLineItem[];

  issueDate?: string;
  dueDate?: string;
  paidDate?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}
