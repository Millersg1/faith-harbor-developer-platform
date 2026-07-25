/**
 * A support ticket belonging to one organization — the tenant-scoped port
 * of the legacy Faith Harbor ticket onto the All Elite Cloud platform, so a
 * tenant runs its own help desk.
 *
 * Like every platform record it carries `organizationId` (stamped from the
 * tenant context, never the caller). A `clientId`, when present, must belong
 * to the same organization — the service enforces it, so a ticket can never
 * reference another tenant's client.
 */
export type PlatformTicketStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "closed";

export type PlatformTicketPriority =
  | "low"
  | "medium"
  | "high"
  | "urgent";

export interface PlatformTicketRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  subject: string;
  description?: string;
  status: PlatformTicketStatus;
  priority: PlatformTicketPriority;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformTicketRequest {
  subject: string;
  description?: string;
  clientId?: string;
  status?: PlatformTicketStatus;
  priority?: PlatformTicketPriority;
  assignee?: string;
}

export interface UpdatePlatformTicketRequest {
  subject?: string;
  description?: string;
  clientId?: string | null;
  status?: PlatformTicketStatus;
  priority?: PlatformTicketPriority;
  assignee?: string;
}

const STATUSES: readonly PlatformTicketStatus[] =
  [
    "open",
    "in_progress",
    "waiting",
    "resolved",
    "closed",
  ];

const PRIORITIES: readonly PlatformTicketPriority[] =
  ["low", "medium", "high", "urgent"];

export function isTicketStatus(
  value: unknown,
): value is PlatformTicketStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}

export function isTicketPriority(
  value: unknown,
): value is PlatformTicketPriority {
  return (
    typeof value === "string" &&
    (PRIORITIES as readonly string[]).includes(
      value,
    )
  );
}
