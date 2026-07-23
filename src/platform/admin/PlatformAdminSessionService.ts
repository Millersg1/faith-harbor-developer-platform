import { randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

export interface AdminSessionRecord {
  token: string;
  adminId: string;
  expiresAt: string;
  createdAt: string;
}

interface AdminSessionRow {
  token: string;
  admin_id: string;
  expires_at: string;
  created_at: string;
}

/**
 * Server-side sessions for platform admins. Kept entirely separate from
 * tenant-user sessions (different table, different cookie), so an admin
 * token can never satisfy a tenant-user route and vice versa.
 */
export class PlatformAdminSessionService {
  private readonly memory =
    new Map<string, AdminSessionRecord>();

  private readonly ttlMs: number;

  private readonly now: () => number;

  constructor(
    private readonly db?: PgQueryable,
    options: {
      ttlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.ttlMs =
      options.ttlMs ??
      12 * 60 * 60 * 1000;
    this.now =
      options.now ?? (() => Date.now());
  }

  async createForAdmin(admin: {
    id: string;
  }): Promise<AdminSessionRecord> {
    const nowMs = this.now();

    const session: AdminSessionRecord =
      {
        token: randomBytes(32).toString(
          "hex",
        ),
        adminId: admin.id,
        expiresAt: new Date(
          nowMs + this.ttlMs,
        ).toISOString(),
        createdAt: new Date(
          nowMs,
        ).toISOString(),
      };

    if (this.db) {
      await this.db.query(
        `INSERT INTO platform_admin_sessions
           (token, admin_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4)`,
        [
          session.token,
          session.adminId,
          session.expiresAt,
          session.createdAt,
        ],
      );
    } else {
      this.memory.set(
        session.token,
        session,
      );
    }

    return session;
  }

  async validate(
    token: string,
  ): Promise<
    AdminSessionRecord | undefined
  > {
    if (!token) {
      return undefined;
    }

    const session =
      await this.find(token);

    if (!session) {
      return undefined;
    }

    if (
      Date.parse(session.expiresAt) <=
      this.now()
    ) {
      await this.revoke(token);
      return undefined;
    }

    return session;
  }

  async revoke(
    token: string,
  ): Promise<void> {
    if (!token) {
      return;
    }

    if (this.db) {
      await this.db.query(
        "DELETE FROM platform_admin_sessions WHERE token = $1",
        [token],
      );
    } else {
      this.memory.delete(token);
    }
  }

  private async find(
    token: string,
  ): Promise<
    AdminSessionRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM platform_admin_sessions WHERE token = $1",
          [token],
        );

      const row = result.rows[0] as
        | unknown as
        | AdminSessionRow
        | undefined;

      return row
        ? {
            token: row.token,
            adminId: row.admin_id,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
          }
        : undefined;
    }

    return this.memory.get(token);
  }
}
