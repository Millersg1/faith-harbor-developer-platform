/**
 * Represents a single billable line on an invoice.
 */
export interface InvoiceLineItem {
  /**
   * Description of the product or service.
   */
  description: string;

  /**
   * Number of units billed. Must be zero or greater.
   */
  quantity: number;

  /**
   * Price per unit in the invoice currency.
   */
  unitPrice: number;
}
