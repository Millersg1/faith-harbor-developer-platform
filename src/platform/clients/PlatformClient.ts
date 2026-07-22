/**
 * The lifecycle state of a client on the platform.
 */
export type PlatformClientStatus =
  | "active"
  | "archived";

/**
 * A client (customer/contact) belonging to one organization.
 *
 * This is the first tenant-scoped entity of the All Elite Cloud platform.
 * `organizationId` is the tenant key present on every platform record;
 * it is never accepted from callers — the repository stamps it from the
 * current tenant context — so a client can only ever be created inside
 * the organization that is acting.
 */
export interface PlatformClientRecord {
  id: string;

  organizationId: string;

  name: string;

  email?: string;

  company?: string;

  status: PlatformClientStatus;

  createdAt: string;

  updatedAt: string;
}

export interface CreatePlatformClientRequest {
  name: string;
  email?: string;
  company?: string;
  status?: PlatformClientStatus;
}

export interface UpdatePlatformClientRequest {
  name?: string;
  email?: string;
  company?: string;
  status?: PlatformClientStatus;
}
