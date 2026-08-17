/**
 * Platform-level ("All Elite Cloud's own") legal documents.
 *
 * These are global, not tenant-scoped: there is exactly one set of platform
 * legal documents, managed only by platform owners (the `aec_admin`
 * identity), and published at stable `/legal/*` URLs. Tenant website legal
 * pages are a separate, tenant-scoped concern handled elsewhere.
 *
 * Published versions are immutable. Editing a published document creates a
 * new draft version; the published one is never mutated in place.
 */

/** The eight platform legal document kinds and their public URL slugs. */
export const LEGAL_KINDS = [
  "terms",
  "privacy",
  "acceptable-use",
  "cookies",
  "subscriptions",
  "ai-policy",
  "subprocessors",
  "accessibility",
  "domain-registration",
] as const;

export type LegalKind = (typeof LEGAL_KINDS)[number];

export function isLegalKind(value: string): value is LegalKind {
  return (LEGAL_KINDS as readonly string[]).includes(value);
}

/**
 * Document lifecycle. `draft` → optional `legal_review` → `published`.
 * Publishing a newer version marks the previous published one `superseded`.
 * `archived` removes a draft/superseded doc from active management.
 */
export type LegalStatus =
  | "draft"
  | "legal_review"
  | "published"
  | "superseded"
  | "archived";

export interface PlatformLegalDocumentRecord {
  id: string;
  kind: LegalKind;
  version: number;
  title: string;
  /** Plain-language introduction shown above the document body. */
  summary: string;
  /** The document body as Markdown (rendered with the safe renderer). */
  bodyMarkdown: string;
  status: LegalStatus;
  /** ISO date the version takes/took effect (set when scheduled/published). */
  effectiveDate: string | null;
  /**
   * When true, users must re-accept this version even if they accepted an
   * earlier one. Existing users are never locked out unless this is set.
   */
  requiresReconsent: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Platform-admin id that created this version (best-effort provenance). */
  createdBy: string | null;
}

/** Human metadata for each kind: public title and ordering in the index. */
export interface LegalKindMeta {
  kind: LegalKind;
  slug: LegalKind;
  title: string;
  order: number;
}

export const LEGAL_KIND_META: Record<LegalKind, LegalKindMeta> = {
  terms: {
    kind: "terms",
    slug: "terms",
    title: "Terms of Service",
    order: 1,
  },
  privacy: {
    kind: "privacy",
    slug: "privacy",
    title: "Privacy Policy",
    order: 2,
  },
  "acceptable-use": {
    kind: "acceptable-use",
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    order: 3,
  },
  cookies: {
    kind: "cookies",
    slug: "cookies",
    title: "Cookie Policy",
    order: 4,
  },
  subscriptions: {
    kind: "subscriptions",
    slug: "subscriptions",
    title: "Subscription, Cancellation, and Refund Policy",
    order: 5,
  },
  "ai-policy": {
    kind: "ai-policy",
    slug: "ai-policy",
    title: "AI Use and Human Review Policy",
    order: 6,
  },
  subprocessors: {
    kind: "subprocessors",
    slug: "subprocessors",
    title: "Subprocessor List",
    order: 7,
  },
  accessibility: {
    kind: "accessibility",
    slug: "accessibility",
    title: "Accessibility Statement",
    order: 8,
  },
  "domain-registration": {
    kind: "domain-registration",
    slug: "domain-registration",
    title: "Domain Registration Terms",
    order: 9,
  },
};

export function legalKindsInOrder(): LegalKindMeta[] {
  return Object.values(LEGAL_KIND_META).sort(
    (a, b) => a.order - b.order,
  );
}
