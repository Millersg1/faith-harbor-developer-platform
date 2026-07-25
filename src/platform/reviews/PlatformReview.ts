/**
 * A customer review tracked by one organization — the tenant-scoped port of
 * Faith Harbor's review monitoring onto All Elite Cloud (reputation
 * management).
 *
 * Carries `organizationId` (stamped from tenant context, never the caller). A
 * `clientId`, when present, must belong to the same organization — so a
 * review can never reference another tenant's client.
 */
export interface PlatformReviewRecord {
  id: string;
  organizationId: string;
  clientId?: string;
  /** Reviewer name. */
  author: string;
  /** 1–5 star rating. */
  rating: number;
  comment?: string;
  /** Where the review came from, e.g. "Google", "Facebook", "Yelp". */
  source?: string;
  /** Whether a reply has been posted. */
  replied: boolean;
  replyText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformReviewRequest {
  author: string;
  rating: number;
  comment?: string;
  source?: string;
  clientId?: string;
  replyText?: string;
}

export interface UpdatePlatformReviewRequest {
  author?: string;
  rating?: number;
  comment?: string;
  source?: string;
  clientId?: string | null;
  replyText?: string;
}

/** Clamps a rating to an integer 1–5 (defaults to 5 when unparseable). */
export function normalizeRating(
  value: unknown,
): number {
  const n = Math.round(Number(value));

  if (!Number.isFinite(n)) {
    return 5;
  }

  return Math.min(5, Math.max(1, n));
}
