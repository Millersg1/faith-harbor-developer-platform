/**
 * A program (e.g. a ministry program, class, or recurring event) run by one
 * organization — tenant-scoped port of the legacy ministry program.
 * `organizationId` from context; a `clientId`, when present, must belong to
 * the same organization.
 */
export type PlatformProgramStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";

export interface PlatformProgramRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  name: string;
  category?: string;
  status: PlatformProgramStatus;
  leader?: string;
  schedule?: string;
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformProgramRequest {
  name: string;
  category?: string;
  status?: PlatformProgramStatus;
  leader?: string;
  schedule?: string;
  description?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdatePlatformProgramRequest {
  name?: string;
  category?: string;
  status?: PlatformProgramStatus;
  leader?: string;
  schedule?: string;
  description?: string;
  notes?: string;
  clientId?: string | null;
}

const STATUSES: readonly PlatformProgramStatus[] =
  [
    "planned",
    "active",
    "paused",
    "completed",
  ];

export function isProgramStatus(
  value: unknown,
): value is PlatformProgramStatus {
  return (
    typeof value === "string" &&
    (STATUSES as readonly string[]).includes(
      value,
    )
  );
}
