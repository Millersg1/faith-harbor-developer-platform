import { randomBytes } from "node:crypto";

import type { PortalSessionRecord } from "./PortalSession";
import { PortalSessionRepository } from "./PortalSessionRepository";

const DEFAULT_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

/**
 * Issues and validates client-portal sessions. Server-side and revocable,
 * mirroring the platform team session service; the token is a 256-bit secret.
 */
export class PortalSessionService {
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly repository =
      new PortalSessionRepository(),
    options: {
      ttlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.ttlMs =
      options.ttlMs ?? DEFAULT_TTL_MS;
    this.now =
      options.now ??
      (() => Date.now());
  }

  async createForClientUser(user: {
    id: string;
    organizationId: string;
    clientId: string;
  }): Promise<PortalSessionRecord> {
    const nowMs = this.now();

    return this.repository.create({
      token: randomBytes(32).toString(
        "hex",
      ),
      clientUserId: user.id,
      organizationId:
        user.organizationId,
      clientId: user.clientId,
      expiresAt: new Date(
        nowMs + this.ttlMs,
      ).toISOString(),
      createdAt: new Date(
        nowMs,
      ).toISOString(),
    });
  }

  async validate(
    token: string,
  ): Promise<
    PortalSessionRecord | undefined
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
