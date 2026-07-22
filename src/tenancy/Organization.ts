/**
 * The lifecycle state of a tenant organization on the platform.
 */
export type OrganizationStatus =
  | "active"
  | "suspended"
  | "cancelled";

/**
 * An organization is a tenant: the top-level owner of an isolated slice
 * of the platform. Every other record in the system will ultimately
 * belong to exactly one organization, and no organization can ever see
 * another's data.
 *
 * `slug` is a URL-safe identifier used for the tenant's subdomain
 * (e.g. `acme` -> `acme.allelitecloud.com`) and must be unique.
 */
export interface OrganizationRecord {
  id: string;

  name: string;

  slug: string;

  status: OrganizationStatus;

  createdAt: string;

  updatedAt: string;
}

export interface CreateOrganizationRequest {
  name: string;

  /**
   * Optional explicit slug. When omitted, one is derived from the name.
   */
  slug?: string;

  status?: OrganizationStatus;
}

/**
 * Normalizes a name or raw slug into a safe tenant slug: lowercase,
 * alphanumeric and single hyphens, no leading/trailing hyphen. Returns
 * an empty string when nothing usable remains (the caller rejects that).
 */
export function normalizeSlug(
  raw: string,
): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
