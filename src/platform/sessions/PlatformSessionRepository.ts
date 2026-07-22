import type { PgQueryable } from "../../persistence/PgQueryable";
import type { PlatformSessionRecord } from "./PlatformSession";

interface SessionRow {
  token: string;
  user_id: string;
  organization_id: string;
  expires_at: string;
  created_at: string;
}

/**
 * Stores sessions, keyed by token.
 *
 * Unlike the tenant-scoped repositories, this one is looked up by token
 * *before* any tenant is known — validating a token is exactly how the
 * tenant gets established. The session itself carries the organization,
 * so no cross-tenant lookup is possible: a token only ever resolves to
 * the one org it was minted for.
 */
export class PlatformSessionRepository {
  private readonly memory =
    new Map<
      string,
      PlatformSessionRecord
    >();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  async create(
    session: PlatformSessionRecord,
  ): Promise<PlatformSessionRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO sessions
           (token, user_id, organization_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          session.token,
          session.userId,
          session.organizationId,
          session.expiresAt,
          session.createdAt,
        ],
      );

      return session;
    }

    this.memory.set(
      session.token,
      session,
    );

    return session;
  }

  async findByToken(
    token: string,
  ): Promise<
    PlatformSessionRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM sessions WHERE token = $1",
          [token],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    return this.memory.get(token);
  }

  async delete(
    token: string,
  ): Promise<void> {
    if (this.db) {
      await this.db.query(
        "DELETE FROM sessions WHERE token = $1",
        [token],
      );

      return;
    }

    this.memory.delete(token);
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): SessionRow | undefined {
  return row as SessionRow | undefined;
}

function mapRow(
  row: SessionRow,
): PlatformSessionRecord {
  return {
    token: row.token,
    userId: row.user_id,
    organizationId:
      row.organization_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
