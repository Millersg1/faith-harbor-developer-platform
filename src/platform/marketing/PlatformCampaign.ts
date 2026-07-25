/**
 * A marketing campaign in one organization — the tenant-scoped port of the
 * legacy Faith Harbor campaign onto All Elite Cloud.
 *
 * Carries `organizationId` (stamped from tenant context, never the caller). A
 * `clientId`, when present, must belong to the same organization — the
 * service enforces it, so a campaign can never reference another tenant's
 * client.
 */
export type PlatformCampaignStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";

export interface PlatformCampaignRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  name: string;
  /** Channel, e.g. "Email", "Facebook", "Google", "SEO". */
  channel?: string;
  status: PlatformCampaignStatus;
  audience?: string;
  /** Planned budget, whole dollars. */
  budget?: number;
  /** Actual spend to date, whole dollars. */
  spend?: number;
  startDate?: string;
  endDate?: string;
  owner?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformCampaignRequest {
  name: string;
  channel?: string;
  status?: PlatformCampaignStatus;
  audience?: string;
  budget?: number;
  spend?: number;
  startDate?: string;
  endDate?: string;
  owner?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdatePlatformCampaignRequest {
  name?: string;
  channel?: string;
  status?: PlatformCampaignStatus;
  audience?: string;
  budget?: number;
  spend?: number;
  startDate?: string;
  endDate?: string;
  owner?: string;
  notes?: string;
  clientId?: string | null;
}

const STATUSES: readonly PlatformCampaignStatus[] =
  [
    "planned",
    "active",
    "paused",
    "completed",
  ];

export function isCampaignStatus(
  value: unknown,
): value is PlatformCampaignStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}

/** Coerces a money amount to a non-negative whole number, or undefined. */
export function normalizeAmount(
  value: unknown,
): number | undefined {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }

  return Math.round(n);
}
