/**
 * Represents the lifecycle of an invoice.
 *
 * draft
 *   Invoice is being prepared and has not been sent.
 *
 * sent
 *   Invoice has been issued to the client.
 *
 * paid
 *   Payment has been received in full.
 *
 * overdue
 *   Payment is past the due date.
 *
 * void
 *   Invoice has been cancelled and is retained for the record.
 */
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "void";
