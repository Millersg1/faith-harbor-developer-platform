/**
 * A hosting account (a hosted website) belonging to one organization —
 * the tenant-scoped port of the legacy Faith Harbor hosting account onto
 * the All Elite Cloud platform. All Elite Hosting is the featured product,
 * so this is the first legacy module to move onto the tenant template.
 *
 * Like every platform record it carries `organizationId` (stamped from the
 * tenant context, never the caller). A `clientId`, when present, must
 * belong to the *same* organization — the service enforces that, so a
 * hosting account can never reference another tenant's client.
 *
 * Operational fields (cPanel username, server, IP, disk usage) are added
 * with the provisioning port; this first increment is the tenant-facing
 * record: which site, for which client, on which plan, in what state.
 */
export type PlatformHostingStatus =
  | "pending"
  | "active"
  | "suspended"
  | "cancelled";

export interface PlatformHostingAccountRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  /** Primary domain served by the account. */
  domain: string;
  /** Hosting package / plan name (free text until the plan catalog ports). */
  plan?: string;
  status: PlatformHostingStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformHostingRequest {
  domain: string;
  clientId?: string;
  plan?: string;
  status?: PlatformHostingStatus;
  notes?: string;
}

export interface UpdatePlatformHostingRequest {
  domain?: string;
  clientId?: string | null;
  plan?: string;
  status?: PlatformHostingStatus;
  notes?: string;
}

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Normalizes a domain: lowercased, trimmed, port and trailing dot removed.
 */
export function normalizeHostingDomain(
  raw: string,
): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/\.+$/, "");
}

/** True when the value looks like a valid fully-qualified domain name. */
export function isValidHostingDomain(
  domain: string,
): boolean {
  return DOMAIN_RE.test(domain);
}
