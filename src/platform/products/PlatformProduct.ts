/**
 * A software product / repository tracked by one organization — tenant-scoped
 * port of the legacy engineering product. `organizationId` is stamped from
 * context; a `clientId`, when present, must belong to the same organization.
 */
export type PlatformProductStatus =
  | "planning"
  | "active"
  | "maintenance"
  | "archived";

export interface PlatformProductRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  name: string;
  description?: string;
  status: PlatformProductStatus;
  repoUrl?: string;
  language?: string;
  version?: string;
  owner?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformProductRequest {
  name: string;
  description?: string;
  status?: PlatformProductStatus;
  repoUrl?: string;
  language?: string;
  version?: string;
  owner?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdatePlatformProductRequest {
  name?: string;
  description?: string;
  status?: PlatformProductStatus;
  repoUrl?: string;
  language?: string;
  version?: string;
  owner?: string;
  notes?: string;
  clientId?: string | null;
}

const STATUSES: readonly PlatformProductStatus[] =
  [
    "planning",
    "active",
    "maintenance",
    "archived",
  ];

export function isProductStatus(
  value: unknown,
): value is PlatformProductStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}
