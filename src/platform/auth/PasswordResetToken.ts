/**
 * A single-use password reset token, scoped to one organization.
 *
 * Only the SHA-256 hash of the token is ever stored — the raw token exists
 * only in the email we send. So even a full database leak can't be used to
 * reset anyone's password: an attacker would still need the emailed secret.
 */
export interface PasswordResetRecord {
  /** SHA-256 hash (hex) of the raw token. The primary key. */
  tokenHash: string;

  organizationId: string;

  userId: string;

  /** ISO timestamp after which the token is no longer valid. */
  expiresAt: string;

  /** ISO timestamp when the token was consumed, or undefined if unused. */
  usedAt?: string;

  createdAt: string;
}
