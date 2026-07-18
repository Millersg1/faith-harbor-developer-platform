/**
 * Represents the lifecycle of a hosting account.
 *
 * pending
 *   The account has been recorded but is not yet provisioned.
 *
 * active
 *   The account is live and serving the site.
 *
 * suspended
 *   The account is temporarily disabled.
 *
 * cancelled
 *   The account is retained for the record but no longer served.
 */
export type HostingAccountStatus =
  | "pending"
  | "active"
  | "suspended"
  | "cancelled";
