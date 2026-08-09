/**
 * Privacy (data-subject) request intake & management.
 *
 * Two destinations, decided by the SERVER from the trusted resolved host (or
 * authenticated context) — never a client-supplied organization id:
 *  - "platform": concerns All Elite Cloud's own account/billing/security/
 *    authentication/platform processing. organization_id is NULL. Managed only
 *    by authorized platform administrators.
 *  - "tenant": concerns a tenant's customers/contacts/visitors/CRM/etc.
 *    organization_id is set. Managed by that tenant's owner/admin (and
 *    authorized platform admins only for genuine operational support).
 */

export type PrivacyDestination = "platform" | "tenant";

/** Request categories — presented as categories, not guaranteed legal rights. */
export const PRIVACY_CATEGORIES = [
  "access",
  "correction",
  "deletion",
  "portability",
  "restriction",
  "opt_out",
  "other",
] as const;
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];
export function isPrivacyCategory(v: string): v is PrivacyCategory {
  return (PRIVACY_CATEGORIES as readonly string[]).includes(v);
}

export const PRIVACY_CATEGORY_LABELS: Record<PrivacyCategory, string> = {
  access: "Access my information",
  correction: "Correct my information",
  deletion: "Delete my information",
  portability: "Get a copy (portability)",
  restriction: "Restrict or object to processing",
  opt_out: "Marketing preference / opt-out",
  other: "Other privacy concern",
};

/** Verification of email control (NOT a claim of full identity). */
export type VerificationState = "unverified" | "email_verified";

/**
 * Explicit lifecycle. New requests start `pending_verification`; verifying the
 * email moves them to `received`. Fulfillment decisions require authorized
 * human review (enforced at the route/service layer).
 */
export const PRIVACY_STATUSES = [
  "pending_verification",
  "received",
  "identity_verification_required",
  "in_review",
  "awaiting_requester",
  "fulfilled",
  "partially_fulfilled",
  "denied",
  "withdrawn",
  "closed",
] as const;
export type PrivacyStatus = (typeof PRIVACY_STATUSES)[number];
export function isPrivacyStatus(v: string): v is PrivacyStatus {
  return (PRIVACY_STATUSES as readonly string[]).includes(v);
}

/**
 * Allowed status transitions, enforced server-side. Any transition not listed
 * fails safely. `pending_verification → received` is performed only by the
 * email-verification flow, not by a manual status change.
 */
export const ALLOWED_TRANSITIONS: Record<PrivacyStatus, PrivacyStatus[]> = {
  pending_verification: ["withdrawn", "closed"],
  received: [
    "in_review",
    "identity_verification_required",
    "withdrawn",
    "closed",
  ],
  identity_verification_required: [
    "in_review",
    "awaiting_requester",
    "denied",
    "withdrawn",
    "closed",
  ],
  in_review: [
    "awaiting_requester",
    "identity_verification_required",
    "fulfilled",
    "partially_fulfilled",
    "denied",
    "withdrawn",
    "closed",
  ],
  awaiting_requester: [
    "in_review",
    "fulfilled",
    "partially_fulfilled",
    "denied",
    "withdrawn",
    "closed",
  ],
  fulfilled: ["closed"],
  partially_fulfilled: ["in_review", "fulfilled", "closed"],
  denied: ["in_review", "closed"],
  withdrawn: ["closed"],
  closed: [],
};

/** Substantive fulfillment decisions requiring authorized human confirmation. */
export const SUBSTANTIVE_STATUSES: PrivacyStatus[] = [
  "fulfilled",
  "partially_fulfilled",
  "denied",
];

export function canTransition(
  from: PrivacyStatus,
  to: PrivacyStatus,
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export interface PrivacyRequestRecord {
  id: string;
  destination: PrivacyDestination;
  /** Set only for tenant requests; NULL for platform requests. */
  organizationId: string | null;
  category: PrivacyCategory;
  name: string;
  /** Normalized (lower-cased, trimmed) requester email. */
  email: string;
  description: string;
  /** Optional self-declared relationship/context (customer, visitor, etc.). */
  relationship: string | null;
  verificationState: VerificationState;
  status: PrivacyStatus;
  assignedTo: string | null;
  resolutionSummary: string | null;
  /** Operational due date; flagged as staff-entered vs policy-derived. */
  dueDate: string | null;
  dueDateSource: "staff" | "policy" | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  deniedAt: string | null;
  closedAt: string | null;
  /**
   * Reserved retention marker. NOT populated and NOT an enforcement mechanism:
   * there is no automated time-based purge for privacy requests (see
   * docs/19_PRIVACY_REQUESTS.md — privacy-request records are compliance
   * evidence retained as long as reasonably necessary). Always null today.
   */
  purgeAfter: string | null;
  /** Honest, persisted verification-email delivery state (no PII, no tokens). */
  verifyEmailState: VerifyEmailState;
  /** Short, non-PII last delivery error (e.g. transport status), or null. */
  verifyEmailError: string | null;
  /** How many verification-email attempts have been made. */
  verifyEmailAttempts: number;
  /** ISO timestamp of the last verification-email attempt, or null. */
  verifyEmailLastAt: string | null;
  /** Never expose raw tokens; only hashes are stored (see repository). */
}

/**
 * Verification-email delivery state. `pending` before any attempt; `sent` when
 * a transport accepted it; `logged` when no provider is configured (recorded
 * but NOT actually delivered — never claimed as sent); `failed` on error.
 */
export type VerifyEmailState = "pending" | "sent" | "logged" | "failed";

/** A timeline entry: an internal note or a requester-facing message. */
export interface PrivacyRequestNote {
  id: string;
  requestId: string;
  visibility: "internal" | "requester";
  authorId: string | null;
  body: string;
  createdAt: string;
}
