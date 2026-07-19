import type { HostingAccountStatus } from "./HostingAccountStatus";

/**
 * Represents the information required to record a hosting account.
 */
export interface HostingAccountRequest {
  /**
   * Optional client that owns the account.
   */
  clientId?: string;

  /**
   * Hosting brand this account is served under.
   */
  brand?: string;

  domain: string;

  username: string;

  plan?: string;

  /**
   * Defaults to "pending" when omitted.
   */
  status?: HostingAccountStatus;

  server?: string;

  ipAddress?: string;

  diskUsedMb?: number;

  diskLimitMb?: number;

  notes?: string;

  metadata?: Record<string, unknown>;
}
