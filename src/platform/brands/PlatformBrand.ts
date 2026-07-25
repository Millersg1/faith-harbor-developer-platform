/**
 * A brand run by one organization — the tenant-scoped port of Faith Harbor's
 * multi-brand concept. A tenant can operate several brands (each with its own
 * name, domain, and email voice) under one workspace.
 *
 * Carries `organizationId` (stamped from tenant context, never the caller).
 */
export interface PlatformBrandRecord {
  id: string;
  organizationId: string;
  name: string;
  /** Primary domain, e.g. "yourbrand.com". */
  domain?: string;
  /** The "from" address for automated email sent on this brand's behalf. */
  fromEmail?: string;
  /** Signature/closing used on this brand's automated email. */
  emailSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformBrandRequest {
  name: string;
  domain?: string;
  fromEmail?: string;
  emailSignature?: string;
}

export interface UpdatePlatformBrandRequest {
  name?: string;
  domain?: string;
  fromEmail?: string;
  emailSignature?: string;
}
