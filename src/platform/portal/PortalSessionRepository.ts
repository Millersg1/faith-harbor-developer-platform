import type { PgQueryable } from "../../persistence/PgQueryable";
import type { PortalSessionRecord } from "./PortalSession";

interface SessionRow {
  token: string;
  client_user_id: string;
  organization_id: string;
  client_id: string;
  expires_at: string;
  created_at: string;
}

/**
 * Stores portal sessions. Looked up globally by token (no tenant scope),
 * because the token is what identifies the org + client in the first place.
 */
export class PortalSessionRepository {
  private readonly memory =
    new Map<
      string,
      PortalSessionRecord
    >();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  async create(
    session: PortalSessionRecord,
  ): Promise<PortalSessionRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO portal_sessions
           (token, client_user_id, organization_id, client_id,
            expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.token,
          session.clientUserId,
          session.organizationId,
          session.clientId,
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
    PortalSessionRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM portal_sessions WHERE token = $1",
          [token],
        );

      const row = result.rows[0] as
        | unknown as
        | SessionRow
        | undefined;

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
        "DELETE FROM portal_sessions WHERE token = $1",
        [token],
      );

      return;
    }

    this.memory.delete(token);
  }
}

function mapRow(
  row: SessionRow,
): PortalSessionRecord {
  return {
    token: row.token,
    clientUserId: row.client_user_id,
    organizationId:
      row.organization_id,
    clientId: row.client_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
