import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { ClientUserRecord } from "./ClientUser";

interface ClientUserRow {
  id: string;
  organization_id: string;
  client_id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/**
 * Stores client-portal logins, always scoped to the current tenant. A tenant
 * only ever sees or authenticates its own client users.
 */
export class ClientUserRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, ClientUserRecord>();

  async create(
    user: Omit<
      ClientUserRecord,
      "organizationId"
    >,
  ): Promise<ClientUserRecord> {
    const organizationId =
      this.tenantId();

    const record: ClientUserRecord = {
      ...user,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO portal_users
           (id, organization_id, client_id, email, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.id,
          record.organizationId,
          record.clientId,
          record.email,
          record.passwordHash,
          record.createdAt,
        ],
      );

      return record;
    }

    this.memory.set(
      record.id,
      record,
    );

    return record;
  }

  async findByEmail(
    email: string,
  ): Promise<
    ClientUserRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM portal_users WHERE organization_id = $1 AND email = $2",
          [organizationId, email],
        );

      const row = result.rows[0] as
        | unknown as
        | ClientUserRow
        | undefined;

      return row
        ? mapRow(row)
        : undefined;
    }

    for (const u of this.memory.values()) {
      if (
        u.organizationId ===
          organizationId &&
        u.email === email
      ) {
        return u;
      }
    }

    return undefined;
  }

  async list(): Promise<
    ClientUserRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM portal_users
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return (
        result.rows as unknown as ClientUserRow[]
      ).map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (u) =>
        u.organizationId ===
        organizationId,
    );
  }

  async updatePassword(
    id: string,
    passwordHash: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "UPDATE portal_users SET password_hash = $3 WHERE id = $1 AND organization_id = $2",
        [
          id,
          organizationId,
          passwordHash,
        ],
      );

      return;
    }

    const existing =
      this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(id, {
        ...existing,
        passwordHash,
      });
    }
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM portal_users WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing =
      this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function mapRow(
  row: ClientUserRow,
): ClientUserRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    clientId: row.client_id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}
