/**
 * One subscription per organization: which plan the tenant is on and the
 * state of that subscription. It is a per-org singleton (keyed by the
 * organization, like branding), not a history — plan changes overwrite it.
 *
 * `currentPeriodEnd` and the Stripe ids are populated once real billing is
 * wired; until then a subscription is simply the tenant's chosen plan.
 */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export interface OrganizationSubscriptionRecord {
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  /** ISO date the current paid period ends, or null when not billed yet. */
  currentPeriodEnd: string | null;
  /** Stripe customer id, once billing is connected. */
  stripeCustomerId: string | null;
  /** Stripe subscription id, once billing is connected. */
  stripeSubscriptionId: string | null;
  updatedAt: string;
}
