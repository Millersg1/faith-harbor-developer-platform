import type { PlatformUserRepository } from "../users/PlatformUserRepository";
import type { UserVerificationStore } from "./EmailVerificationService";

/**
 * Real {@link UserVerificationStore} over the user repository. It is the ONLY
 * place the repository's internal global-by-id verification methods are used —
 * they are not exposed to routes or other services (no general tenant-boundary
 * bypass). `markVerified` is atomic: it sets email_verified_at only if the
 * user's current normalized email still equals the token's bound email, so an
 * email change racing the confirmation fails safe.
 */
export class PlatformUserVerificationStore
  implements UserVerificationStore
{
  constructor(private readonly users: PlatformUserRepository) {}

  async getEmail(userId: string): Promise<string | undefined> {
    return (await this.users.getByIdUnscoped(userId))?.email;
  }

  async isVerified(userId: string): Promise<boolean> {
    return Boolean(
      (await this.users.getByIdUnscoped(userId))?.emailVerifiedAt,
    );
  }

  async markVerified(
    userId: string,
    normalizedEmail: string,
    at: string,
  ): Promise<boolean> {
    return this.users.markEmailVerifiedIfEmailMatches(
      userId,
      normalizedEmail,
      at,
    );
  }

  async clearVerification(userId: string): Promise<void> {
    await this.users.clearEmailVerifiedUnscoped(userId);
  }
}
