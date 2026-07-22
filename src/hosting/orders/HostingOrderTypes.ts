export type HostingBillingCycle =
  | "monthly"
  | "yearly";

export type HostingOrderStatus =
  | "pending"
  | "provisioned"
  | "failed";

/**
 * A hosting order links a paid invoice to everything needed to
 * provision the account. When the invoice is paid, the account is
 * created automatically from these details.
 */
export interface HostingOrderRecord {
  id: string;

  clientId: string;

  planId: string;

  domain: string;

  contactEmail: string;

  brandId?: string;

  billingCycle: HostingBillingCycle;

  /**
   * The invoice whose payment triggers provisioning.
   */
  invoiceId: string;

  status: HostingOrderStatus;

  /**
   * The cPanel username, set once provisioned.
   */
  username?: string;

  /**
   * The reason provisioning failed, if it did.
   */
  error?: string;

  // ---- Recurring billing ----

  /**
   * Whether the hosting term renews automatically. Defaults to true.
   * When false, the account runs to the end of its paid term and is not
   * auto-invoiced or auto-suspended.
   */
  autoRenew?: boolean;

  /**
   * When the current paid term ends (ISO date). Set once provisioned,
   * advanced each time a renewal is paid. The renewal engine acts on
   * this date.
   */
  nextDueDate?: string;

  /**
   * When the most recent renewal was paid (ISO date).
   */
  lastRenewedAt?: string;

  /**
   * The currently outstanding renewal invoice, if one has been raised
   * for the upcoming term. Cleared when paid.
   */
  renewalInvoiceId?: string;

  /**
   * The highest reminder stage already sent for the current renewal
   * invoice (0 none, 1 upcoming, 2 overdue, 3 final notice). Prevents
   * sending the same reminder twice. Reset when a renewal is paid.
   */
  lastReminderStage?: number;

  createdAt: string;

  updatedAt: string;
}

export interface CreateHostingOrderRequest {
  clientId: string;
  planId?: string;
  planSlug?: string;
  domain: string;
  contactEmail: string;
  brandId?: string;
  billingCycle?: HostingBillingCycle;
}
