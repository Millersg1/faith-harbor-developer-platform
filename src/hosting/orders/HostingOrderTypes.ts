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
