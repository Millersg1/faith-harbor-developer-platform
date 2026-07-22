/**
 * The lifecycle state of a project on the platform.
 */
export type PlatformProjectStatus =
  | "active"
  | "on_hold"
  | "completed"
  | "archived";

/**
 * A project belonging to one organization, optionally attached to one of
 * that organization's clients.
 *
 * Like every platform record it carries `organizationId` (stamped from
 * the tenant context, never from the caller). A `clientId`, when present,
 * must belong to the *same* organization — the service enforces that, so
 * a project can never reference another tenant's client.
 */
export interface PlatformProjectRecord {
  id: string;

  organizationId: string;

  clientId?: string;

  name: string;

  description?: string;

  status: PlatformProjectStatus;

  dueDate?: string;

  createdAt: string;

  updatedAt: string;
}

export interface CreatePlatformProjectRequest {
  name: string;
  clientId?: string;
  description?: string;
  status?: PlatformProjectStatus;
  dueDate?: string;
}

export interface UpdatePlatformProjectRequest {
  name?: string;
  clientId?: string | null;
  description?: string;
  status?: PlatformProjectStatus;
  dueDate?: string | null;
}
