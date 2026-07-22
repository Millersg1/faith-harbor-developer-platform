import { randomBytes } from "node:crypto";

import type { PlatformSessionRecord } from "./PlatformSession";
import { PlatformSessionRepository } from "./PlatformSessionRepository";

const DEFAULT_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

export interface PlatformSessionOptions {
  /**
   * Session lifetime in milliseconds. Defaults to 7 days.
   */
  ttlMs?: number;

  /**
   * Clock injection for tests. Defaults to the real clock.
   */
  now?: () => number;
}

/**
 * Issues and validates login sessions.
 *
 * Sessions are server-side (stored, revocable) rather than stateless
 * tokens, so a logout or a compromise can be revoked immediately. The
 * token is a 256-bit random secret; the session it maps to carries the
 * user and organization.
 */
export class PlatformSessionService {
  private readonly ttlMs: number;

  private readonly now: () => number;

  constructor(
    private readonly repository =
      new PlatformSessionRepository(),
    options: PlatformSessionOptions = {},
  ) {
    this.ttlMs =
      options.ttlMs ?? DEFAULT_TTL_MS;
    this.now =
      options.now ?? (() => Date.now());
  }

  /**
   * Creates a session for a user and returns it (its token is the
   * secret to hand back to the client).
   */
  async createForUser(user: {
    id: string;
    organizationId: string;
  }): Promise<PlatformSessionRecord> {
    const nowMs = this.now();

    const session: PlatformSessionRecord =
      {
        token: randomBytes(32).toString(
          "hex",
        ),
        userId: user.id,
        organizationId:
          user.organizationId,
        expiresAt: new Date(
          nowMs + this.ttlMs,
        ).toISOString(),
        createdAt: new Date(
          nowMs,
        ).toISOString(),
      };

    return this.repository.create(
      session,
    );
  }

  /**
   * Returns the session for a token when it exists and has not expired.
   * An expired session is deleted and treated as absent.
   */
  async validate(
    token: string,
  ): Promise<
    PlatformSessionRecord | undefined
  > {
    if (!token) {
      return undefined;
    }

    const session =
      await this.repository.findByToken(
        token,
      );

    if (!session) {
      return undefined;
    }

    if (
      Date.parse(session.expiresAt) <=
      this.now()
    ) {
      await this.repository.delete(
        token,
      );

      return undefined;
    }

    return session;
  }

  /**
   * Revokes a session (logout).
   */
  async revoke(
    token: string,
  ): Promise<void> {
    if (token) {
      await this.repository.delete(
        token,
      );
    }
  }
}
