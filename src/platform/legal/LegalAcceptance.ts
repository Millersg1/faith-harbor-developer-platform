import type { LegalKind } from "./PlatformLegalDocument";

/**
 * Defensible evidence that a specific user accepted a specific version of a
 * platform legal document. Tenant-scoped (organization_id) and append-only:
 * publishing a new document version never rewrites past acceptance rows, so
 * the record of what was agreed, and when, is preserved.
 *
 * We store only what is needed as evidence — who, which document + exact
 * version, when, through what flow, and the request IP — and nothing more.
 */
export interface LegalAcceptanceRecord {
  id: string;
  organizationId: string;
  userId: string;
  documentKind: LegalKind;
  documentVersion: number;
  acceptedAt: string;
  /** The flow the acceptance came through, e.g. "signup" or "reconsent". */
  source: string;
  ip: string | null;
}

/** The kinds a user must affirmatively accept to use the platform. */
export const REQUIRED_ACCEPTANCE_KINDS: LegalKind[] = [
  "terms",
  "privacy",
];
