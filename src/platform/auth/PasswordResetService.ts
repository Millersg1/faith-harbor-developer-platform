import {
  createHash,
  randomBytes,
} from "node:crypto";

import type { PlatformUserRecord } from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import { PasswordResetRepository } from "./PasswordResetRepository";

const DEFAULT_TTL_MS =
  60 * 60 * 1000; // 1 hour

export interface PasswordResetOptions {
  /** Token lifetime in milliseconds. Defaults to 1 hour. */
  ttlMs?: number;

  /** Clock injection for tests. Defaults to the real clock. */
  now?: () => number;
}

/**
 * Drives the forgot-password flow.
 *
 * A request mints a single-use, time-limited token; only its SHA-256 hash is
 * stored, so the raw secret lives only in the email we send. Resetting
 * verifies the token, sets the new password, and burns the token (plus any
 * siblings for that user). Every lookup is tenant-scoped, so a token minted
 * for one organization can never reset a password in another.
 */
export class PasswordResetService {
  private readonly ttlMs: number;

  private readonly now: () => number;

  constructor(
    private readonly repository: PasswordResetRepository,
    private readonly users: PlatformUserService,
    options: PasswordResetOptions = {},
  ) {
    this.ttlMs =
      options.ttlMs ?? DEFAULT_TTL_MS;
    this.now =
      options.now ??
      (() => Date.now());
  }

  /**
   * Begins a reset for the given email. Returns the raw token and the user
   * when a matching active user exists in the current tenant; otherwise
   * undefined. Callers MUST respond identically either way so the endpoint
   * can't be used to discover which emails have accounts.
   */
  async request(
    email: string,
  ): Promise<
    | {
        token: string;
        user: PlatformUserRecord;
      }
    | undefined
  > {
    const user =
      await this.users.findByEmail(
        email,
      );

    if (
      !user ||
      user.status !== "active"
    ) {
      return undefined;
    }

    // Invalidate any outstanding tokens so only the newest link works.
    await this.repository.deleteForUser(
      user.id,
    );

    const token = randomBytes(
      32,
    ).toString("hex");
    const nowMs = this.now();

    await this.repository.create({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(
        nowMs + this.ttlMs,
      ).toISOString(),
      createdAt: new Date(
        nowMs,
      ).toISOString(),
    });

    return { token, user };
  }

  /**
   * Consumes a reset token and sets the new password. Throws a uniform
   * "invalid or expired" error for an unknown, expired, or already-used
   * token; throws a validation error for a too-short password.
   */
  async reset(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const invalid = new Error(
      "This reset link is invalid or has expired.",
    );

    if (!token) {
      throw invalid;
    }

    if (
      !newPassword ||
      newPassword.length < 8
    ) {
      throw new Error(
        "New password must be at least 8 characters.",
      );
    }

    const record =
      await this.repository.findByHash(
        hashToken(token),
      );

    if (
      !record ||
      record.usedAt ||
      Date.parse(record.expiresAt) <=
        this.now()
    ) {
      throw invalid;
    }

    await this.users.setPassword(
      record.userId,
      newPassword,
    );

    // Burn this token and any siblings so the link can't be reused.
    await this.repository.markUsed(
      record.tokenHash,
      new Date(
        this.now(),
      ).toISOString(),
    );
    await this.repository.deleteForUser(
      record.userId,
    );
  }
}

/**
 * SHA-256 of the raw token. What we store, so a DB leak reveals no usable
 * secret.
 */
function hashToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}
