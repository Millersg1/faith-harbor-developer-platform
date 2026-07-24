/**
 * An AI-generated website belonging to one organization — the heart of the
 * All Elite Cloud website builder. A tenant builds sites for itself, and
 * (via `clientId`) for its own clients, each to be published on their own
 * domain.
 *
 * Unlike a hosting account (the infrastructure record), a website owns
 * *content*: the brief it was generated from and the generated HTML. It is
 * deliberately white-label — generation is grounded in the site's own
 * business brief, never in Faith Harbor's identity — so a client's site is
 * theirs, not a Faith Harbor page.
 *
 * `organizationId` is stamped from the tenant context, never the caller. A
 * `clientId`, when present, must belong to the same organization.
 */
export type PlatformWebsiteStatus =
  | "draft"
  | "published";

export interface PlatformWebsiteRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  /** Display name of the site (e.g. the business name). */
  name: string;
  /** The business/brief description the site is generated from. */
  brief?: string;
  /** Preferred accent color, passed to the generator. */
  accentColor?: string;
  /** The generated HTML document (undefined until first generated). */
  html?: string;
  status: PlatformWebsiteStatus;
  /** Domain the site is published on, once published. */
  domain?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformWebsiteRequest {
  name: string;
  brief?: string;
  accentColor?: string;
  clientId?: string;
}

export interface UpdatePlatformWebsiteRequest {
  name?: string;
  brief?: string;
  accentColor?: string;
  clientId?: string | null;
  html?: string;
  status?: PlatformWebsiteStatus;
  domain?: string;
}
