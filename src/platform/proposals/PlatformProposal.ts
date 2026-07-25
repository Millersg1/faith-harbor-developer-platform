/**
 * A sales proposal / quote in one organization — the tenant-scoped port of
 * Faith Harbor's proposals. It closes the sales loop: a CRM lead becomes a
 * proposal, and an accepted proposal becomes an invoice.
 *
 * Carries `organizationId` (stamped from tenant context, never the caller). A
 * `clientId`, when present, must belong to the same organization.
 */
export type PlatformProposalStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined";

export interface PlatformProposalRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  title: string;
  /** Short summary of the desired outcome. */
  summary?: string;
  /** Full proposal body. */
  body?: string;
  /** Proposed amount, in whole dollars. */
  amount?: number;
  status: PlatformProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformProposalRequest {
  title: string;
  summary?: string;
  body?: string;
  amount?: number;
  status?: PlatformProposalStatus;
  clientId?: string;
}

export interface UpdatePlatformProposalRequest {
  title?: string;
  summary?: string;
  body?: string;
  amount?: number;
  status?: PlatformProposalStatus;
  clientId?: string | null;
}

const STATUSES: readonly PlatformProposalStatus[] =
  [
    "draft",
    "sent",
    "accepted",
    "declined",
  ];

export function isProposalStatus(
  value: unknown,
): value is PlatformProposalStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}

/** Coerces an amount to a non-negative whole number, or undefined. */
export function normalizeProposalAmount(
  value: unknown,
): number | undefined {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }

  return Math.round(n);
}
