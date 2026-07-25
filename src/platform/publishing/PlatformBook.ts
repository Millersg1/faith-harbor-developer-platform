/**
 * A book in one organization's publishing pipeline — tenant-scoped port of
 * the legacy book. `organizationId` from context; a `clientId`, when present,
 * must belong to the same organization.
 */
export type PlatformBookStatus =
  | "draft"
  | "editing"
  | "design"
  | "proof"
  | "published"
  | "archived";

export interface PlatformBookRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  title: string;
  subtitle?: string;
  author?: string;
  status: PlatformBookStatus;
  format?: string;
  isbn?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformBookRequest {
  title: string;
  subtitle?: string;
  author?: string;
  status?: PlatformBookStatus;
  format?: string;
  isbn?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdatePlatformBookRequest {
  title?: string;
  subtitle?: string;
  author?: string;
  status?: PlatformBookStatus;
  format?: string;
  isbn?: string;
  notes?: string;
  clientId?: string | null;
}

const STATUSES: readonly PlatformBookStatus[] =
  [
    "draft",
    "editing",
    "design",
    "proof",
    "published",
    "archived",
  ];

export function isBookStatus(
  value: unknown,
): value is PlatformBookStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}
