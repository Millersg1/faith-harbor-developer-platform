/**
 * Tenant legal documents — each All Elite Cloud organization's OWN legal pages
 * for its website(s). Entirely separate from All Elite Cloud's platform-level
 * (Faith Harbor LLC) policies: different tables, different routes, tenant-scoped
 * and fail-closed. Generated content is a customizable starting template, not
 * legal advice and not attorney-approved.
 */

/** The tenant legal document kinds and their stable public URL slugs. */
export const TENANT_LEGAL_KINDS = [
  "privacy",
  "terms",
  "cookies",
  "refund",
  "acceptable-use",
  "accessibility",
  "ai-disclosure",
  "subprocessors",
] as const;

export type TenantLegalKind =
  (typeof TENANT_LEGAL_KINDS)[number];

export function isTenantLegalKind(
  value: string,
): value is TenantLegalKind {
  return (TENANT_LEGAL_KINDS as readonly string[]).includes(value);
}

export interface TenantLegalKindMeta {
  kind: TenantLegalKind;
  /** Stable public path on the tenant's own site (host-resolved). */
  slug: string;
  title: string;
  order: number;
}

export const TENANT_LEGAL_META: Record<
  TenantLegalKind,
  TenantLegalKindMeta
> = {
  privacy: {
    kind: "privacy",
    slug: "privacy",
    title: "Privacy Policy",
    order: 1,
  },
  terms: {
    kind: "terms",
    slug: "terms",
    title: "Terms and Conditions",
    order: 2,
  },
  cookies: {
    kind: "cookies",
    slug: "cookies",
    title: "Cookie Policy",
    order: 3,
  },
  refund: {
    kind: "refund",
    slug: "refund-policy",
    title: "Cancellation and Refund Policy",
    order: 4,
  },
  "acceptable-use": {
    kind: "acceptable-use",
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    order: 5,
  },
  accessibility: {
    kind: "accessibility",
    slug: "accessibility",
    title: "Accessibility Statement",
    order: 6,
  },
  "ai-disclosure": {
    kind: "ai-disclosure",
    slug: "ai-disclosure",
    title: "AI Disclosure",
    order: 7,
  },
  subprocessors: {
    kind: "subprocessors",
    slug: "subprocessors",
    title: "Service Provider Disclosure",
    order: 8,
  },
};

/** Map a public slug (e.g. "refund-policy") back to a kind. */
export function kindForSlug(
  slug: string,
): TenantLegalKind | undefined {
  return Object.values(TENANT_LEGAL_META).find(
    (m) => m.slug === slug,
  )?.kind;
}

export function tenantLegalKindsInOrder(): TenantLegalKindMeta[] {
  return Object.values(TENANT_LEGAL_META).sort(
    (a, b) => a.order - b.order,
  );
}

/**
 * Lifecycle: draft → (human_reviewed) → published. Publishing a newer version
 * supersedes the previous published one. `unpublished` removes a document from
 * public view without deleting the version. `archived` retires a non-published
 * version. Published versions are immutable.
 */
export type TenantLegalStatus =
  | "draft"
  | "published"
  | "superseded"
  | "unpublished"
  | "archived";

export interface TenantLegalDocumentRecord {
  id: string;
  organizationId: string;
  kind: TenantLegalKind;
  version: number;
  title: string;
  bodyMarkdown: string;
  status: TenantLegalStatus;
  /** True once an owner/admin acknowledged a human review of the draft. */
  humanReviewed: boolean;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string | null;
}
