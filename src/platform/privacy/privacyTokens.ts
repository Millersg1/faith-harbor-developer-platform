import { createHash, randomBytes } from "node:crypto";

/**
 * High-entropy tokens for the privacy-request workflow. Two kinds:
 *  - verification token: emailed once, single-use, time-limited; proves the
 *    requester controls the email address (NOT full identity).
 *  - status token: a separate, long-lived-but-revocable capability that lets a
 *    verified requester view a limited status page (unguessable, not an id).
 *
 * We follow the established reset-token convention: generate a 256-bit random
 * token, hand the raw token to the requester ONCE, and persist only its
 * SHA-256 hash. Raw tokens are never stored, never logged, never audited.
 */

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-ish comparison is unnecessary here (lookup is by hash), but we
 * still compare hashes, never raw tokens. */
export function tokenMatchesHash(
  token: string,
  hash: string | null | undefined,
): boolean {
  return !!hash && hashToken(token) === hash;
}
