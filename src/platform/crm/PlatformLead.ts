/**
 * A sales lead in one organization's pipeline — the tenant-scoped port of
 * the legacy Faith Harbor lead onto All Elite Cloud, so a tenant runs its own
 * CRM pipeline.
 *
 * Carries `organizationId` (stamped from tenant context, never the caller). A
 * `clientId`, when present, must belong to the same organization — the
 * service enforces it, so a lead can never reference another tenant's client.
 */
export type PlatformLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export interface PlatformLeadRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  /** Where the lead came from (referral, website, event…). */
  source?: string;
  /** Service the lead is interested in. */
  serviceInterest?: string;
  /** Estimated deal value, in whole dollars. */
  estimatedValue?: number;
  status: PlatformLeadStatus;
  /** Person responsible for the lead. */
  owner?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformLeadRequest {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  serviceInterest?: string;
  estimatedValue?: number;
  status?: PlatformLeadStatus;
  owner?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdatePlatformLeadRequest {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  serviceInterest?: string;
  estimatedValue?: number;
  status?: PlatformLeadStatus;
  owner?: string;
  notes?: string;
  clientId?: string | null;
}

const STATUSES: readonly PlatformLeadStatus[] =
  [
    "new",
    "contacted",
    "qualified",
    "proposal",
    "won",
    "lost",
  ];

export function isLeadStatus(
  value: unknown,
): value is PlatformLeadStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}

/** Coerces an estimated value to a non-negative whole number, or undefined. */
export function normalizeEstimatedValue(
  value: unknown,
): number | undefined {
  const n = Number(value);

  if (
    !Number.isFinite(n) ||
    n < 0
  ) {
    return undefined;
  }

  return Math.round(n);
}
