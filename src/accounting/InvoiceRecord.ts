import type { InvoiceLineItem } from "./InvoiceLineItem";
import type { InvoiceStatus } from "./InvoiceStatus";

/**
 * Represents an invoice stored by Faith Harbor OS.
 */
export interface InvoiceRecord {
  id: string;

  /**
   * Human-readable invoice number (e.g. "INV-0001").
   */
  number: string;

  /**
   * Client that owns this invoice.
   */
  clientId: string;

  /**
   * Project this invoice bills for.
   * Undefined when the invoice was created without a project.
   */
  projectId?: string;

  /**
   * Current lifecycle state.
   */
  status: InvoiceStatus;

  /**
   * Currency code (e.g. "USD").
   */
  currency: string;

  /**
   * Billable line items.
   */
  lineItems: InvoiceLineItem[];

  /**
   * Total of all line items, computed and stored for reporting.
   */
  amount: number;

  /**
   * Optional invoice dates.
   */
  issueDate?: string;
  dueDate?: string;
  paidDate?: string;

  /**
   * Internal notes.
   */
  notes?: string;

  /**
   * Extensible metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Audit timestamps.
   */
  createdAt: string;
  updatedAt: string;
}
