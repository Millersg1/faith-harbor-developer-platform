import type { HostingAccountStatus } from "./HostingAccountStatus";

/**
 * Represents a hosting account tracked by Faith Harbor OS.
 *
 * This is the local operational record. Live server details can be
 * reconciled from WHM through the read-only WHM client, but the
 * record itself is owned by Faith Harbor OS.
 */
export interface HostingAccountRecord {
  id: string;

  /**
   * Client that owns this hosting account.
   * Undefined when the account is not yet linked to a client.
   */
  clientId?: string;

  /**
   * Hosting brand this account is served under
   * (for example "All Elite Hosting" or "Faith Harbor Web Hosting").
   */
  brand?: string;

  /**
   * Primary domain served by the account.
   */
  domain: string;

  /**
   * cPanel username for the account.
   */
  username: string;

  /**
   * Hosting package / plan name.
   */
  plan?: string;

  /**
   * Current lifecycle state.
   */
  status: HostingAccountStatus;

  /**
   * Server label or hostname the account lives on.
   */
  server?: string;

  /**
   * Primary IP address.
   */
  ipAddress?: string;

  /**
   * Disk usage in megabytes.
   */
  diskUsedMb?: number;

  /**
   * Disk quota in megabytes.
   */
  diskLimitMb?: number;

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
